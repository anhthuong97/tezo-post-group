import { Module } from '@nestjs/common';
import { PostController } from './controller/post.controller';
import { PostService } from './service/post.service';
import { FacebookModule } from '../facebook/facebook.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports:     [FacebookModule, IdentityModule],
  controllers: [PostController],
  providers:   [PostService],
})
export class PostModule {}
