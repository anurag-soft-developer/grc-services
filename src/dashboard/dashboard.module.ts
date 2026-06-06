import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RunEventParticipant,
  RunEventParticipantSchema,
} from '../run-event-participants/schemas/run-event-participant.schema';
import { RunEvent, RunEventSchema } from '../run-events/schemas/run-event.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RunEvent.name, schema: RunEventSchema },
      { name: RunEventParticipant.name, schema: RunEventParticipantSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
