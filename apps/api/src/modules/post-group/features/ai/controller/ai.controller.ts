import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../../../core/guards/session.guard';
import { CurrentUser, CurrentUserData } from '../../../../../core/decorators/current-user.decorator';
import { AiService } from '../service/ai.service';

@Controller('post-group/ai')
@UseGuards(SessionGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('suggest')
  async suggest(@CurrentUser() u: CurrentUserData, @Body('content') content: string) {
    if (!content?.trim()) return { success: false, error: 'Thiếu nội dung' };
    try {
      const suggestions = await this.ai.getSuggestions(u.userId, content);
      return { success: true, suggestions };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}
