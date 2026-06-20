import { createZodDto, type ZodDto } from 'nestjs-zod';
import { z } from 'zod';

const PlacesAutocompleteQuerySchema = z.object({
  input: z.string().trim().min(2),
  countries: z
    .string()
    .trim()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((country) => country.trim().toLowerCase())
            .filter(Boolean)
        : ['in'],
    ),
  language: z.string().trim().min(2).default('en'),
});

export class PlacesAutocompleteQueryDto extends createZodDto(
  PlacesAutocompleteQuerySchema,
) {}

const PlacesDetailsQuerySchema = z.object({
  placeId: z.string().trim().min(1),
  language: z.string().trim().min(2).default('en'),
});

export class PlacesDetailsQueryDto extends createZodDto(
  PlacesDetailsQuerySchema,
) {}
