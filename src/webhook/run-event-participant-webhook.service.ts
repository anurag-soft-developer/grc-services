import { Injectable } from '@nestjs/common';
import { RunEventParticipantsService } from '../run-event-participants/run-event-participants.service';
import { RazorpayWebhookPayloadDto } from './dto/razorpay-webhook.dto';

@Injectable()
export class RunEventParticipantWebhookService {
  constructor(
    private readonly participantsService: RunEventParticipantsService,
  ) {}

  async processWebhookEvent(eventPayload: RazorpayWebhookPayloadDto): Promise<{
    processed: boolean;
    message: string;
  }> {
    const eventType = eventPayload.event;
    if (eventType === 'payment_link.paid') {
      await this.applyPaymentLinkPaidWebhook(eventPayload);
      return { processed: true, message: `${eventType} processed` };
    }

    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      await this.applyCapturedPaymentWebhook(eventPayload);
      return { processed: true, message: `${eventType} processed` };
    }

    if (eventType === 'payment.failed') {
      await this.applyFailedPaymentWebhook(eventPayload);
      return { processed: true, message: 'payment.failed processed' };
    }

    if (eventType === 'refund.processed' || eventType === 'refund.failed') {
      await this.applyRefundWebhook(eventPayload);
      return { processed: true, message: `${eventType} processed` };
    }

    return { processed: false, message: `Event ${eventType} ignored` };
  }

  private async applyPaymentLinkPaidWebhook(
    payload: RazorpayWebhookPayloadDto,
  ): Promise<void> {
    const linkEntity = (
      payload.payload?.payment_link as
        | { entity?: Record<string, unknown> }
        | undefined
    )?.entity;
    const paymentEntity = (
      payload.payload?.payment as { entity?: Record<string, unknown> } | undefined
    )?.entity;

    const paymentLinkId =
      typeof linkEntity?.id === 'string' ? linkEntity.id : undefined;
    const paymentId =
      typeof paymentEntity?.id === 'string' ? paymentEntity.id : undefined;

    if (!paymentLinkId || !paymentId) {
      return;
    }

    await this.participantsService.confirmPaidParticipantByPaymentLinkId(
      paymentLinkId,
      paymentId,
    );
  }

  private async applyCapturedPaymentWebhook(
    payload: RazorpayWebhookPayloadDto,
  ): Promise<void> {
    const paymentEntity = (
      payload.payload?.payment as { entity?: Record<string, unknown> } | undefined
    )?.entity;
    const orderId =
      typeof paymentEntity?.order_id === 'string'
        ? paymentEntity.order_id
        : undefined;
    const paymentId =
      typeof paymentEntity?.id === 'string' ? paymentEntity.id : undefined;
    if (!orderId || !paymentId) {
      return;
    }

    await this.participantsService.confirmPaidParticipantByOrderId(
      orderId,
      paymentId,
    );
  }

  private async applyFailedPaymentWebhook(
    payload: RazorpayWebhookPayloadDto,
  ): Promise<void> {
    const paymentEntity = (
      payload.payload?.payment as { entity?: Record<string, unknown> } | undefined
    )?.entity;
    const orderId =
      typeof paymentEntity?.order_id === 'string'
        ? paymentEntity.order_id
        : undefined;
    if (!orderId) {
      return;
    }

    await this.participantsService.applyFailedPaymentByOrderId(orderId);
  }

  private async applyRefundWebhook(
    payload: RazorpayWebhookPayloadDto,
  ): Promise<void> {
    const refundEntity = (
      payload.payload?.refund as
        | { entity?: Record<string, unknown> }
        | undefined
    )?.entity;
    if (!refundEntity) {
      return;
    }
    const paymentId =
      typeof refundEntity.payment_id === 'string'
        ? refundEntity.payment_id
        : undefined;
    if (!paymentId) {
      return;
    }

    await this.participantsService.applyRefundWebhook({
      razorpayPaymentId: paymentId,
      event: payload.event,
      refundId:
        typeof refundEntity.id === 'string' ? refundEntity.id : undefined,
      refundAmount:
        typeof refundEntity.amount === 'number'
          ? Math.round((refundEntity.amount / 100) * 100) / 100
          : undefined,
    });
  }
}
