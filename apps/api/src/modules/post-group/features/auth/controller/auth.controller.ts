import { Controller, Post, Get, Body, Req, Res, UseGuards, HttpCode, Patch, Param, ParseIntPipe } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../service/auth.service';
import { LoginDto } from '../dto/login.dto';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { SessionGuard } from '../../../../../core/guards/session.guard';

@Controller('post-group/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const user              = await this.auth.login(dto.username, dto.password);
    req.session['userId']   = user.id;
    req.session['username'] = user.username;
    req.session['vncPass']  = dto.password;
    return { success: true, username: user.username };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: Request) {
    return {
      loggedIn: true,
      userId: req.session['userId'],
      username: req.session['username'],
    };
  }

  // ─── User management ──────────────────────────────────────────────────────

  @Get('users')
  @UseGuards(SessionGuard)
  listUsers() {
    return this.auth.listEmployees();
  }

  @Post('users')
  @UseGuards(SessionGuard)
  async createUser(@Body('username') username: string) {
    if (!username?.trim()) return { success: false, error: 'Thiếu username.' };
    try {
      const user = await this.auth.createEmployee(username.trim());
      return { success: true, user };
    } catch (e: any) {
      return { success: false, error: e.message?.includes('unique') ? 'Username đã tồn tại.' : e.message };
    }
  }

  @Patch('users/:id/toggle')
  @UseGuards(SessionGuard)
  async toggleUser(@Param('id', ParseIntPipe) id: number, @Body('isActive') isActive: boolean) {
    await this.auth.toggleActive(id, isActive);
    return { success: true };
  }

  @Patch('users/:id/reset-password')
  @UseGuards(SessionGuard)
  async resetPassword(@Param('id', ParseIntPipe) id: number) {
    await this.auth.resetPassword(id);
    return { success: true };
  }
}
