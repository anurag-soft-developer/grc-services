import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  CustomQuestionResponseValue,
  Gender,
  IRunEventParticipant,
  ParticipantStatus,
} from '../interfaces/run-event-participant.interface';

export type RunEventParticipantDocument = Omit<
  IRunEventParticipant,
  '_id' | 'runEventId' | 'userId' | 'createdAt' | 'updatedAt' | 'submittedAt'
> &
  Document & {
    runEventId: Types.ObjectId;
    userId?: Types.ObjectId;
    submittedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
  };

@Schema({
  timestamps: true,
  toJSON: {
    transform: function (_doc, ret) {
      return ret;
    },
  },
})
export class RunEventParticipant extends Document {
  @Prop({ type: Types.ObjectId, ref: 'RunEvent', required: true, index: true })
  runEventId!: Types.ObjectId;

  @Prop({ type: String, trim: true })
  fullName?: string;

  @Prop({ type: String, trim: true })
  contactNumber?: string;

  @Prop({ type: String, enum: Object.values(Gender) })
  gender?: Gender;

  @Prop({ type: String, trim: true })
  instagramHandle?: string;

  @Prop({ type: String, trim: true })
  city?: string;

  @Prop({ type: [String], default: [] })
  howDidYouHearAboutUs?: string[];

  @Prop({ type: Boolean, default: false })
  guidelinesAgreed?: boolean;

  @Prop({
    type: Object,
    default: {},
  })
  customQuestionResponses!: Record<string, CustomQuestionResponseValue>;

  @Prop({
    type: String,
    enum: Object.values(ParticipantStatus),
    default: ParticipantStatus.DRAFT,
  })
  status!: ParticipantStatus;

  @Prop({ type: String, required: true, index: true })
  draftToken!: string;

  @Prop({ type: Date })
  submittedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RunEventParticipantSchema =
  SchemaFactory.createForClass(RunEventParticipant);

RunEventParticipantSchema.index(
  { runEventId: 1, contactNumber: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: ParticipantStatus.SUBMITTED,
      contactNumber: { $type: 'string', $ne: '' },
    },
  },
);

RunEventParticipantSchema.index({ draftToken: 1 });
