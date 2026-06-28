import { Module } from '@nestjs/common';
import { GroupsController } from './controller/groups.controller';
import { GroupsService } from './service/groups.service';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports:     [AgentModule],
  controllers: [GroupsController],
  providers:   [GroupsService],
})
export class GroupsModule {}
