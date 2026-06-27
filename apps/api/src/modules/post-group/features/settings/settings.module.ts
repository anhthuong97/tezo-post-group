import { Module } from '@nestjs/common';
import { SettingsController } from './controller/settings.controller';
import { SettingsService } from './service/settings.service';
import { ApiKeyRepository } from './repository/api-key.repository';

@Module({
  controllers: [SettingsController],
  providers:   [SettingsService, ApiKeyRepository],
  exports:     [SettingsService],
})
export class SettingsModule {}
