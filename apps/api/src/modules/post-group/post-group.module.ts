import { Module } from '@nestjs/common';
import { AuthModule } from './features/auth/auth.module';
import { FacebookModule } from './features/facebook/facebook.module';
import { GroupsModule } from './features/groups/groups.module';
import { PostModule } from './features/post/post.module';
import { AiModule } from './features/ai/ai.module';
import { ProductModule } from './features/product/product.module';
import { SettingsModule } from './features/settings/settings.module';
import { LogModule } from './features/log/log.module';
import { AgentModule } from './features/agent/agent.module';

@Module({
  imports: [
    AuthModule,
    FacebookModule,
    GroupsModule,
    PostModule,
    AiModule,
    ProductModule,
    SettingsModule,
    LogModule,
    AgentModule,
  ],
})
export class PostGroupModule {}
