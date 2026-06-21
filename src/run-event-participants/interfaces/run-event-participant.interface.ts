export enum ParticipantStatus {
  DRAFT = 'draft',
  PENDING_PAYMENT = 'pending_payment',
  SUBMITTED = 'submitted',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export type CustomQuestionResponseValue = string | string[] | boolean;

export type MyEventRegistrationStatusType =
  | 'none'
  | 'draft'
  | 'pending_payment'
  | 'submitted'
  | 'cancelled';

export interface IMyEventRegistrationStatus {
  status: MyEventRegistrationStatusType;
  participantId?: string;
  paymentExpiresAt?: string;
  paymentHoldExpired?: boolean;
}

export interface IRunEventParticipant {
  _id: string;
  runEventId: string;
  userId: string;
  fullName?: string;
  email?: string;
  phone?: string;
  customQuestionResponses: Record<string, CustomQuestionResponseValue>;
  status: ParticipantStatus;
  totalAmount?: number;
  paymentStatus: PaymentStatus;
  paymentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentLinkId?: string;
  razorpayPaymentLinkShortUrl?: string;
  razorpayPaymentLinkCallbackUrl?: string;
  invoiceId?: string;
  paidAt?: Date;
  paymentExpiresAt?: Date;
  refundId?: string;
  refundedAt?: Date;
  refundAmount?: number;
  cancelReason?: string;
  cancelledAt?: Date;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
