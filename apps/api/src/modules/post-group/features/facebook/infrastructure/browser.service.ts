import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UserSessionStore } from './user-session.store';

const SESSIONS_DIR = path.join(process.cwd(), 'sessions');
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const UNAUTHENTICATED_PATTERNS = ['/login', '/checkpoint', '/two_step_verification', '/recover', '/captcha'];

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private sharedBrowser: Browser | null = null;
  private browserInitPromise: Promise<void> | null = null;
  private readonly pageLocks = new Map<number, Promise<void>>();

  constructor(private readonly store: UserSessionStore) {}

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

  private async ensureSharedBrowser(): Promise<Browser> {
    if (this.sharedBrowser?.isConnected()) return this.sharedBrowser;
    if (!this.browserInitPromise) {
      this.browserInitPromise = (async () => {
        const isLinux = os.platform() === 'linux';
        this.sharedBrowser = await chromium.launch({
          headless: isLinux,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        console.log(`[Browser] Chromium ${isLinux ? 'headless' : 'headed'} started`);
      })().finally(() => { this.browserInitPromise = null; });
    }
    await this.browserInitPromise;
    return this.sharedBrowser!;
  }

  async ensurePage(userId: number): Promise<Page> {
    const prev = this.pageLocks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const curr = new Promise<void>((r) => { release = r; });
    this.pageLocks.set(userId, prev.then(() => curr).catch(() => curr));
    await prev.catch(() => {});

    try {
      const s = this.store.get(userId);

      if (s.context) {
        try { s.context.pages(); } catch { s.context = null; s.page = null; }
      }
      if (s.page?.isClosed()) s.page = null;
      if (s.context && s.page) return s.page;

      const browser  = await this.ensureSharedBrowser();
      const authFile = this.getFbAuthFile(userId);

      if (!s.context) {
        s.context = await browser.newContext({
          locale: 'vi-VN',
          ...(fs.existsSync(authFile) ? { storageState: authFile } : {}),
        });
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
  }

  async onModuleDestroy() {
    if (this.sharedBrowser) await this.sharedBrowser.close().catch(() => {});
  }
}
