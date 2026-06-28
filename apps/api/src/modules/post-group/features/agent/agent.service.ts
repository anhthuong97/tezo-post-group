import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AgentRepository } from './agent.repository';
import { AuthService } from '../auth/service/auth.service';

const JWT_SECRET  = process.env.SESSION_SECRET || 'tezo-agent-secret';
const JWT_EXPIRES = '7d';

@Injectable()
export class AgentService {
  constructor(
    private readonly repo: AgentRepository,
    private readonly auth: AuthService,
  ) {}

  async authenticate(username: string, password: string): Promise<{ token: string; userId: number }> {
    const user  = await this.auth.login(username, password);
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return { token, userId: user.id };
  }

  verifyToken(token: string): { userId: number; username: string } {
    try {
      return jwt.verify(token, JWT_SECRET) as any;
    } catch {
      throw new UnauthorizedException('Token không hợp lệ.');
    }
  }

  heartbeat(userId: number)                           { return this.repo.upsertHeartbeat(userId); }
  isOnline(userId: number)                            { return this.repo.isAgentOnline(userId); }
  getPendingTasks(userId: number)                     { return this.repo.getPendingTasks(userId); }
  startTask(taskId: number)                           { return this.repo.startTask(taskId); }
  completeTask(id: number, result: any, logs: string[]) { return this.repo.completeTask(id, result, logs); }
  createTask(userId: number, type: string, payload: any) { return this.repo.createTask(userId, type, payload); }
  getTaskHistory(userId: number)                      { return this.repo.getTasksByUser(userId); }
}
