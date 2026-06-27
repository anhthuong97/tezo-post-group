import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import * as fs from 'fs';
import { BrowserService } from '../infrastructure/browser.service';
import { UserSessionStore } from '../infrastructure/user-session.store';
import { SessionFileRepository } from '../repository/session-file.repository';
import { VncService } from '../../vnc/service/vnc.service';

@Injectable()
export class FacebookService {
  constructor(
    private readonly browser: BrowserService,
    private readonly store: UserSessionStore,
    private readonly sessionFile: SessionFileRepository,
    @Optional() private readonly vnc?: VncService,
  ) {}

  hasSession(userId: number): boolean {
    return this.sessionFile.exists(userId);
  }

  // Kiểm tra và tự động lưu session nếu page đang ở trạng thái logged-in
  async autoDetectAndSave(userId: number): Promise<boolean> {
    if (this.sessionFile.exists(userId)) return true;
    const url = this.browser.getPageUrl(userId);
    if (!url || !url.includes('facebook.com')) return false;
    if (this.browser.looksLoggedOut(url)) return false;

    const s = this.store.get(userId);
    if (!s.context) return false;

    s.loggedIn = true;
    await s.context.storageState({ path: this.browser.getFbAuthFile(userId) });
    this.store.log(userId, 'Tự động phát hiện đăng nhập và lưu session.');
    this.vnc?.stopLoginSession(userId);
    return true;
  }

  async openLoginPage(userId: number): Promise<void> {
    const page = await this.browser.ensurePage(userId);
    this.store.log(userId, 'Đã mở cửa sổ Facebook. Đang chờ bạn đăng nhập...');
    await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
  }

  async confirmLogin(userId: number): Promise<void> {
    const page = await this.browser.ensurePage(userId);
    const url  = page.url();
    if (this.browser.looksLoggedOut(url)) {
      throw new BadRequestException(`Có vẻ chưa đăng nhập xong (đang ở: ${url}).`);
    }
    const s = this.store.get(userId);
    s.loggedIn = true;
    await s.context!.storageState({ path: this.browser.getFbAuthFile(userId) });
    this.store.log(userId, 'Đã xác nhận đăng nhập và lưu session.');
    this.vnc?.stopLoginSession(userId);
  }

  async logoutFacebook(userId: number): Promise<void> {
    await this.browser.destroyUserSession(userId);
    this.sessionFile.delete(userId);
  }

  async importCookies(userId: number, cookies: any[]): Promise<void> {
    const sameSiteMap: Record<string, 'Lax' | 'Strict' | 'None'> = {
      no_restriction: 'None',
      lax:            'Lax',
      strict:         'Strict',
      unspecified:    'None',
      Lax:            'Lax',
      Strict:         'Strict',
      None:           'None',
    };

    const playwrightCookies = cookies.map((c) => ({
      name:     c.name,
      value:    c.value,
      domain:   c.domain,
      path:     c.path || '/',
      expires:  c.expires ?? (c.expirationDate ? Math.round(c.expirationDate) : -1),
      httpOnly: c.httpOnly ?? false,
      secure:   c.secure ?? false,
      sameSite: sameSiteMap[c.sameSite] ?? 'Lax',
    }));

    const storageState = { cookies: playwrightCookies, origins: [] };
    const authFile = this.browser.getFbAuthFile(userId);
    fs.writeFileSync(authFile, JSON.stringify(storageState, null, 2));

    // Reset context để load lại cookie mới
    const s = this.store.get(userId);
    if (s.context) {
      await s.context.close().catch(() => {});
      s.context = null;
      s.page = null;
      s.loggedIn = true;
    }

    console.log(`[Facebook] importCookies user=${userId} count=${playwrightCookies.length}`);
  }
}
