import { z } from 'zod'
import type { PositionScores, PositionKey } from '@/types/position-scores'
import { POSITION_KEYS } from '@/types/position-scores'
import { uuidSchema, nonNegativeIntSchema } from '@/lib/forms/patterns'
import {
  standardPaginationSchema,
  standardSortSchema,
  standardTextSearchSchema,
} from '@/lib/api-helpers/query-builders'

// Position scores schema for JSONB column
// Keys: R, L, F, B - represent positions
// Values: number (score) or null (position assigned but score pending)
export const positionScoresSchema = z
  .object({
    R: nonNegativeIntSchema('Position R').nullable().optional(),
    L: nonNegativeIntSchema('Position L').nullable().optional(),
    F: nonNegativeIntSchema('Position F').nullable().optional(),
    B: nonNegativeIntSchema('Position B').nullable().optional(),
  })
  .nullable()
  .optional()
  .refine((data) => {
    if (data === null || data === undefined) return true
    // If provided, must have at least one position key
    const keys = Object.keys(data) as PositionKey[]
    return keys.length === 0 || keys.some((k) => POSITION_KEYS.includes(k))
  }, 'If provided, positionScores must have at least one valid position key')

// Query parameters for GET /registrations
export const registrationsQuerySchema = z
  .object({
    ...standardTextSearchSchema.shape,
    ...standardPaginationSchema.shape,
    ...standardSortSchema.shape,
    eventId: uuidSchema.optional(),
    groupId: z
      .string()
      .optional()
      .transform((val) => {
        if (val === 'null' || val === 'all') return undefined
        return val
      })
      .refine(
        (val) => val === undefined || z.uuid().safeParse(val).success,
        'Invalid group ID format'
      ),
    organizationId: z
      .string()
      .optional()
      .transform((val) => {
        if (val === 'null' || val === 'all') return undefined
        return val
      })
      .refine(
        (val) => val === undefined || z.uuid().safeParse(val).success,
        'Invalid organization ID format'
      ),

    sortBy: z
      .enum([
        'totalScore',
        'createdAt',
        'rank',
        'playerName',
        'heat',
        'club',
        'positionR',
        'positionL',
        'positionF',
        'positionB',
      ])
      .optional(),
  })
  .strict()

// Route parameters for GET /registrations/:id
export const registrationsParamsSchema = z.object({
  id: uuidSchema,
})

// Player with position scores and order for team events
export const playerWithPositionSchema = z.object({
  playerId: uuidSchema,
  positionScores: positionScoresSchema,
  order: z.number().int().min(1).optional(),
})

// Create registration schema for POST /registrations
export const registrationsCreateSchema = z.object({
  eventId: uuidSchema,
  playerIds: z.array(uuidSchema).min(1, 'At least one player is required'),
  // Optional: players with position scores and order for team events
  players: z.array(playerWithPositionSchema).optional(),
})

// Update registration schema for PATCH /registrations/:id
export const registrationsUpdateSchema = z
  .object({
    groupId: uuidSchema.nullable().optional(),
    qualified: z.boolean().optional(),
    playerIds: z
      .array(uuidSchema)
      .min(1, 'At least one player is required')
      .optional(),
    // Optional: players with position scores and order for team events
    players: z.array(playerWithPositionSchema).optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  )
  .strict()

// Update player position scores schema for test events
// Used to update a single player's positionScores
export const playerPositionScoresUpdateSchema = z.object({
  positionScores: z
    .object({
      R: nonNegativeIntSchema('Position R').nullable().optional(),
      L: nonNegativeIntSchema('Position L').nullable().optional(),
      F: nonNegativeIntSchema('Position F').nullable().optional(),
      B: nonNegativeIntSchema('Position B').nullable().optional(),
    })
    .refine(
      (data) => Object.keys(data).length > 0,
      'At least one position score must be provided'
    ),
})

// Eligibility check schema for POST /registrations/eligibility
export const registrationEligibilitySchema = z.object({
  eventId: uuidSchema,
  playerIds: z.array(uuidSchema).optional(),
})

// Bulk create schema for POST /registrations/bulk
export const bulkCreateRegistrationsSchema = z.object({
  eventId: uuidSchema,
  playerIds: z
    .array(uuidSchema)
    .min(1, 'At least one player is required'),
})

// Inferred TypeScript types
export type RegistrationsQuery = z.infer<typeof registrationsQuerySchema>
export type RegistrationsParams = z.infer<typeof registrationsParamsSchema>
export type RegistrationsCreate = z.infer<typeof registrationsCreateSchema>
export type RegistrationsUpdate = z.infer<typeof registrationsUpdateSchema>
export type PlayerPositionScoresUpdate = z.infer<
  typeof playerPositionScoresUpdateSchema
>
export type PlayerWithPosition = z.infer<typeof playerWithPositionSchema>
export type RegistrationEligibilityInput = z.infer<
  typeof registrationEligibilitySchema
>
export type BulkCreateRegistrationsInput = z.infer<
  typeof bulkCreateRegistrationsSchema
>
export type { PositionScores, PositionKey }
