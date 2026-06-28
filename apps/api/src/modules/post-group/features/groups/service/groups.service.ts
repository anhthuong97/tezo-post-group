import { Injectable, BadRequestException } from '@nestjs/common';
import { AgentService } from '../../agent/agent.service';

@Injectable()
export class GroupsService {
  constructor(private readonly agent: AgentService) {}

  async listGroups(userId: number, identityId = 'personal'): Promise<any[]> {
    return this.agent.getGroups(userId, identityId);
  }

  async syncGroups(userId: number, identityId = 'personal'): Promise<{ taskId: number }> {
    const online = await this.agent.isOnline(userId);
    if (!online) throw new BadRequestException('Agent chưa kết nối. Hãy chạy TeZo Agent trên máy tính.');
    const taskId = await this.agent.createTask(userId, 'fetch_groups', { identityId });
    return { taskId };
  }
}
