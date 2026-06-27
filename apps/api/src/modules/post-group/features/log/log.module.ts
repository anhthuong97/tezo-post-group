import { Module } from '@nestjs/common';
import { LogController } from './controller/log.controller';
import { LogService } from './service/log.service';
import { FacebookModule } from '../facebook/facebook.module';

@Module({
  imports:     [FacebookModule],
  controllers: [LogController],
  providers:   [LogService],
})
export class LogModule {}
