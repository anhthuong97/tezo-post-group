import { Module } from '@nestjs/common';
import { FacebookController } from './controller/facebook.controller';
import { FacebookService } from './service/facebook.service';
import { BrowserService } from './infrastructure/browser.service';
import { UserSessionStore } from './infrastructure/user-session.store';
import { SessionFileRepository } from './repository/session-file.repository';

@Module({
  controllers: [FacebookController],
  providers:   [FacebookService, BrowserService, UserSessionStore, SessionFileRepository],
  exports:     [FacebookService, BrowserService, UserSessionStore],
})
export class FacebookModule {}
