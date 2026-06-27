import { Module } from '@nestjs/common';
import { FacebookController } from './controller/facebook.controller';
import { FacebookService } from './service/facebook.service';
import { BrowserService } from './infrastructure/browser.service';
import { UserSessionStore } from './infrastructure/user-session.store';
import { SessionFileRepository } from './repository/session-file.repository';
import { VncModule } from '../vnc/vnc.module';

@Module({
  imports:     [VncModule],
  controllers: [FacebookController],
  providers:   [FacebookService, BrowserService, UserSessionStore, SessionFileRepository],
  exports:     [FacebookService, BrowserService, UserSessionStore],
})
export class FacebookModule {}
