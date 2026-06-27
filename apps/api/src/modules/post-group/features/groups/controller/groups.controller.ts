import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../../../core/guards/session.guard';
import { CurrentUser, CurrentUserData } from '../../../../../core/decorators/current-user.decorator';
import { GroupsService } from '../service/groups.service';

@Controller('post-group/groups')
@UseGuards(SessionGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  async list(@CurrentUser() u: CurrentUserData) {
    try {
      const data = await this.groups.listGroups(u.userId);
      return { success: true, groups: data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi khi tải nhóm', groups: [] };
    }
  }

  @Post('open')
  async open(@CurrentUser() u: CurrentUserData, @Body('url') url: string) {
    if (!url) return { success: false, error: 'Thiếu url' };
    await this.groups.openGroupUrl(u.userId, url);
    return { success: true };
  }
}
