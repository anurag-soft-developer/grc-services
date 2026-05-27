import { createZodDto, type ZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SearchUsersListSchema = z.object({
  query: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export class SearchUsersListDto extends createZodDto(SearchUsersListSchema) {}
