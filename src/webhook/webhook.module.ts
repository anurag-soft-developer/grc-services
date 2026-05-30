import { Module } from '@nestjs/common';
import { RajorpayService } from '../core/services/rajorpay/rajorpay.service';
import { RunEventParticipantsModule } from '../run-event-participants/run-event-participants.module';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayWebhookService } from './razorpay-webhook.service';
import { RunEventParticipantWebhookService } from './run-event-participant-webhook.service';

@Module({
  imports: [RunEventParticipantsModule],
  controllers: [RazorpayWebhookController],
  providers: [
    RajorpayService,
    RunEventParticipantWebhookService,
    RazorpayWebhookService,
  ],
})
export class WebhookModule {}
