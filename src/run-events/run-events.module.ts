import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RunEventParticipantsModule } from '../run-event-participants/run-event-participants.module';
import { RunEvent, RunEventSchema } from './schemas/run-event.schema';
import { RunEventsController } from './run-events.controller';
import { RunEventsService } from './run-events.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RunEvent.name, schema: RunEventSchema },
    ]),
    forwardRef(() => RunEventParticipantsModule),
  ],
  controllers: [RunEventsController],
  providers: [RunEventsService],
  exports: [RunEventsService],
})
export class RunEventsModule {}
