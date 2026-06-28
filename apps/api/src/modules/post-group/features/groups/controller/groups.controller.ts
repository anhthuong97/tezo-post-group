import { Controller, Get, Post, UseGuards } from '@nestjs/common';
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
      return { success: false, error: err.message, groups: [] };
    }
  }

  @Post('sync')
  async sync(@CurrentUser() u: CurrentUserData) {
    try {
      const result = await this.groups.syncGroups(u.userId);
      return { success: true, ...result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
