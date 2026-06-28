import { Controller, Get, Post, Param, Body, Headers, ParseIntPipe, HttpCode, UseGuards } from '@nestjs/common';
import { AgentService } from './agent.service';
import { SessionGuard } from '../../../../core/guards/session.guard';
import { CurrentUser, CurrentUserData } from '../../../../core/decorators/current-user.decorator';

// Guard dùng JWT token cho agent (khác với session cookie)
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
class AgentTokenGuard implements CanActivate {
  constructor(private readonly agentSvc: AgentService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req   = ctx.switchToHttp().getRequest();
    const auth  = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    const payload = this.agentSvc.verifyToken(token);
    req['agentUser'] = payload;
    return true;
  }
}

@Controller('post-group/agent')
export class AgentController {
  constructor(private readonly svc: AgentService) {}

  // ─── Agent endpoints (JWT) ────────────────────────────────────────────────

  @Post('auth')
  @HttpCode(200)
  async auth(@Body('username') username: string, @Body('password') password: string) {
    if (!username || !password) return { error: 'Thiếu thông tin.' };
    try {
      const result = await this.svc.authenticate(username, password);
      return { token: result.token };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  @Post('heartbeat')
  @HttpCode(200)
  async heartbeat(@Headers('authorization') auth: string) {
    const token   = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return { error: 'Unauthorized' };
    const payload = this.svc.verifyToken(token);
    await this.svc.heartbeat(payload.userId);
    return { ok: true };
  }

  @Get('tasks')
  async getTasks(@Headers('authorization') auth: string) {
    const token   = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return { tasks: [] };
    const payload = this.svc.verifyToken(token);
    const tasks   = await this.svc.getPendingTasks(payload.userId);
    return { tasks };
  }

  @Post('tasks/:id/start')
  @HttpCode(200)
  async startTask(@Param('id', ParseIntPipe) id: number) {
    await this.svc.startTask(id);
    return { ok: true };
  }

  @Post('tasks/:id/done')
  @HttpCode(200)
  async doneTask(
    @Param('id', ParseIntPipe) id: number,
    @Body('result') result: any,
    @Body('logs') logs: string[],
  ) {
    await this.svc.completeTask(id, result, logs || []);
    return { ok: true };
  }

  // ─── Web UI endpoints (Session) ───────────────────────────────────────────

  @Get('status')
  @UseGuards(SessionGuard)
  async getStatus(@CurrentUser() u: CurrentUserData) {
    const online = await this.svc.isOnline(u.userId);
    return { online };
  }

  @Get('history')
  @UseGuards(SessionGuard)
  async getHistory(@CurrentUser() u: CurrentUserData) {
    const tasks = await this.svc.getTaskHistory(u.userId);
    return { tasks };
  }

  @Post('dispatch')
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async dispatch(
    @CurrentUser() u: CurrentUserData,
    @Body('type') type: string,
    @Body('payload') payload: any,
  ) {
    const online = await this.svc.isOnline(u.userId);
    if (!online) return { success: false, error: 'Agent chưa kết nối. Hãy chạy TeZo Agent trên máy tính.' };
    const taskId = await this.svc.createTask(u.userId, type, payload);
    return { success: true, taskId };
  }
}
