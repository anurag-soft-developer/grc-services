import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookingCounter } from '../schemas/booking-counter.schema';

export const RUN_EVENT_PARTICIPANT_BOOKING_COUNTER_KEY =
  'run_event_participant_booking';

@Injectable()
export class BookingCounterService {
  constructor(
    @InjectModel(BookingCounter.name)
    private readonly bookingCounterModel: Model<BookingCounter>,
  ) {}

  async nextSequence(key: string): Promise<number> {
    const bookingCounter = await this.bookingCounterModel
      .findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { upsert: true, new: true },
      )
      .exec();

    return bookingCounter!.seq;
  }
}
