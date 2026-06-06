import { createZodDto, type ZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DashboardAnalyticsQuerySchema = z
  .object({
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
  })
  .superRefine((data, ctx) => {
    const hasFrom = data.fromDate !== undefined;
    const hasTo = data.toDate !== undefined;

    if (hasFrom !== hasTo) {
      ctx.addIssue({
        code: 'custom',
        message: 'fromDate and toDate must be provided together',
        path: ['fromDate'],
      });
    }

    if (data.fromDate && data.toDate && data.fromDate > data.toDate) {
      ctx.addIssue({
        code: 'custom',
        message: 'fromDate must be before or equal to toDate',
        path: ['toDate'],
      });
    }
  });

export class DashboardAnalyticsQueryDto extends createZodDto(
  DashboardAnalyticsQuerySchema,
) {}
