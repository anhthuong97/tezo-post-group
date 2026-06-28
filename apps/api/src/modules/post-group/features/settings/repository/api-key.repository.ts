import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../../../../core/database/database.module';

@Injectable()
export class ApiKeyRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getByEmployeeId(employeeId: number): Promise<{ gemini_key: string | null; openai_key: string | null; ai_priority: string }> {
    const { rows } = await this.pool.query(
      'SELECT provider, api_key FROM pg_api_keys WHERE employee_id = $1',
      [employeeId],
    );
    const map: Record<string, string> = Object.fromEntries(rows.map((r) => [r.provider, r.api_key]));
    return {
      gemini_key:  map['gemini']   || null,
      openai_key:  map['openai']   || null,
      ai_priority: map['priority'] || 'gemini',
    };
  }

  async upsertKey(employeeId: number, provider: 'gemini' | 'openai', apiKey: string | null): Promise<void> {
    if (apiKey) {
      await this.pool.query(
        `INSERT INTO pg_api_keys (employee_id, provider, api_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (employee_id, provider) DO UPDATE SET api_key = $3, updated_at = NOW()`,
        [employeeId, provider, apiKey],
      );
    } else {
      await this.pool.query(
        'DELETE FROM pg_api_keys WHERE employee_id = $1 AND provider = $2',
        [employeeId, provider],
      );
    }
  }

  async upsert(employeeId: number, geminiKey: string | null, openaiKey: string | null): Promise<void> {
    if (geminiKey !== undefined) await this.upsertKey(employeeId, 'gemini', geminiKey);
    if (openaiKey !== undefined) await this.upsertKey(employeeId, 'openai', openaiKey);
  }

  async updatePriority(employeeId: number, priority: 'gemini' | 'openai'): Promise<void> {
    await this.pool.query(
      `INSERT INTO pg_api_keys (employee_id, provider, api_key)
       VALUES ($1, 'priority', $2)
       ON CONFLICT (employee_id, provider) DO UPDATE SET api_key = $2, updated_at = NOW()`,
      [employeeId, priority],
    );
  }
}
