import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../../../../core/database/database.module';
import { EmployeeEntity } from '../entity/employee.entity';

@Injectable()
export class AuthRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByUsername(username: string): Promise<EmployeeEntity | null> {
    const { rows } = await this.pool.query(
      `SELECT id, username, password_hash, is_active
       FROM employees WHERE username = $1`,
      [username.toLowerCase().trim()],
    );
    return rows[0] || null;
  }

  async updateLastLogin(userId: number): Promise<void> {
    await this.pool.query(
      'UPDATE employees SET last_login_at = NOW() WHERE id = $1',
      [userId],
    );
  }
}
