import { Controller, Get, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { SessionGuard } from '../../../../../core/guards/session.guard';
import { CurrentUser, CurrentUserData } from '../../../../../core/decorators/current-user.decorator';
import { FacebookService } from '../service/facebook.service';

@Controller('post-group/facebook')
@UseGuards(SessionGuard)
export class FacebookController {
  constructor(private readonly fb: FacebookService) {}

  @Get('session')
  hasSession(@CurrentUser() u: CurrentUserData) {
    return { hasSession: this.fb.hasSession(u.userId) };
  }

  // Polling endpoint: tự động phát hiện login và lưu session
  @Get('check-login')
  async checkLogin(@CurrentUser() u: CurrentUserData) {
    const loggedIn = await this.fb.autoDetectAndSave(u.userId);
    return { loggedIn };
  }

  @Post('open')
  async openLogin(@CurrentUser() u: CurrentUserData) {
    await this.fb.openLoginPage(u.userId);
    return { success: true };
  }

  @Post('confirm')
  async confirmLogin(@CurrentUser() u: CurrentUserData) {
    await this.fb.confirmLogin(u.userId);
    return { success: true };
  }

  @Post('logout')
  async logoutFacebook(@CurrentUser() u: CurrentUserData) {
    await this.fb.logoutFacebook(u.userId);
    return { success: true };
  }
}

// Endpoint riêng không cần SessionGuard — dùng cho Chrome extension
import { Controller as Ctrl2, Post as Post2, Body as Body2, HttpCode as HC2 } from '@nestjs/common';
import { AuthService } from '../../auth/service/auth.service';

@Ctrl2('post-group/facebook')
export class FacebookPublicController {
  constructor(
    private readonly fb: FacebookService,
    private readonly auth: AuthService,
  ) {}

  @Post2('import-session')
  @HC2(200)
  async importSession(
    @Body2('username') username: string,
    @Body2('password') password: string,
    @Body2('cookies') cookies: any[],
  ) {
    if (!username || !password || !Array.isArray(cookies) || cookies.length === 0) {
      return { success: false, error: 'Thiếu thông tin.' };
    }
    try {
      const user = await this.auth.login(username, password);
      await this.fb.importCookies(user.id, cookies);
      return { success: true, username: user.username };
    } catch (e: any) {
      return { success: false, error: e.message || 'Lỗi xác thực.' };
    }
  }
}
