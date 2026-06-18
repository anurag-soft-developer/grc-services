import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { RunEvent } from '../../run-events/schemas/run-event.schema';
import { User } from '../../users/schemas/user.schema';
import {
  CustomQuestionResponseValue,
  IRunEventParticipant,
  ParticipantStatus,
  PaymentStatus,
} from '../interfaces/run-event-participant.interface';

export type RunEventParticipantDocument = Omit<
  IRunEventParticipant,
  | '_id'
  | 'runEventId'
  | 'userId'
  | 'createdAt'
  | 'updatedAt'
  | 'submittedAt'
  | 'paidAt'
  | 'paymentExpiresAt'
  | 'refundedAt'
  | 'cancelledAt'
> &
  Document & {
    runEventId: Types.ObjectId;
    userId: Types.ObjectId;
    submittedAt?: Date;
    paidAt?: Date;
    paymentExpiresAt?: Date;
    refundedAt?: Date;
    cancelledAt?: Date;
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
  @Prop({ type: Types.ObjectId, ref: RunEvent.name, required: true })
  runEventId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  userId!: Types.ObjectId;

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

  @Prop({ type: Number, min: 0 })
  totalAmount?: number;

  @Prop({
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING,
  })
  paymentStatus!: PaymentStatus;

  @Prop({ type: String })
  paymentId?: string;

  @Prop({ type: String })
  razorpayOrderId?: string;

  @Prop({ type: String })
  razorpayPaymentLinkId?: string;

  @Prop({ type: String })
  razorpayPaymentLinkShortUrl?: string;

  @Prop({ type: String })
  razorpayPaymentLinkCallbackUrl?: string;

  @Prop({ type: String })
  invoiceId?: string;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ type: Date })
  paymentExpiresAt?: Date;

  @Prop({ type: String })
  refundId?: string;

  @Prop({ type: Date })
  refundedAt?: Date;

  @Prop({ type: Number, min: 0 })
  refundAmount?: number;

  @Prop({ type: String, maxlength: 200 })
  cancelReason?: string;

  @Prop({ type: Date })
  cancelledAt?: Date;

  @Prop({ type: Date })
  submittedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RunEventParticipantSchema =
  SchemaFactory.createForClass(RunEventParticipant);

RunEventParticipantSchema.index(
  { runEventId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          ParticipantStatus.DRAFT,
          ParticipantStatus.SUBMITTED,
          ParticipantStatus.PENDING_PAYMENT,
        ],
      },
    },
  },
);

RunEventParticipantSchema.index({ razorpayOrderId: 1 });
RunEventParticipantSchema.index({ razorpayPaymentLinkId: 1 });
RunEventParticipantSchema.index({ paymentId: 1 });
RunEventParticipantSchema.index({ status: 1, paymentExpiresAt: 1 });
