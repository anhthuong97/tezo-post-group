import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './core/database/database.module';
import { PostGroupModule } from './modules/post-group/post-group.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    PostGroupModule,
    // Thêm tool mới tại đây — không đụng code trên
  ],
})
export class AppModule {}
