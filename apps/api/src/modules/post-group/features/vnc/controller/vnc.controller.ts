import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionGuard } from '../../../../../core/guards/session.guard';
import { CurrentUser, CurrentUserData } from '../../../../../core/decorators/current-user.decorator';
import { VncService } from '../service/vnc.service';

@Controller('post-group/vnc')
@UseGuards(SessionGuard)
export class VncController {
  constructor(private readonly vnc: VncService) {}

  @Get('status')
  status(@CurrentUser() u: CurrentUserData) {
    return this.vnc.getStatus(u.userId);
  }

  @Post('login/start')
  async startLogin(@CurrentUser() u: CurrentUserData, @Req() req: Request) {
    const vncPass: string = req.session['vncPass'];
    if (!vncPass) return { success: false, error: 'Phiên đăng nhập không có VNC password.' };
    try {
      const { wsPort, display } = await this.vnc.startLoginSession(u.userId, vncPass);
      return { success: true, wsPort, display };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  @Post('login/stop')
  stopLogin(@CurrentUser() u: CurrentUserData) {
    this.vnc.stopLoginSession(u.userId);
    return { success: true };
  }

  @Post('monitor/start')
  async startMonitor(@CurrentUser() u: CurrentUserData) {
    try {
      const { wsPort } = await this.vnc.startMonitor(u.userId);
      return { success: true, wsPort };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  @Post('monitor/stop')
  stopMonitor(@CurrentUser() u: CurrentUserData) {
    this.vnc.stopMonitor(u.userId);
    return { success: true };
  }

  @Post('monitor/touch')
  touch(@CurrentUser() u: CurrentUserData) {
    this.vnc.touchMonitor(u.userId);
    return { success: true };
  }
}
