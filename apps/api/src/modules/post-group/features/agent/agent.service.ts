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

  heartbeat(userId: number)                              { return this.repo.upsertHeartbeat(userId); }
  isOnline(userId: number)                               { return this.repo.isAgentOnline(userId); }
  getPendingTasks(userId: number)                        { return this.repo.getPendingTasks(userId); }
  startTask(taskId: number)                              { return this.repo.startTask(taskId); }
  updateTaskProgress(taskId: number, logs: string[])     { return this.repo.updateTaskProgress(taskId, logs); }
  completeTask(id: number, result: any, logs: string[])  { return this.repo.completeTask(id, result, logs); }
  createTask(userId: number, type: string, payload: any) { return this.repo.createTask(userId, type, payload); }
  getTaskHistory(userId: number)                         { return this.repo.getTasksByUser(userId); }
  getTaskById(taskId: number)                            { return this.repo.getTaskById(taskId); }
  getLatestTaskByType(userId: number, type: string)      { return this.repo.getLatestTaskByType(userId, type); }

  // Identities
  saveIdentities(userId: number, identities: any[])      { return this.repo.saveIdentities(userId, identities); }
  setActiveIdentity(userId: number, identityId: string)  { return this.repo.setActiveIdentity(userId, identityId); }
  getIdentities(userId: number)                          { return this.repo.getIdentities(userId); }
  getActiveIdentity(userId: number)                      { return this.repo.getActiveIdentity(userId); }

  // Groups
  saveGroups(userId: number, identityId: string, groups: any[]) { return this.repo.saveGroups(userId, identityId, groups); }
  getGroups(userId: number, identityId = 'personal')            { return this.repo.getGroups(userId, identityId); }
  getGroupsSyncedAt(userId: number, identityId = 'personal')    { return this.repo.getSyncedAt(userId, identityId); }

  // ─── Per-group post status (in-memory, per task) ──────────────────────────
  private readonly groupStatusMap = new Map<number, Map<string, any>>();
  private readonly cancelMap      = new Map<number, Set<string>>();

  initGroupStatus(taskId: number, groups: Array<{ url: string; name: string }>) {
    const map = new Map<string, any>();
    for (const g of groups) {
      map.set(g.url, { url: g.url, name: g.name, status: 'pending', message: 'Đang chờ...' });
    }
    this.groupStatusMap.set(taskId, map);
    this.cancelMap.delete(taskId);
  }

  updateGroupStatus(taskId: number, url: string, status: string, step?: string, postLink?: string) {
    const map  = this.groupStatusMap.get(taskId);
    if (!map) return;
    const item = map.get(url) || { url, name: url, status: 'pending', message: '' };
    item.status = status;
    if (step !== undefined) item.message = step;
    if (postLink) item.postLink = postLink;
    if (['success', 'error', 'cancelled'].includes(status)) {
      item.doneAt = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      if (status === 'success' && !item.message?.startsWith('Lỗi')) item.message = 'Đăng thành công!';
    }
    map.set(url, item);
  }

  getGroupStatuses(taskId: number): any[] | null {
    const map = this.groupStatusMap.get(taskId);
    return map ? Array.from(map.values()) : null;
  }

  getCancelledUrls(taskId: number): string[] {
    return Array.from(this.cancelMap.get(taskId) || []);
  }

  addCancelUrl(taskId: number, url: string) {
    if (!this.cancelMap.has(taskId)) this.cancelMap.set(taskId, new Set());
    this.cancelMap.get(taskId)!.add(url);
  }

  cancelAllUrls(taskId: number, urls: string[]) {
    if (!this.cancelMap.has(taskId)) this.cancelMap.set(taskId, new Set());
    const s = this.cancelMap.get(taskId)!;
    for (const u of urls) s.add(u);
  }
}
