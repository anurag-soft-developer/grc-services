import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BookingCounter,
  BookingCounterSchema,
} from '../core/schemas/booking-counter.schema';
import { BookingCounterService } from '../core/services/booking-counter.service';
import { RajorpayService } from '../core/services/rajorpay/rajorpay.service';
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
      { name: BookingCounter.name, schema: BookingCounterSchema },
    ]),
    forwardRef(() => RunEventsModule),
  ],
  controllers: [RunEventParticipantsController],
  providers: [
    RunEventParticipantsService,
    RajorpayService,
    BookingCounterService,
  ],
  exports: [RunEventParticipantsService],
})
export class RunEventParticipantsModule {}
