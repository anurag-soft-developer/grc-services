import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BookingCounterDocument = BookingCounter & Document;

@Schema({ collection: 'booking_counters' })
export class BookingCounter {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: Number, required: true, default: 0 })
  seq!: number;
}

export const BookingCounterSchema =
  SchemaFactory.createForClass(BookingCounter);
