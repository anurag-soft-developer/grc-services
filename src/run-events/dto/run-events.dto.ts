import { createZodDto, type ZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  CustomQuestionType,
  RunEventStatus,
} from '../interfaces/run-event.interface';

const LocationInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  long: z.number().min(-180).max(180),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  address: z.string().trim().min(1),
});

const CustomQuestionSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .regex(
        /^[a-z0-9_]+$/,
        'Key must be lowercase alphanumeric with underscores',
      ),
    label: z.string().trim().min(1),
    type: z.enum(
      Object.values(CustomQuestionType) as [
        CustomQuestionType,
        ...CustomQuestionType[],
      ],
    ),
    options: z.array(z.string().trim().min(1)).optional(),
    required: z.boolean().default(false),
    order: z.number().int().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    const needsOptions = [
      CustomQuestionType.SELECT,
      CustomQuestionType.RADIO,
      CustomQuestionType.CHECKBOX,
    ].includes(data.type);

    if (needsOptions && (!data.options || data.options.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Options are required for select, radio, and checkbox questions',
        path: ['options'],
      });
    }
  });

const RunEventBaseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  coverImages: z.array(z.url()).default([]),
  description: z.string().trim().min(1),
  eventDate: z.coerce.date(),
  reportingTime: z.string().trim().min(1),
  location: LocationInputSchema,
  price: z.number().min(0),
  currency: z.string().trim().min(1).max(10).default('INR'),
  maxParticipants: z.number().int().min(1),
  inclusions: z.array(z.string().trim().min(1)).default([]),
  guidelines: z.array(z.string().trim().min(1)).default([]),
  customQuestions: z.array(CustomQuestionSchema).default([]),
});

export class CreateRunEventDto extends createZodDto(RunEventBaseSchema) {}

const UpdateRunEventSchema = RunEventBaseSchema.partial().extend({
  archive: z.boolean().optional(),
});

export class UpdateRunEventDto extends createZodDto(UpdateRunEventSchema) {}

const GeoQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    long: z.coerce.number().min(-180).max(180).optional(),
    maxDistanceMeters: z.coerce.number().int().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const hasLat = data.lat !== undefined;
    const hasLong = data.long !== undefined;

    if (hasLat !== hasLong) {
      ctx.addIssue({
        code: 'custom',
        message: 'lat and long must be provided together',
        path: ['lat'],
      });
    }
  });

const ListRunEventsSchema = GeoQuerySchema.extend({
  status: z
    .enum(
      Object.values(RunEventStatus) as [RunEventStatus, ...RunEventStatus[]],
    )
    .optional(),
  isClosed: z.coerce.boolean().optional(),
  archive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export class ListRunEventsDto extends createZodDto(ListRunEventsSchema) {}

const ListPublishedRunEventsSchema = GeoQuerySchema.extend({
  segment: z.enum(['upcoming', 'closed']).default('upcoming'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export class ListPublishedRunEventsDto extends createZodDto(
  ListPublishedRunEventsSchema,
) {}
