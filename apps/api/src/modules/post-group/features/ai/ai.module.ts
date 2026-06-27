import { Module } from '@nestjs/common';
import { AiController } from './controller/ai.controller';
import { AiService } from './service/ai.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports:     [SettingsModule],
  controllers: [AiController],
  providers:   [AiService],
  exports:     [AiService],
})
export class AiModule {}
