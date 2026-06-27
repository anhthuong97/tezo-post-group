import { Module } from '@nestjs/common';
import { GroupsController } from './controller/groups.controller';
import { GroupsService } from './service/groups.service';
import { FacebookModule } from '../facebook/facebook.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports:     [FacebookModule, IdentityModule],
  controllers: [GroupsController],
  providers:   [GroupsService],
})
export class GroupsModule {}
