import { z } from 'zod'
import { uuidSchema, nonNegativeIntSchema } from '@/lib/forms/patterns'
import {
  standardTextSearchSchema,
  standardPaginationSchema,
  standardSortSchema,
} from '@/lib/api-helpers/query-builders'

// Shared enums reused across results-related endpoints
export const genderFilterEnum = z.enum(['male', 'female', 'all'])
export const ageGroupFilterEnum = z.enum([
  'mini',
  'U-09',
  'U-11',
  'U-13',
  'U-15',
  'U-17',
  'U-19',
  'U-21',
  'Seniors',
  'all',
])

// ========================================
// Dashboard endpoint schemas & types
// ========================================

export const dashboardQuerySchema = z.object({
  testIds: z
    .string()
    .min(1, 'At least one test ID is required')
    .transform((val) => val.split(',').map((id) => id.trim()))
    .pipe(z.array(uuidSchema).min(1).max(20)),
  q: z.string().optional(),
  gender: genderFilterEnum.optional(),
  ageGroup: ageGroupFilterEnum.optional(),
})

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>

/** A single test result within a player's dashboard data */
export interface DashboardPlayerResult {
  testId: string
  testName: string
  testDate: string
  leftHandScore: number
  rightHandScore: number
  forehandScore: number
  backhandScore: number
  totalScore: number
}

/** A player with their results across selected tests */
export interface DashboardPlayer {
  id: string
  name: string
  ageGroup: string
  gender: string
  results: DashboardPlayerResult[]
}

/** Test metadata returned alongside dashboard results */
export interface DashboardTest {
  id: string
  name: string
  dateConducted: string
  playingTime: number
  recoveryTime: number
}

/** Response shape for GET /api/v1/results/dashboard */
export interface DashboardResultsResponse {
  players: DashboardPlayer[]
  tests: DashboardTest[]
}

// ========================================
// Results list endpoint schemas
// ========================================

// Query parameters for GET /results
export const resultsQuerySchema = z
  .object({
    ...standardTextSearchSchema.shape,
    ...standardPaginationSchema.shape,
    ...standardSortSchema.shape,
    playerId: uuidSchema.optional(),
    testId: uuidSchema.optional(),
    gender: genderFilterEnum.optional(),
    ageGroup: ageGroupFilterEnum.optional(),
    yearOfBirth: z
      .string()
      .optional()
      .transform((val) => (val ? Number.parseInt(val, 10) : undefined))
      .refine(
        (val) => val === undefined || (val >= 1900 && val <= 2100),
        'Year of birth must be between 1900 and 2100',
      ),
    minScore: z
      .string()
      .optional()
      .transform((val) => (val ? Number.parseInt(val, 10) : undefined))
      .refine(
        (val) => val === undefined || val >= 0,
        'Minimum score must be non-negative',
      ),
    maxScore: z
      .string()
      .optional()
      .transform((val) => (val ? Number.parseInt(val, 10) : undefined))
      .refine(
        (val) => val === undefined || val >= 0,
        'Maximum score must be non-negative',
      ),
    dateFrom: z
      .string()
      .optional()
      .refine(
        (date) => !date || !Number.isNaN(Date.parse(date)),
        'Invalid date format for dateFrom',
      ),
    dateTo: z
      .string()
      .optional()
      .refine(
        (date) => !date || !Number.isNaN(Date.parse(date)),
        'Invalid date format for dateTo',
      ),
    // Sorting parameters
    sortBy: z
      .enum([
        'totalScore',
        'leftHandScore',
        'rightHandScore',
        'forehandScore',
        'backhandScore',
        'playerName',
        'ageGroup',
        'age',
        'createdAt',
      ])
      .optional(),
  })
  .strict()
  .refine((data) => {
    if (data.minScore !== undefined && data.maxScore !== undefined) {
      return data.minScore <= data.maxScore
    }
    return true
  }, 'Minimum score must be less than or equal to maximum score')

// Route parameters for GET /results/:id
export const resultsParamsSchema = z.object({
  id: uuidSchema,
})

// Create result schema for POST /results
export const resultsCreateSchema = z
  .object({
    playerId: uuidSchema,
    testId: uuidSchema,
    leftHandScore: nonNegativeIntSchema('Left hand score').max(
      999,
      'Left hand score cannot exceed 999',
    ),
    rightHandScore: nonNegativeIntSchema('Right hand score').max(
      999,
      'Right hand score cannot exceed 999',
    ),
    forehandScore: nonNegativeIntSchema('Forehand score').max(
      999,
      'Forehand score cannot exceed 999',
    ),
    backhandScore: nonNegativeIntSchema('Backhand score').max(
      999,
      'Backhand score cannot exceed 999',
    ),
  })
  .strict()

// Update result schema for PATCH /results/:id
export const resultsUpdateSchema = z
  .object({
    leftHandScore: nonNegativeIntSchema('Left hand score')
      .max(999, 'Left hand score cannot exceed 999')
      .optional(),
    rightHandScore: nonNegativeIntSchema('Right hand score')
      .max(999, 'Right hand score cannot exceed 999')
      .optional(),
    forehandScore: nonNegativeIntSchema('Forehand score')
      .max(999, 'Forehand score cannot exceed 999')
      .optional(),
    backhandScore: nonNegativeIntSchema('Backhand score')
      .max(999, 'Backhand score cannot exceed 999')
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update',
  )
  .strict()

// Bulk create results schema for POST /results/bulk
export const resultsBulkCreateSchema = z
  .object({
    results: z
      .array(resultsCreateSchema)
      .min(1, 'At least one result must be provided')
      .max(50, 'Cannot create more than 50 results at once'),
  })
  .strict()

// Inferred TypeScript types
export type ResultsQuery = z.infer<typeof resultsQuerySchema>
export type ResultsParams = z.infer<typeof resultsParamsSchema>
export type ResultsCreate = z.infer<typeof resultsCreateSchema>
export type ResultsUpdate = z.infer<typeof resultsUpdateSchema>
export type ResultsBulkCreate = z.infer<typeof resultsBulkCreateSchema>
