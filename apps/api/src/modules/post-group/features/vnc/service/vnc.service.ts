import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';

interface VncUserSession {
  display: number;
  vncPort: number;
  wsPort: number;
  xvfbProc: ChildProcess | null;
  x11vncProc: ChildProcess | null;
  websockifyProc: ChildProcess | null;
  phase: 'login' | 'monitor' | 'idle';
  monitorTimer: NodeJS.Timeout | null;
}

const DISPLAY_START = 10;
const WS_PORT_START = 6080;
const MONITOR_IDLE_MS = 10 * 60 * 1000;

@Injectable()
export class VncService implements OnModuleDestroy {
  readonly isLinux = os.platform() === 'linux';

  private readonly sessions = new Map<number, VncUserSession>();
  private nextDisplay = DISPLAY_START;

  getDisplay(userId: number): number | null {
    if (!this.isLinux) return null;
    return this.sessions.get(userId)?.display ?? null;
  }

  getStatus(userId: number): { phase: string | null; wsPort: number | null; isLinux: boolean } {
    const s = this.sessions.get(userId);
    return {
      phase: s?.phase ?? null,
      wsPort: s?.wsPort ?? null,
      isLinux: this.isLinux,
    };
  }

  private getOrCreate(userId: number): VncUserSession {
    if (!this.sessions.has(userId)) {
      const display = this.nextDisplay++;
      this.sessions.set(userId, {
        display,
        vncPort: 5900 + display,
        wsPort: WS_PORT_START + (display - DISPLAY_START),
        xvfbProc: null,
        x11vncProc: null,
        websockifyProc: null,
        phase: 'idle',
        monitorTimer: null,
      });
    }
    return this.sessions.get(userId)!;
  }

  private async startXvfb(s: VncUserSession): Promise<void> {
    if (s.xvfbProc && !s.xvfbProc.killed) return;
    s.xvfbProc = spawn('Xvfb', [`:${s.display}`, '-screen', '0', '1280x900x24'], {
      detached: false,
      stdio: 'ignore',
    });
    await new Promise((r) => setTimeout(r, 1200));
  }

  async startLoginSession(userId: number, vncPass: string): Promise<{ wsPort: number; display: number }> {
    if (!this.isLinux) throw new Error('VNC chỉ hỗ trợ trên Linux.');
    const s = this.getOrCreate(userId);

    await this.startXvfb(s);

    this.killProc(s.x11vncProc);
    s.x11vncProc = spawn('x11vnc', [
      '-display', `:${s.display}`,
      '-passwd', vncPass,
      '-rfbport', String(s.vncPort),
      '-forever', '-nopw', '-shared', '-quiet',
    ], { detached: false, stdio: 'ignore' });

    this.killProc(s.websockifyProc);
    s.websockifyProc = spawn('websockify', [
      '--web', '/usr/share/novnc',
      String(s.wsPort),
      `localhost:${s.vncPort}`,
    ], { detached: false, stdio: 'ignore' });

    s.phase = 'login';
    return { wsPort: s.wsPort, display: s.display };
  }

  stopLoginSession(userId: number): void {
    const s = this.sessions.get(userId);
    if (!s) return;
    this.killProc(s.x11vncProc); s.x11vncProc = null;
    this.killProc(s.websockifyProc); s.websockifyProc = null;
    s.phase = 'idle';
  }

  // view-only — server-enforced, không cần password
  async startMonitor(userId: number): Promise<{ wsPort: number }> {
    if (!this.isLinux) throw new Error('VNC chỉ hỗ trợ trên Linux.');
    const s = this.sessions.get(userId);
    if (!s?.xvfbProc || s.xvfbProc.killed) {
      throw new Error('Chưa có phiên Xvfb. Vui lòng đăng nhập Facebook qua VNC trước.');
    }

    this.killProc(s.x11vncProc);
    s.x11vncProc = spawn('x11vnc', [
      '-display', `:${s.display}`,
      '-rfbport', String(s.vncPort),
      '-forever', '-nopw', '-shared', '-viewonly', '-quiet',
    ], { detached: false, stdio: 'ignore' });

    this.killProc(s.websockifyProc);
    s.websockifyProc = spawn('websockify', [
      '--web', '/usr/share/novnc',
      String(s.wsPort),
      `localhost:${s.vncPort}`,
    ], { detached: false, stdio: 'ignore' });

    s.phase = 'monitor';
    this.resetMonitorTimer(userId, s);
    return { wsPort: s.wsPort };
  }

  touchMonitor(userId: number): void {
    const s = this.sessions.get(userId);
    if (!s || s.phase !== 'monitor') return;
    this.resetMonitorTimer(userId, s);
  }

  stopMonitor(userId: number): void {
    const s = this.sessions.get(userId);
    if (!s) return;
    if (s.monitorTimer) { clearTimeout(s.monitorTimer); s.monitorTimer = null; }
    this.killProc(s.x11vncProc); s.x11vncProc = null;
    this.killProc(s.websockifyProc); s.websockifyProc = null;
    s.phase = 'idle';
  }

  private resetMonitorTimer(userId: number, s: VncUserSession): void {
    if (s.monitorTimer) clearTimeout(s.monitorTimer);
    s.monitorTimer = setTimeout(() => {
      this.stopMonitor(userId);
      console.log(`[VNC] Auto-close monitor user=${userId} (idle 10min)`);
    }, MONITOR_IDLE_MS);
  }

  private killProc(proc: ChildProcess | null | undefined): void {
    if (!proc) return;
    try { proc.kill('SIGTERM'); } catch {}
  }

  async onModuleDestroy(): Promise<void> {
    for (const s of this.sessions.values()) {
      this.killProc(s.x11vncProc);
      this.killProc(s.websockifyProc);
      this.killProc(s.xvfbProc);
    }
  }
}
