import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../../../core/guards/session.guard';
import { CurrentUser, CurrentUserData } from '../../../../../core/decorators/current-user.decorator';
import { AgentService } from '../../agent/agent.service';

@Controller('post-group/facebook')
@UseGuards(SessionGuard)
export class FacebookController {
  constructor(private readonly agent: AgentService) {}

  @Get('status')
  async getStatus(@CurrentUser() u: CurrentUserData) {
    const online   = await this.agent.isOnline(u.userId);
    const syncedAt = await this.agent.getGroupsSyncedAt(u.userId);
    return { online, syncedAt };
  }
}
