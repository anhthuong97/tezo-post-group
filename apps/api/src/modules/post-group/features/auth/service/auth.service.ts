import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthRepository } from '../repository/auth.repository';

@Injectable()
export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  private readonly DEFAULT_PASSWORD = 'Admin@123';

  async createEmployee(username: string): Promise<{ id: number; username: string }> {
    const hash = await bcrypt.hash(this.DEFAULT_PASSWORD, 10);
    return this.repo.createEmployee(username, hash);
  }

  async register(username: string, password: string): Promise<{ id: number; username: string }> {
    const hash = await bcrypt.hash(password, 10);
    return this.repo.createEmployee(username, hash);
  }

  async listEmployees() {
    return this.repo.listEmployees();
  }

  async toggleActive(userId: number, isActive: boolean): Promise<void> {
    return this.repo.toggleActive(userId, isActive);
  }

  async resetPassword(userId: number): Promise<void> {
    const hash = await bcrypt.hash(this.DEFAULT_PASSWORD, 10);
    return this.repo.resetPassword(userId, hash);
  }

  async login(username: string, password: string): Promise<{ id: number; username: string }> {
    const user = await this.repo.findByUsername(username);

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc bị khóa.');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Sai mật khẩu.');

    await this.repo.updateLastLogin(user.id);
    return { id: user.id, username: user.username };
  }
}
