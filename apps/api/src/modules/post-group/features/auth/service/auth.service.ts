import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthRepository } from '../repository/auth.repository';

@Injectable()
export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

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
