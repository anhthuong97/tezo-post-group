import { Injectable } from '@nestjs/common';
import { AgentService } from '../../agent/agent.service';

@Injectable()
export class LogService {
  constructor(private readonly agent: AgentService) {}

  async getLogs(userId: number): Promise<string[]> {
    const task = await this.agent.getLatestTaskByType(userId, 'post_groups');
    return task?.logs || [];
  }

  clearLogs(_userId: number): void { /* logs nằm trong DB, không cần clear */ }
}
