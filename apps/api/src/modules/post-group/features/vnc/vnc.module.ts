import { Module } from '@nestjs/common';
import { VncService } from './service/vnc.service';
import { VncController } from './controller/vnc.controller';

@Module({
  controllers: [VncController],
  providers: [VncService],
  exports: [VncService],
})
export class VncModule {}
