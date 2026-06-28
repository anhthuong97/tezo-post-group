import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentRepository } from './agent.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports:     [AuthModule],
  controllers: [AgentController],
  providers:   [AgentService, AgentRepository],
  exports:     [AgentService],
})
export class AgentModule {}
