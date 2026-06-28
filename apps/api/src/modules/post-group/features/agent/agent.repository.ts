import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../../../core/database/database.module';

@Injectable()
export class AgentRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // ─── Heartbeats ───────────────────────────────────────────
  async upsertHeartbeat(userId: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO pg_agent_heartbeats (user_id, last_seen) VALUES ($1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET last_seen = NOW()`,
      [userId],
    );
  }

  async isAgentOnline(userId: number): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM pg_agent_heartbeats
       WHERE user_id = $1 AND last_seen > NOW() - INTERVAL '45 seconds'`,
      [userId],
    );
    return rows.length > 0;
  }

  // ─── Tasks ────────────────────────────────────────────────
  async createTask(userId: number, type: string, payload: any): Promise<number> {
    const { rows } = await this.pool.query(
      `INSERT INTO pg_agent_tasks (user_id, type, payload, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [userId, type, JSON.stringify(payload)],
    );
    return rows[0].id;
  }

  async getPendingTasks(userId: number): Promise<any[]> {
    const { rows } = await this.pool.query(
      `SELECT id, type, payload FROM pg_agent_tasks
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at ASC LIMIT 3`,
      [userId],
    );
    return rows;
  }

  async getTaskById(taskId: number): Promise<any | null> {
    const { rows } = await this.pool.query(
      `SELECT id, type, status, result, logs, created_at, started_at, finished_at
       FROM pg_agent_tasks WHERE id = $1`,
      [taskId],
    );
    return rows[0] || null;
  }

  async startTask(taskId: number): Promise<void> {
    await this.pool.query(
      `UPDATE pg_agent_tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
      [taskId],
    );
  }

  async updateTaskProgress(taskId: number, logs: string[]): Promise<void> {
    await this.pool.query(
      `UPDATE pg_agent_tasks SET logs = $2 WHERE id = $1`,
      [taskId, JSON.stringify(logs)],
    );
  }

  async completeTask(taskId: number, result: any, logs: string[]): Promise<void> {
    await this.pool.query(
      `UPDATE pg_agent_tasks SET status = 'done', result = $2, logs = $3, finished_at = NOW() WHERE id = $1`,
      [taskId, JSON.stringify(result), JSON.stringify(logs)],
    );
  }

  async getTasksByUser(userId: number, limit = 20): Promise<any[]> {
    const { rows } = await this.pool.query(
      `SELECT id, type, status, result, logs, created_at, finished_at
       FROM pg_agent_tasks WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows;
  }

  async getLatestTaskByType(userId: number, type: string): Promise<any | null> {
    const { rows } = await this.pool.query(
      `SELECT id, type, status, result, logs, created_at, finished_at
       FROM pg_agent_tasks WHERE user_id = $1 AND type = $2
       ORDER BY created_at DESC LIMIT 1`,
      [userId, type],
    );
    return rows[0] || null;
  }

  // ─── Groups ───────────────────────────────────────────────
  async saveGroups(userId: number, groups: Array<{ id: string; name: string; url: string; meta?: string }>): Promise<void> {
    if (!groups.length) return;
    for (const g of groups) {
      await this.pool.query(
        `INSERT INTO pg_groups (user_id, group_id, name, url, meta, synced_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, group_id) DO UPDATE SET name=$3, url=$4, meta=$5, synced_at=NOW()`,
        [userId, g.id, g.name, g.url, g.meta || null],
      );
    }
  }

  async getGroups(userId: number): Promise<any[]> {
    const { rows } = await this.pool.query(
      `SELECT group_id AS id, name, url, meta, synced_at
       FROM pg_groups WHERE user_id = $1
       ORDER BY name ASC`,
      [userId],
    );
    return rows;
  }

  async getSyncedAt(userId: number): Promise<Date | null> {
    const { rows } = await this.pool.query(
      `SELECT MAX(synced_at) AS synced_at FROM pg_groups WHERE user_id = $1`,
      [userId],
    );
    return rows[0]?.synced_at || null;
  }
}
