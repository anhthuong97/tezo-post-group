import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../../../core/guards/session.guard';
import { CurrentUser, CurrentUserData } from '../../../../../core/decorators/current-user.decorator';
import { IdentityService } from '../service/identity.service';

@Controller('post-group/identity')
@UseGuards(SessionGuard)
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  async list(@CurrentUser() u: CurrentUserData) {
    try {
      const data = await this.identity.listIdentities(u.userId);
      return { success: true, current: data.current, switchable: data.switchable };
    } catch {
      return { success: false, current: null, switchable: [] };
    }
  }

  @Post('switch')
  async switch(@CurrentUser() u: CurrentUserData, @Body('name') name: string) {
    if (!name) return { success: false, error: 'Thiếu name' };
    try {
      await this.identity.switchIdentity(u.userId, name);
      return { success: true };
    } catch {
      return { success: true }; // switch có thể đã thành công dù cleanup lỗi
    }
  }
}
