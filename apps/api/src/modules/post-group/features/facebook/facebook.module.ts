import { Module } from '@nestjs/common';
import { FacebookController, FacebookPublicController } from './controller/facebook.controller';
import { FacebookService } from './service/facebook.service';
import { BrowserService } from './infrastructure/browser.service';
import { UserSessionStore } from './infrastructure/user-session.store';
import { SessionFileRepository } from './repository/session-file.repository';
import { VncModule } from '../vnc/vnc.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports:     [VncModule, AuthModule],
  controllers: [FacebookController, FacebookPublicController],
  providers:   [FacebookService, BrowserService, UserSessionStore, SessionFileRepository],
  exports:     [FacebookService, BrowserService, UserSessionStore],
})
export class FacebookModule {}
