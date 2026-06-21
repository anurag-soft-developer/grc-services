import { NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import type { IRajorpayOrder } from '../../core/interfaces/rajorpay.interface';
import { RajorpayService } from '../../core/services/rajorpay/rajorpay.service';
import type { EventDateRangeFilter } from '../../run-events/utility/run-events-list-filter.util';
import {
  buildCityFilterValue,
  startOfTodayUtc,
} from '../../run-events/utility/run-events-list-filter.util';
import type { IUser } from '../../users/interfaces/user.interface';
import { SaveParticipantDraftDto } from '../dto/run-event-participants.dto';
import {
  ParticipantStatus,
  PaymentStatus,
} from '../interfaces/run-event-participant.interface';
import {
  RunEventParticipant,
  RunEventParticipantDocument,
} from '../schemas/run-event-participant.schema';
import { RunEventParticipantsValidationUtility } from './run-event-participants.validation.utility';

export class RunEventParticipantsUtility {
  private static readonly PAYMENT_HOLD_MINUTES = 20;

  static getPaymentExpiryDate(): Date {
    const now = new Date();
    now.setMinutes(
      now.getMinutes() + RunEventParticipantsUtility.PAYMENT_HOLD_MINUTES,
    );
    return now;
  }

  static async applyFreeSubmissionFields(
    participant: RunEventParticipantDocument,
    allocateBookingId: () => Promise<number>,
  ): Promise<void> {
    participant.status = ParticipantStatus.SUBMITTED;
    participant.paymentStatus = PaymentStatus.PAID;
    participant.submittedAt = new Date();
    participant.paidAt = new Date();
    participant.paymentExpiresAt = undefined;
    if (participant.bookingId == null) {
      participant.bookingId = await allocateBookingId();
    }
  }

  static applyDraftUpdate(
    participant: RunEventParticipantDocument,
    dto: SaveParticipantDraftDto,
  ): void {
    if (dto.customQuestionResponses) {
      participant.customQuestionResponses = {
        ...participant.customQuestionResponses,
        ...dto.customQuestionResponses,
      };
      participant.markModified('customQuestionResponses');
    }
  }

  static applyUserSnapshot(
    participant: RunEventParticipantDocument,
    user: Pick<IUser, 'fullName' | 'email' | 'phone'>,
  ): void {
    participant.fullName = user.fullName?.trim() || undefined;
    participant.email = user.email.trim();
    participant.phone = user.phone?.trim() || undefined;
  }

  static applyPendingPaymentFields(
    participant: RunEventParticipantDocument,
    totalAmount: number,
  ): void {
    participant.totalAmount = totalAmount;
    participant.paymentStatus = PaymentStatus.PENDING;
    participant.status = ParticipantStatus.PENDING_PAYMENT;
    participant.paymentExpiresAt =
      RunEventParticipantsUtility.getPaymentExpiryDate();
    participant.submittedAt = undefined;
  }

  static applyFailedPaymentFields(
    participant: RunEventParticipantDocument,
    cancelReason: string,
  ): void {
    participant.paymentStatus = PaymentStatus.FAILED;
    participant.status = ParticipantStatus.CANCELLED;
    participant.cancelledAt = new Date();
    participant.cancelReason = cancelReason;
    participant.paymentExpiresAt = undefined;
    RunEventParticipantsUtility.clearRazorpayPaymentFields(participant);
  }

  static clearRazorpayPaymentFields(
    participant: RunEventParticipantDocument,
  ): void {
    participant.razorpayOrderId = undefined;
    participant.razorpayPaymentLinkId = undefined;
    participant.razorpayPaymentLinkShortUrl = undefined;
    participant.razorpayPaymentLinkCallbackUrl = undefined;
  }

  static applyRefundFields(
    participant: RunEventParticipantDocument,
    params: {
      event: string;
      refundId?: string;
      refundAmount?: number;
    },
  ): void {
    if (params.event === 'refund.processed') {
      participant.paymentStatus = PaymentStatus.REFUNDED;
      participant.refundId = params.refundId ?? participant.refundId;
      participant.refundedAt = new Date();
      if (params.refundAmount !== undefined) {
        participant.refundAmount = params.refundAmount;
      }
    }
  }

  static async findDraftByEventAndUser(
    participantModel: Model<RunEventParticipant>,
    runEventId: string,
    userId: string,
  ): Promise<RunEventParticipantDocument> {
    const participant = await participantModel
      .findOne({
        runEventId,
        userId,
        status: ParticipantStatus.DRAFT,
      })
      .exec();

    if (!participant) {
      throw new NotFoundException('Draft not found');
    }

    return participant;
  }

  static async findPendingPaymentByEventAndUser(
    participantModel: Model<RunEventParticipant>,
    runEventId: string,
    userId: string,
  ): Promise<RunEventParticipantDocument> {
    const participant = await participantModel
      .findOne({
        runEventId,
        userId,
        status: ParticipantStatus.PENDING_PAYMENT,
      })
      .exec();

    if (!participant) {
      throw new NotFoundException('Pending payment registration not found');
    }

    return participant;
  }

  static async confirmPaidParticipant(
    participantModel: Model<RunEventParticipant>,
    participant: RunEventParticipantDocument,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    allocateBookingId: () => Promise<number>,
  ): Promise<void> {
    if (participant.paymentStatus === PaymentStatus.PAID) {
      return;
    }

    await RunEventParticipantsValidationUtility.assertNoDuplicateSubmission(
      participantModel,
      participant.runEventId.toString(),
      participant.userId.toString(),
      participant._id.toString(),
    );

    participant.razorpayOrderId = razorpayOrderId;
    participant.razorpayPaymentId = razorpayPaymentId;
    participant.paymentStatus = PaymentStatus.PAID;
    participant.status = ParticipantStatus.SUBMITTED;
    participant.submittedAt = new Date();
    participant.paidAt = new Date();
    participant.paymentExpiresAt = undefined;
    if (participant.bookingId == null) {
      participant.bookingId = await allocateBookingId();
    }

    await participant.save();
  }

  static async resolveOrCreateRazorpayOrder(
    rajorpayService: RajorpayService,
    participant: RunEventParticipantDocument,
    participantId: string,
  ): Promise<IRajorpayOrder> {
    const totalAmount = participant.totalAmount!;

    if (participant.razorpayOrderId) {
      const existingOrder = await rajorpayService.getOrder(
        participant.razorpayOrderId,
      );
      if (
        existingOrder &&
        rajorpayService.isOrderReusable(existingOrder, totalAmount)
      ) {
        return existingOrder;
      }

      RunEventParticipantsUtility.clearRazorpayPaymentFields(participant);
    }

    const order = await rajorpayService.createOrder(
      totalAmount,
      `participant_${participantId}`,
    );

    participant.razorpayOrderId = order.id;
    await participant.save();

    return order;
  }

  static async resolveOrCreateRazorpayPaymentLink(
    rajorpayService: RajorpayService,
    participant: RunEventParticipantDocument,
    user: IUser,
    runEventId: string,
    participantId: string,
    amountInPaise: number,
    callbackUrl: string,
    expireBy: number,
  ): Promise<{ id: string; shortUrl: string; callbackUrl: string }> {
    if (
      participant.razorpayPaymentLinkId &&
      participant.razorpayPaymentLinkShortUrl &&
      participant.razorpayPaymentLinkCallbackUrl
    ) {
      const existingLink = await rajorpayService.getPaymentLink(
        participant.razorpayPaymentLinkId,
      );
      if (
        existingLink &&
        rajorpayService.isPaymentLinkReusable(existingLink, amountInPaise)
      ) {
        return {
          id: participant.razorpayPaymentLinkId,
          shortUrl: participant.razorpayPaymentLinkShortUrl,
          callbackUrl: participant.razorpayPaymentLinkCallbackUrl,
        };
      }

      participant.razorpayPaymentLinkId = undefined;
      participant.razorpayPaymentLinkShortUrl = undefined;
      participant.razorpayPaymentLinkCallbackUrl = undefined;
    }

    const link = await rajorpayService.createPaymentLink({
      amountInPaise,
      referenceId: `participant_${participantId}`,
      description: 'Event registration payment',
      callbackUrl,
      expireBy,
      customer: {
        name: user.fullName,
        email: user.email,
        contact: user.phone,
      },
      notes: {
        participantId,
        eventId: runEventId,
      },
    });

    participant.razorpayPaymentLinkId = link.id;
    participant.razorpayPaymentLinkShortUrl = link.short_url;
    participant.razorpayPaymentLinkCallbackUrl = callbackUrl;
    await participant.save();

    return {
      id: link.id,
      shortUrl: link.short_url,
      callbackUrl,
    };
  }
}

export type MyRegistrationsSegment = 'upcoming' | 'closed';

export interface MyRegistrationsListFilters {
  segment?: MyRegistrationsSegment;
  eventDate?: EventDateRangeFilter;
  city?: string;
}

export function needsEventJoinForMyRegistrations(
  filters: MyRegistrationsListFilters,
): boolean {
  return (
    filters.segment !== undefined ||
    filters.eventDate !== undefined ||
    filters.city !== undefined
  );
}

export function buildEventMatchForMyRegistrations(
  filters: MyRegistrationsListFilters,
): Record<string, unknown> {
  const match: Record<string, unknown> = {
    archive: { $ne: true },
  };

  if (filters.segment === 'upcoming') {
    match.isClosed = { $ne: true };
    match.eventDate = filters.eventDate ?? { $gte: startOfTodayUtc() };
  } else if (filters.segment === 'closed') {
    match.isClosed = true;
    if (filters.eventDate) {
      match.eventDate = filters.eventDate;
    }
  } else if (filters.eventDate) {
    match.eventDate = filters.eventDate;
  }

  if (filters.city) {
    match['location.city'] = buildCityFilterValue(filters.city);
  }

  return match;
}

export function sortForMyRegistrations(
  filters: MyRegistrationsListFilters,
): Record<string, 1 | -1> {
  if (filters.segment === 'closed') {
    return { 'event.closedAt': -1, 'event.eventDate': -1 };
  }
  return { 'event.eventDate': 1 };
}
