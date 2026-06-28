import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service';

@Injectable()
export class AgentRepository {
  constructor(private readonly db: DatabaseService) {}

  async upsertHeartbeat(userId: number): Promise<void> {
    await this.db.query(
      `INSERT INTO agent_heartbeats (user_id, last_seen)
       VALUES ($1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET last_seen = NOW()`,
      [userId],
    );
  }

  async isAgentOnline(userId: number): Promise<boolean> {
    const r = await this.db.query(
      `SELECT 1 FROM agent_heartbeats
       WHERE user_id = $1 AND last_seen > NOW() - INTERVAL '45 seconds'`,
      [userId],
    );
    return r.rows.length > 0;
  }

  async createTask(userId: number, type: string, payload: any): Promise<number> {
    const r = await this.db.query(
      `INSERT INTO agent_tasks (user_id, type, payload, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [userId, type, JSON.stringify(payload)],
    );
    return r.rows[0].id;
  }

  async getPendingTasks(userId: number): Promise<any[]> {
    const r = await this.db.query(
      `SELECT id, type, payload FROM agent_tasks
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at ASC LIMIT 3`,
      [userId],
    );
    return r.rows;
  }

  async startTask(taskId: number): Promise<void> {
    await this.db.query(
      `UPDATE agent_tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
      [taskId],
    );
  }

  async completeTask(taskId: number, result: any, logs: string[]): Promise<void> {
    await this.db.query(
      `UPDATE agent_tasks SET status = 'done', result = $2, logs = $3, finished_at = NOW() WHERE id = $1`,
      [taskId, JSON.stringify(result), JSON.stringify(logs)],
    );
  }

  async getTasksByUser(userId: number, limit = 20): Promise<any[]> {
    const r = await this.db.query(
      `SELECT id, type, status, result, logs, created_at, finished_at
       FROM agent_tasks WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return r.rows;
  }
}
