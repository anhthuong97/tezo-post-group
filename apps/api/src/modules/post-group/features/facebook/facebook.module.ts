import { Module } from '@nestjs/common';
import { FacebookController } from './controller/facebook.controller';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports:     [AgentModule],
  controllers: [FacebookController],
})
export class FacebookModule {}
