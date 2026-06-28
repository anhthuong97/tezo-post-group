import { Module } from '@nestjs/common';
import { LogController } from './controller/log.controller';
import { LogService } from './service/log.service';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports:     [AgentModule],
  controllers: [LogController],
  providers:   [LogService],
})
export class LogModule {}
