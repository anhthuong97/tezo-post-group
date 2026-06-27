import { Controller, Post, Get, Body, Req, Res, UseGuards, HttpCode } from '@nestjs/common';
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
    const user         = await this.auth.login(dto.username, dto.password);
    req.session['userId']   = user.id;
    req.session['username'] = user.username;
    req.session['vncPass']  = dto.password; // dùng cho VNC password (plain-text, lưu trong session cookie)
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
}
