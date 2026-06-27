import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';

const MAX_ATTEMPTS  = 10;
const WINDOW_MS     = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

@Injectable()
export class RateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip  = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const rec = loginAttempts.get(ip);

    if (!rec || now > rec.resetAt) {
      loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    if (rec.count >= MAX_ATTEMPTS) {
      throw new HttpException('Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS);
    }
    rec.count++;
    return true;
  }
}
