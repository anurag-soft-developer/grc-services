import { createZodDto , type ZodDto} from 'nestjs-zod';
import { z } from 'zod';
import { toEventDateRangeFilter } from '../../run-events/utility/run-events-list-filter.util';
import { PaymentStatus } from '../interfaces/run-event-participant.interface';

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
  search: z.string().trim().min(1).optional(),
  paymentStatus: z
    .enum(
      Object.values(PaymentStatus) as [PaymentStatus, ...PaymentStatus[]],
    )
    .optional(),
  submittedAt: z.coerce
    .date()
    .optional()
    .transform((date) => (date ? toEventDateRangeFilter(date) : undefined)),
});

export class ListParticipantsDto extends createZodDto(ListParticipantsSchema) {}

const ListMyParticipantsSchema = ListParticipantsSchema.extend({
  segment: z.enum(['upcoming', 'closed']).optional(),
  eventDate: z.coerce
    .date()
    .optional()
    .transform((date) => (date ? toEventDateRangeFilter(date) : undefined)),
  city: z.string().trim().min(1).optional(),
});

export class ListMyParticipantsDto extends createZodDto(
  ListMyParticipantsSchema,
) {}

const VerifyRazorpayPaymentSchema = z.object({
  participantId: z.string().min(1, 'Participant ID is required'),
  razorpay_order_id: z.string().min(1, 'Razorpay order id is required'),
  razorpay_payment_id: z.string().min(1, 'Razorpay payment id is required'),
  razorpay_signature: z.string().min(1, 'Razorpay signature is required'),
});

export class VerifyRazorpayPaymentDto extends createZodDto(
  VerifyRazorpayPaymentSchema,
) {}

const CreateOrderQuerySchema = z.object({
  paymentLink: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export class CreateOrderQueryDto extends createZodDto(CreateOrderQuerySchema) {}

const VerifyRazorpayHostedPaymentSchema = z.object({
  participantId: z.string().min(1, 'Participant ID is required'),
  razorpay_payment_link_id: z
    .string()
    .min(1, 'Razorpay payment link id is required'),
  razorpay_payment_link_reference_id: z
    .string()
    .min(1, 'Razorpay payment link reference id is required'),
  razorpay_payment_link_status: z
    .string()
    .min(1, 'Razorpay payment link status is required'),
  razorpay_payment_id: z.string().min(1, 'Razorpay payment id is required'),
  razorpay_signature: z.string().min(1, 'Razorpay signature is required'),
});

export class VerifyRazorpayHostedPaymentDto extends createZodDto(
  VerifyRazorpayHostedPaymentSchema,
) {}

export { ParticipantFieldsSchema, CustomQuestionResponsesSchema };
