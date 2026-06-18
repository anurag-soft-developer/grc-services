import { NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import type { IRajorpayOrder } from '../../core/interfaces/rajorpay.interface';
import { RajorpayService } from '../../core/services/rajorpay/rajorpay.service';
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

  static generateInvoiceId(participantId: string): string {
    const now = new Date();
    const datePrefix = `${now.getFullYear()}${`${now.getMonth() + 1}`.padStart(
      2,
      '0',
    )}${`${now.getDate()}`.padStart(2, '0')}`;
    return `INV-${datePrefix}-${participantId.slice(-6).toUpperCase()}`;
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

  static applyFreeSubmissionFields(
    participant: RunEventParticipantDocument,
  ): void {
    participant.status = ParticipantStatus.SUBMITTED;
    participant.paymentStatus = PaymentStatus.PAID;
    participant.submittedAt = new Date();
    participant.paidAt = new Date();
    participant.invoiceId = RunEventParticipantsUtility.generateInvoiceId(
      participant._id.toString(),
    );
    participant.paymentExpiresAt = undefined;
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
    participant.paymentId = razorpayPaymentId;
    participant.paymentStatus = PaymentStatus.PAID;
    participant.status = ParticipantStatus.SUBMITTED;
    participant.submittedAt = new Date();
    participant.paidAt = new Date();
    participant.paymentExpiresAt = undefined;
    participant.invoiceId =
      participant.invoiceId ||
      RunEventParticipantsUtility.generateInvoiceId(participant._id.toString());

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
    order: IRajorpayOrder,
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
        rajorpayService.isPaymentLinkReusable(existingLink, order.amount)
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
      amountInPaise: order.amount,
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
        razorpayOrderId: order.id,
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
