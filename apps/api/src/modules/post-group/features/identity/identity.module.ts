import { Module } from '@nestjs/common';
import { IdentityController } from './controller/identity.controller';
import { IdentityService } from './service/identity.service';
import { FacebookModule } from '../facebook/facebook.module';

@Module({
  imports:     [FacebookModule],
  controllers: [IdentityController],
  providers:   [IdentityService],
  exports:     [IdentityService],
})
export class IdentityModule {}
