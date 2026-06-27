import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { UserSessionStore } from './user-session.store';
import { VncService } from '../../vnc/service/vnc.service';

const SESSIONS_DIR = path.join(process.cwd(), 'sessions');
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const UNAUTHENTICATED_PATTERNS = ['/login', '/checkpoint', '/two_step_verification', '/recover', '/captcha'];

// Đọc proxy từ env, ví dụ: PROXY_URL=socks5://localhost:1080
const PROXY_URL = process.env.PROXY_URL || null;
if (PROXY_URL) console.log(`[Browser] Using proxy: ${PROXY_URL}`);

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private sharedBrowser: Browser | null = null;
  private browserInitPromise: Promise<void> | null = null;
  private readonly userBrowsers = new Map<number, Browser>();
  private readonly userBrowserInitPromises = new Map<number, Promise<Browser>>();
  private readonly pageLocks = new Map<number, Promise<void>>();

  constructor(
    private readonly store: UserSessionStore,
    @Optional() private readonly vnc?: VncService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  getFbAuthFile(userId: number): string {
    const dir = path.join(SESSIONS_DIR, String(userId));
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'fb.json');
  }

  hasSavedSession(userId: number): boolean {
    return fs.existsSync(this.getFbAuthFile(userId));
  }

  looksLoggedOut(url: string): boolean {
    try { url = new URL(url).pathname; } catch {}
    return UNAUTHENTICATED_PATTERNS.some((p) => url.includes(p));
  }

  getPageUrl(userId: number): string | null {
    const s = this.store.get(userId);
    if (!s.page || s.page.isClosed()) return null;
    try { return s.page.url(); } catch { return null; }
  }

  randomDelay(minMs: number, maxMs: number): Promise<void> {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─── Browser ──────────────────────────────────────────────────────────────

  private async ensureSharedBrowser(): Promise<Browser> {
    if (this.sharedBrowser?.isConnected()) return this.sharedBrowser;
    if (!this.browserInitPromise) {
      this.browserInitPromise = (async () => {
        this.sharedBrowser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          ...(PROXY_URL ? { proxy: { server: PROXY_URL } } : {}),
        });
        console.log('[Browser] Chromium headless started');
      })().finally(() => { this.browserInitPromise = null; });
    }
    await this.browserInitPromise;
    return this.sharedBrowser!;
  }

  private async ensureBrowserForUser(userId: number): Promise<Browser> {
    const display = this.vnc?.getDisplay(userId) ?? null;
    if (display !== null) {
      // Per-user headed browser trên Xvfb display
      let p = this.userBrowserInitPromises.get(userId);
      const existing = this.userBrowsers.get(userId);
      if (existing?.isConnected()) return existing;
      if (!p) {
        p = chromium.launch({
          headless: false,
          env: { ...process.env, DISPLAY: `:${display}` },
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          ...(PROXY_URL ? { proxy: { server: PROXY_URL } } : {}),
        }).then((b) => { this.userBrowsers.set(userId, b); return b; })
          .finally(() => this.userBrowserInitPromises.delete(userId));
        this.userBrowserInitPromises.set(userId, p);
      }
      return p;
    }
    return this.ensureSharedBrowser();
  }

  // ─── Page ─────────────────────────────────────────────────────────────────

  async ensurePage(userId: number): Promise<Page> {
    const prev = this.pageLocks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const curr = new Promise<void>((r) => { release = r; });
    this.pageLocks.set(userId, prev.then(() => curr).catch(() => curr));
    await prev.catch(() => {});

    try {
      const s = this.store.get(userId);
      const display = this.vnc?.getDisplay(userId) ?? null;

      // Nếu display đổi (headless → headed hoặc ngược lại) → reset context
      if (s.context && s.contextDisplay !== display) {
        await s.context.close().catch(() => {});
        s.context = null;
        s.page = null;
        s.contextDisplay = null;
        s.activeIdentity = null;
      }

      if (s.context) {
        try { s.context.pages(); } catch { s.context = null; s.page = null; }
      }
      if (s.page?.isClosed()) s.page = null;
      if (s.context && s.page) return s.page;

      const browser  = await this.ensureBrowserForUser(userId);
      const authFile = this.getFbAuthFile(userId);

      if (!s.context) {
        s.context = await browser.newContext({
          locale: 'vi-VN',
          ...(fs.existsSync(authFile) ? { storageState: authFile } : {}),
        });
        s.contextDisplay = display;
        if (fs.existsSync(authFile)) this.store.log(userId, 'Đã nạp session Facebook đã lưu.');
      }

      s.page = await s.context.newPage();
      return s.page;
    } finally {
      release();
    }
  }

  async destroyUserSession(userId: number): Promise<void> {
    const s = this.store.get(userId);
    if (s?.context) await s.context.close().catch(() => {});
    this.store.delete(userId);

    const userBrowser = this.userBrowsers.get(userId);
    if (userBrowser) {
      await userBrowser.close().catch(() => {});
      this.userBrowsers.delete(userId);
      this.userBrowserInitPromises.delete(userId);
    }
  }

  async onModuleDestroy() {
    if (this.sharedBrowser) await this.sharedBrowser.close().catch(() => {});
    for (const b of this.userBrowsers.values()) await b.close().catch(() => {});
  }
}
