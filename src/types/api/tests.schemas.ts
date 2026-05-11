import { z } from 'zod'
import {
  nameSchema,
  uuidSchema,
  optionalUuidSchema,
  descriptionSchema,
  testVisibilitySchema,
  positiveIntSchema,
  nonNegativeIntSchema,
} from '@/lib/forms/patterns'

// Query parameters for GET /tests
export const testsQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(50, 'q must be less than 50 characters')
      .optional(),
    playingTime: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : undefined))
      .refine(
        (val) => val === undefined || val > 0,
        'Playing time must be positive'
      ),
    recoveryTime: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : undefined))
      .refine(
        (val) => val === undefined || val > 0,
        'Recovery time must be positive'
      ),
    dateFrom: z
      .string()
      .optional()
      .refine(
        (date) => !date || !isNaN(Date.parse(date)),
        'Invalid date format for dateFrom'
      ),
    dateTo: z
      .string()
      .optional()
      .refine(
        (date) => !date || !isNaN(Date.parse(date)),
        'Invalid date format for dateTo'
      ),
    visibility: testVisibilitySchema.optional(),
    organizationId: z
      .string()
      .optional()
      .transform((val) => {
        if (val === 'null') return null
        return val
      })
      .refine(
        (val) =>
          val === undefined || val === null || z.uuid().safeParse(val).success,
        'Invalid organization ID format'
      ),
    sortBy: z
      .enum([
        'name',
        'dateConducted',
        'createdAt',
        'updatedAt',
      ])
      .optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
    // Pagination parameters
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1))
      .refine((val) => val >= 1, 'Page must be greater than 0'),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 10))
      .refine(
        (val) => val >= 1 && val <= 100,
        'Limit must be between 1 and 100'
      ),
  })
  .strict()

// Route parameters for GET /tests/:id
export const testsParamsSchema = z.object({
  id: uuidSchema,
})

// Create test schema for POST /tests
export const testsCreateSchema = z
  .object({
    name: nameSchema,
    playingTime: positiveIntSchema('Playing time')
      .min(1, 'Playing time must be at least 1 minute')
      .max(300, 'Playing time cannot exceed 300 minutes'),
    recoveryTime: nonNegativeIntSchema('Recovery time')
      .max(300, 'Recovery time cannot exceed 300 minutes'),
    dateConducted: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), 'Invalid date format'),
    description: descriptionSchema,
    visibility: testVisibilitySchema.optional().default('public'),
    organizationId: optionalUuidSchema,
  })
  .strict()

// Update test schema for PATCH /tests/:id
export const testsUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    playingTime: positiveIntSchema('Playing time')
      .min(1, 'Playing time must be at least 1 minute')
      .max(300, 'Playing time cannot exceed 300 minutes')
      .optional(),
    recoveryTime: nonNegativeIntSchema('Recovery time')
      .max(300, 'Recovery time cannot exceed 300 minutes')
      .optional(),
    dateConducted: z
      .string()
      .refine((date) => !isNaN(Date.parse(date)), 'Invalid date format')
      .optional(),
    description: descriptionSchema,
    visibility: testVisibilitySchema.optional(),
    organizationId: optionalUuidSchema,
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  )
  .strict()

// Inferred TypeScript types
export type TestsQuery = z.infer<typeof testsQuerySchema>
export type TestsParams = z.infer<typeof testsParamsSchema>
export type TestsCreate = z.infer<typeof testsCreateSchema>
export type TestsUpdate = z.infer<typeof testsUpdateSchema>
