import { BadRequestException, Injectable } from '@nestjs/common';
import { RajorpayService } from '../core/services/rajorpay/rajorpay.service';
import { RunEventParticipantsService } from '../run-event-participants/run-event-participants.service';
import { RazorpayWebhookPayloadDto } from './dto/razorpay-webhook.dto';
import { RunEventParticipantWebhookService } from './run-event-participant-webhook.service';

@Injectable()
export class RazorpayWebhookService {
  constructor(
    private readonly rajorpayService: RajorpayService,
    private readonly participantWebhookService: RunEventParticipantWebhookService,
    private readonly participantsService: RunEventParticipantsService,
  ) {}

  async handleRazorpayWebhook(
    webhookPayload: RazorpayWebhookPayloadDto,
    rawWebhookPayload: string,
    webhookSignature: string | undefined,
  ): Promise<{ processed: boolean; message: string }> {
    await this.participantsService.releaseExpiredPaymentHolds();
    if (!webhookSignature) {
      throw new BadRequestException('Missing webhook signature');
    }
    if (!rawWebhookPayload) {
      throw new BadRequestException('Missing raw webhook payload');
    }

    const isValidSignature = this.rajorpayService.verifyWebhookSignature(
      rawWebhookPayload,
      webhookSignature,
    );
    if (!isValidSignature) {
      throw new BadRequestException('Invalid webhook signature');
    }

    return this.participantWebhookService.processWebhookEvent(webhookPayload);
  }
}
