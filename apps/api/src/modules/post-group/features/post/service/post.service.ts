import { Injectable, BadRequestException } from '@nestjs/common';
import { AgentService } from '../../agent/agent.service';
import { CreatePostDto } from '../dto/create-post.dto';

export interface PostStatusItem {
  url: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error' | 'cancelled';
  message: string;
  postLink?: string;
  doneAt?: string;
}

@Injectable()
export class PostService {
  // userId → { taskId, groups }
  private readonly taskMap = new Map<number, { taskId: number; groups: Array<{ url: string; name: string }> }>();

  constructor(private readonly agent: AgentService) {}

  async startPost(userId: number, dto: CreatePostDto): Promise<void> {
    const online = await this.agent.isOnline(userId);
    if (!online) throw new BadRequestException('Agent chưa kết nối. Hãy chạy TeZo Agent trên máy tính của nhân viên.');

    const taskId = await this.agent.createTask(userId, 'post_groups', dto);
    this.taskMap.set(userId, { taskId, groups: dto.groups });
  }

  async getStatus(userId: number): Promise<PostStatusItem[]> {
    const entry = this.taskMap.get(userId);
    if (!entry) return [];

    const task = await this.agent.getTaskById(entry.taskId);
    if (!task) return [];

    if (task.status === 'pending') {
      return entry.groups.map((g) => ({
        url: g.url, name: g.name,
        status: 'pending', message: 'Đang chờ agent...',
      }));
    }

    if (task.status === 'running') {
      const logs: string[] = task.logs || [];
      const lastLog = logs[logs.length - 1] || 'Agent đang xử lý...';
      return entry.groups.map((g) => ({
        url: g.url, name: g.name,
        status: 'processing', message: lastLog,
      }));
    }

    if (task.status === 'done') {
      const results: any[] = task.result?.results || [];
      const doneAt = task.finished_at
        ? new Date(task.finished_at).toLocaleTimeString('vi-VN')
        : undefined;
      return entry.groups.map((g) => {
        const r = results.find((x) => x.url === g.url || x.url?.includes(g.url));
        return {
          url: g.url, name: g.name, doneAt,
          status:   r?.success ? 'success' : 'error',
          message:  r?.success ? 'Đăng thành công!' : (r?.error || 'Thất bại'),
          postLink: r?.postLink,
        };
      });
    }

    return [];
  }

  async getLog(userId: number): Promise<string[]> {
    const entry = this.taskMap.get(userId);
    if (!entry) return [];
    const task = await this.agent.getTaskById(entry.taskId);
    return task?.logs || [];
  }

  cancelGroup(_userId: number, _url: string): void { /* Agent handles cancellation */ }
  cancelAllPending(_userId: number): void { /* Agent handles cancellation */ }
}
