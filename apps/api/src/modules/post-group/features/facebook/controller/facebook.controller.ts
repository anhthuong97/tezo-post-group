import { Controller, Get, Post, UseGuards } from '@nestjs/common';
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
