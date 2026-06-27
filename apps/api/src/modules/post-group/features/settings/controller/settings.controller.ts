import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../../../../core/guards/session.guard';
import { CurrentUser, CurrentUserData } from '../../../../../core/decorators/current-user.decorator';
import { SettingsService } from '../service/settings.service';
import { UpdateApiKeyDto, UpdatePriorityDto } from '../dto/api-key.dto';

@Controller('post-group/settings')
@UseGuards(SessionGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('api-keys')
  async getKeys(@CurrentUser() u: CurrentUserData) {
    const keys = await this.settings.getMaskedKeys(u.userId);
    return { success: true, keys };
  }

  @Put('api-keys')
  async updateKeys(@CurrentUser() u: CurrentUserData, @Body() dto: UpdateApiKeyDto) {
    await this.settings.updateApiKeys(u.userId, dto.gemini, dto.openai);
    return { success: true };
  }

  @Put('ai-priority')
  async updatePriority(@CurrentUser() u: CurrentUserData, @Body() dto: UpdatePriorityDto) {
    await this.settings.updatePriority(u.userId, dto.priority);
    return { success: true };
  }
}
