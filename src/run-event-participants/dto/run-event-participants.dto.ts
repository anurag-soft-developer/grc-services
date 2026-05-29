import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { GENDERS, HEAR_ABOUT_US_OPTIONS } from '../constants/common-fields';
import { Gender } from '../interfaces/run-event-participant.interface';

const CustomQuestionResponsesSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string()), z.boolean()]),
);

const ParticipantFieldsSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  contactNumber: z.string().trim().min(1).optional(),
  gender: z.enum(GENDERS).optional(),
  instagramHandle: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  howDidYouHearAboutUs: z.array(z.enum(HEAR_ABOUT_US_OPTIONS)).optional(),
  guidelinesAgreed: z.boolean().optional(),
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

const ResumeDraftSchema = z.object({
  token: z.string().trim().min(1),
});

export class ResumeDraftDto extends createZodDto(ResumeDraftSchema) {}

export { Gender, ParticipantFieldsSchema, CustomQuestionResponsesSchema };
