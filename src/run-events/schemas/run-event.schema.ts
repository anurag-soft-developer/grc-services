import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  CustomQuestionType,
  ICustomQuestion,
  IGeoPoint,
  IRunEvent,
  IRunEventLocation,
  RunEventStatus,
} from '../interfaces/run-event.interface';

export type RunEventDocument = Omit<
  IRunEvent,
  '_id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'eventDate' | 'location'
> &
  Document & {
    createdBy: Types.ObjectId;
    eventDate: Date;
    location: RunEventLocation;
    createdAt: Date;
    updatedAt: Date;
  };

@Schema({ _id: false })
export class GeoPoint implements IGeoPoint {
  @Prop({ type: String, enum: ['Point'], required: true, default: 'Point' })
  type!: 'Point';

  @Prop({
    type: [Number],
    required: true,
    validate: {
      validator: (coords: number[]) =>
        Array.isArray(coords) &&
        coords.length === 2 &&
        coords[0] >= -180 &&
        coords[0] <= 180 &&
        coords[1] >= -90 &&
        coords[1] <= 90,
      message: 'Coordinates must be [longitude, latitude]',
    },
  })
  coordinates!: [number, number];
}

const GeoPointSchema = SchemaFactory.createForClass(GeoPoint);

@Schema({ _id: false })
export class RunEventLocation implements Omit<IRunEventLocation, 'lat' | 'long'> {
  @Prop({ type: String, required: true, trim: true })
  city!: string;

  @Prop({ type: String, required: true, trim: true })
  state!: string;

  @Prop({ type: String, required: true, trim: true })
  address!: string;

  @Prop({ type: GeoPointSchema, required: true })
  geo!: GeoPoint;
}

const RunEventLocationSchema = SchemaFactory.createForClass(RunEventLocation);

@Schema({ _id: false })
export class CustomQuestion implements ICustomQuestion {
  @Prop({ type: String, required: true, trim: true })
  key!: string;

  @Prop({ type: String, required: true, trim: true })
  label!: string;

  @Prop({
    type: String,
    enum: Object.values(CustomQuestionType),
    required: true,
  })
  type!: CustomQuestionType;

  @Prop({ type: [String], default: [] })
  options?: string[];

  @Prop({ type: Boolean, required: true, default: false })
  required!: boolean;

  @Prop({ type: Number, required: true, default: 0 })
  order!: number;
}

const CustomQuestionSchema = SchemaFactory.createForClass(CustomQuestion);

@Schema({
  timestamps: true,
  toJSON: {
    transform: function (_doc, ret) {
      return ret;
    },
  },
})
export class RunEvent extends Document {
  @Prop({ type: String, required: true, trim: true })
  title!: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  })
  slug!: string;

  @Prop({ type: [String], default: [] })
  coverImages!: string[];

  @Prop({ type: String, required: true })
  description!: string;

  @Prop({ type: Date, required: true })
  eventDate!: Date;

  @Prop({ type: String, required: true, trim: true })
  reportingTime!: string;

  @Prop({ type: RunEventLocationSchema, required: true })
  location!: RunEventLocation;

  @Prop({ type: Number, required: true, min: 0 })
  price!: number;

  @Prop({
    type: String,
    required: true,
    default: 'INR',
    trim: true,
    uppercase: true,
  })
  currency!: string;

  @Prop({ type: [String], default: [] })
  inclusions!: string[];

  @Prop({ type: [String], default: [] })
  guidelines!: string[];

  @Prop({ type: [CustomQuestionSchema], default: [] })
  customQuestions!: CustomQuestion[];

  @Prop({
    type: String,
    enum: Object.values(RunEventStatus),
    default: RunEventStatus.DRAFT,
  })
  status!: RunEventStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RunEventSchema = SchemaFactory.createForClass(RunEvent);

RunEventSchema.index({ status: 1, eventDate: -1 });
RunEventSchema.index({ 'location.geo': '2dsphere' });
