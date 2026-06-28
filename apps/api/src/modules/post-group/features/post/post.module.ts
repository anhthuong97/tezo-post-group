import { Module } from '@nestjs/common';
import { PostController } from './controller/post.controller';
import { PostService } from './service/post.service';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports:     [AgentModule],
  controllers: [PostController],
  providers:   [PostService],
})
export class PostModule {}
