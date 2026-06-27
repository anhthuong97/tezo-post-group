import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { BrowserContext, Page } from 'playwright';

const LOG_DIR = path.join(process.cwd(), '..', '..', 'logs');
const MAX_LOG_DAYS = 7;

export interface PostStatusItem {
  url: string;
  name: string;
  status: 'pending' | 'processing' | 'commenting' | 'success' | 'error' | 'cancelled';
  message: string;
  postLink?: string;
  doneAt?: string;
}

export interface UserSession {
  context: BrowserContext | null;
  page: Page | null;
  contextDisplay: number | null; // display number Xvfb dùng khi tạo context, null = headless
  loggedIn: boolean;
  selectedIdentity: string | null; // tư cách user đang chọn trong tool
  activeIdentity: string | null;   // tư cách browser đang thực sự dùng (null = chưa biết)
  personalIdentity: string | null; // tư cách chính (cá nhân) của nick — không có trong pages manager
  pageUrlMap: Record<string, string>; // name → URL của trang Facebook
  log: string[];
  postStatus: PostStatusItem[];
  isPosting: boolean;
}

@Injectable()
export class UserSessionStore {
  private readonly sessions = new Map<number, UserSession>();

  constructor() {
    try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
    this.cleanOldLogs();
  }

  get(userId: number): UserSession {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, {
        context: null,
        page: null,
        contextDisplay: null,
        loggedIn: false,
        selectedIdentity: null,
        activeIdentity: null,
        personalIdentity: null,
        pageUrlMap: {},
        log: [],
        postStatus: [],
        isPosting: false,
      });
    }
    return this.sessions.get(userId)!;
  }

  delete(userId: number): void {
    this.sessions.delete(userId);
  }

  log(userId: number, msg: string): void {
    console.log(`[U${userId}] ${msg}`);
    const s = this.get(userId);
    const entry = `[${new Date().toLocaleTimeString('vi-VN')}] [U${userId}] ${msg}`;
    s.log.push(entry);
    this.writeToFile(entry);
  }

  private writeToFile(entry: string): void {
    try {
      const today = new Date().toISOString().slice(0, 10);
      fs.appendFileSync(path.join(LOG_DIR, `${today}.log`), entry + '\n', 'utf8');
    } catch {}
  }

  private cleanOldLogs(): void {
    try {
      const cutoff = Date.now() - MAX_LOG_DAYS * 86400_000;
      for (const file of fs.readdirSync(LOG_DIR)) {
        const full = path.join(LOG_DIR, file);
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      }
    } catch {}
  }
}
