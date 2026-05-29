import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RunEventsModule } from '../run-events/run-events.module';
import {
  RunEventParticipant,
  RunEventParticipantSchema,
} from './schemas/run-event-participant.schema';
import { RunEventParticipantsController } from './run-event-participants.controller';
import { RunEventParticipantsService } from './run-event-participants.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RunEventParticipant.name, schema: RunEventParticipantSchema },
    ]),
    RunEventsModule,
  ],
  controllers: [RunEventParticipantsController],
  providers: [RunEventParticipantsService],
})
export class RunEventParticipantsModule {}
