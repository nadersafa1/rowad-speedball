import { z } from 'zod'
import { and, type SQL } from 'drizzle-orm'

/**
 * Standardized pagination schema
 * Default: page=1, limit=10
 * Validates: page >= 1, limit between 1-100
 */
export const standardPaginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 1))
    .refine((val) => val >= 1, 'Page must be greater than 0'),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 10))
    .refine((val) => val >= 1 && val <= 100, 'Limit must be between 1 and 100'),
})

/**
 * Standardized sort order schema
 * Default: desc
 */
export const standardSortSchema = z.object({
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

/**
 * Standardized text search schema
 * Validates: max 100 characters, trimmed
 */
export const standardTextSearchSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100, 'Search query must be less than 100 characters')
    .optional(),
})

/**
 * Standardized date range filter schema
 */
export const standardDateRangeSchema = z.object({
  dateFrom: z
    .string()
    .refine(
      (date) => !Number.isNaN(Date.parse(date)),
      'Invalid dateFrom format',
    )
    .optional(),
  dateTo: z
    .string()
    .refine((date) => !Number.isNaN(Date.parse(date)), 'Invalid dateTo format')
    .optional(),
})

/**
 * Standardized organizationId filter schema
 * Supports: undefined, null (for filtering unassigned), or valid UUID
 */
export const standardOrganizationFilterSchema = z.object({
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
      'Invalid organization ID format',
    ),
})

/**
 * Calculate pagination offset from page and limit
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit
}

/**
 * Apply standard conditions reducer pattern
 * Combines multiple Drizzle conditions with AND
 */
export function combineConditions(
  conditions: (SQL<unknown> | undefined)[],
): SQL<unknown> | undefined {
  const validConditions = conditions.filter(
    (c) => c !== undefined,
  ) as SQL<unknown>[]

  if (validConditions.length === 0) {
    return undefined
  }

  return validConditions.reduce<SQL<unknown> | undefined>(
    (acc, condition) => (acc ? and(acc, condition) : condition),
    undefined,
  )
}

/**
 * Inferred types for standardized schemas
 */
export type StandardPagination = z.infer<typeof standardPaginationSchema>
export type StandardSort = z.infer<typeof standardSortSchema>
export type StandardTextSearch = z.infer<typeof standardTextSearchSchema>
export type StandardDateRange = z.infer<typeof standardDateRangeSchema>
export type StandardOrganizationFilter = z.infer<
  typeof standardOrganizationFilterSchema
>
