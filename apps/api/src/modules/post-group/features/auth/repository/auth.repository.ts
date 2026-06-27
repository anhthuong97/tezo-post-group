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

  async createEmployee(username: string, passwordHash: string): Promise<{ id: number; username: string }> {
    const { rows } = await this.pool.query(
      `INSERT INTO employees (username, password_hash, is_active)
       VALUES ($1, $2, true) RETURNING id, username`,
      [username.toLowerCase().trim(), passwordHash],
    );
    return rows[0];
  }

  async listEmployees(): Promise<{ id: number; username: string; is_active: boolean; last_login_at: Date | null }[]> {
    const { rows } = await this.pool.query(
      `SELECT id, username, is_active, last_login_at
       FROM employees ORDER BY created_at ASC`,
    );
    return rows;
  }

  async toggleActive(userId: number, isActive: boolean): Promise<void> {
    await this.pool.query(
      'UPDATE employees SET is_active = $1 WHERE id = $2',
      [isActive, userId],
    );
  }

  async resetPassword(userId: number, passwordHash: string): Promise<void> {
    await this.pool.query(
      'UPDATE employees SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId],
    );
  }
}
