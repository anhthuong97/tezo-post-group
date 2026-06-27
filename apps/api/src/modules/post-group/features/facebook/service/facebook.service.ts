import { Injectable, BadRequestException, Optional } from '@nestjs/common';
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
}
