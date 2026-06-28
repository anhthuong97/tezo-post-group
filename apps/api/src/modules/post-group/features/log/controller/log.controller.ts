import { Controller, Get, Delete, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../../../core/guards/session.guard';
import { CurrentUser, CurrentUserData } from '../../../../../core/decorators/current-user.decorator';
import { LogService } from '../service/log.service';

@Controller('post-group/log')
@UseGuards(SessionGuard)
export class LogController {
  constructor(private readonly log: LogService) {}

  @Get()
  async getLogs(@CurrentUser() u: CurrentUserData) {
    return { success: true, log: await this.log.getLogs(u.userId) };
  }

  @Delete()
  clearLogs(@CurrentUser() u: CurrentUserData) {
    this.log.clearLogs(u.userId);
    return { success: true };
  }
}
