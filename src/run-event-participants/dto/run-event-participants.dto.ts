import { createZodDto , type ZodDto} from 'nestjs-zod';
import { z } from 'zod';
import { Gender } from '../interfaces/run-event-participant.interface';

const CustomQuestionResponsesSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string()), z.boolean()]),
);

const ParticipantFieldsSchema = z.object({
  customQuestionResponses: CustomQuestionResponsesSchema.optional(),
});

export class SaveParticipantDraftDto extends createZodDto(
  ParticipantFieldsSchema,
) {}

export class SubmitParticipantDto extends createZodDto(
  ParticipantFieldsSchema,
) {}

const ListParticipantsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export class ListParticipantsDto extends createZodDto(ListParticipantsSchema) {}

export class ListMyParticipantsDto extends createZodDto(ListParticipantsSchema) {}

const VerifyRazorpayPaymentSchema = z.object({
  participantId: z.string().min(1, 'Participant ID is required'),
  razorpay_order_id: z.string().min(1, 'Razorpay order id is required'),
  razorpay_payment_id: z.string().min(1, 'Razorpay payment id is required'),
  razorpay_signature: z.string().min(1, 'Razorpay signature is required'),
});

export class VerifyRazorpayPaymentDto extends createZodDto(
  VerifyRazorpayPaymentSchema,
) {}

export { Gender, ParticipantFieldsSchema, CustomQuestionResponsesSchema };
