import { Module } from '@nestjs/common';

import { ControlSessionController } from './control-session.controller';
import { ControlSessionService } from './control-session.service';

@Module({
  controllers: [ControlSessionController],
  providers: [ControlSessionService],
  exports: [ControlSessionService],
})
export class ControlSessionModule {}
