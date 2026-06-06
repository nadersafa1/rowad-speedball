import { eq, and, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/db/schema'
import type { PlayerWithPosition } from '@/types/api/registrations.schemas'
import type { PositionScores } from '@/types/position-scores'
import { sumPositionScores } from '@/lib/utils/score-calculations'

/**
 * Fetches players for a registration from the junction table
 * Returns players ordered by order field, with positionScores
 */
export const getPlayersForRegistration = async (registrationId: string) => {
  const registrationPlayers = await db
    .select({
      playerId: schema.registrationPlayers.playerId,
      positionScores: schema.registrationPlayers.positionScores,
      order: schema.registrationPlayers.order,
    })
    .from(schema.registrationPlayers)
    .where(eq(schema.registrationPlayers.registrationId, registrationId))
    .orderBy(schema.registrationPlayers.order)

  if (registrationPlayers.length === 0) {
    return []
  }

  const playerIds = registrationPlayers.map((rp) => rp.playerId)
  const players = await db
    .select()
    .from(schema.players)
    .where(inArray(schema.players.id, playerIds))

  // Sort players by their order and include positionScores
  const scoresMap = new Map(
    registrationPlayers.map((rp) => [
      rp.playerId,
      { positionScores: rp.positionScores, order: rp.order },
    ])
  )
  return players
    .sort(
      (a, b) =>
        (scoresMap.get(a.id)?.order || 0) - (scoresMap.get(b.id)?.order || 0)
    )
    .map((player) => ({
      ...player,
      positionScores: scoresMap.get(player.id)?.positionScores || null,
      registrationOrder: scoresMap.get(player.id)?.order || 1,
    }))
}

/**
 * Adds players to a registration via the junction table
 * Supports optional positionScores and order fields for team events
 */
export const addPlayersToRegistration = async (
  registrationId: string,
  playerIds: string[],
  playersWithPositions?: PlayerWithPosition[]
) => {
  // If playersWithPositions is provided, use it; otherwise create from playerIds
  if (playersWithPositions && playersWithPositions.length > 0) {
    const values = playersWithPositions.map((p, index) => ({
      registrationId,
      playerId: p.playerId,
      positionScores: p.positionScores ?? null,
      order: p.order ?? index + 1,
    }))
    await db.insert(schema.registrationPlayers).values(values)
  } else {
    const values = playerIds.map((playerId, index) => ({
      registrationId,
      playerId,
      positionScores: null,
      order: index + 1,
    }))
    await db.insert(schema.registrationPlayers).values(values)
  }
}

/**
 * Returns all player IDs already registered for an event
 */
export const getRegisteredPlayerIdsForEvent = async (
  eventId: string
): Promise<string[]> => {
  const eventRegistrations = await db
    .select({ id: schema.registrations.id })
    .from(schema.registrations)
    .where(eq(schema.registrations.eventId, eventId))

  if (eventRegistrations.length === 0) {
    return []
  }

  const registrationIds = eventRegistrations.map((r) => r.id)
  const existingPlayers = await db
    .select({ playerId: schema.registrationPlayers.playerId })
    .from(schema.registrationPlayers)
    .where(inArray(schema.registrationPlayers.registrationId, registrationIds))

  return existingPlayers.map((p) => p.playerId)
}

/**
 * Checks if any of the given player IDs are already registered for an event
 */
export const checkPlayersAlreadyRegistered = async (
  eventId: string,
  playerIds: string[]
): Promise<{ registered: boolean; playerId?: string }> => {
  // Get all registrations for this event
  const eventRegistrations = await db
    .select({ id: schema.registrations.id })
    .from(schema.registrations)
    .where(eq(schema.registrations.eventId, eventId))

  if (eventRegistrations.length === 0) {
    return { registered: false }
  }

  const registrationIds = eventRegistrations.map((r) => r.id)

  // Check if any player is already in any registration for this event
  const existingPlayers = await db
    .select({ playerId: schema.registrationPlayers.playerId })
    .from(schema.registrationPlayers)
    .where(
      and(
        inArray(schema.registrationPlayers.registrationId, registrationIds),
        inArray(schema.registrationPlayers.playerId, playerIds)
      )
    )
    .limit(1)

  if (existingPlayers.length > 0) {
    return { registered: true, playerId: existingPlayers[0].playerId }
  }

  return { registered: false }
}

/**
 * Calculates total score for a registration using PostgreSQL JSONB aggregation
 * Returns sum of all positionScores (R+L+F+B) across all players
 *
 * SERVER-ONLY: This function requires database access.
 * Use this for better performance when you only have a registrationId and
 * don't need to fetch the full registration object with players.
 */
export const getRegistrationTotalScoreFromDb = async (
  registrationId: string
): Promise<number> => {
  const result = await db
    .select({
      totalScore: sql<number>`
        COALESCE(SUM(
          COALESCE((${schema.registrationPlayers.positionScores}->>'R')::int, 0) +
          COALESCE((${schema.registrationPlayers.positionScores}->>'L')::int, 0) +
          COALESCE((${schema.registrationPlayers.positionScores}->>'F')::int, 0) +
          COALESCE((${schema.registrationPlayers.positionScores}->>'B')::int, 0)
        ), 0)
      `.as('total_score'),
    })
    .from(schema.registrationPlayers)
    .where(eq(schema.registrationPlayers.registrationId, registrationId))

  return result[0]?.totalScore ?? 0
}

/**
 * @deprecated Use getRegistrationTotalScoreFromDb instead
 */
export const calculateRegistrationTotalScoreFromDb =
  getRegistrationTotalScoreFromDb

/**
 * Enriches a registration with player data from the junction table
 * Also calculates total score from positionScores
 */
export const enrichRegistrationWithPlayers = async (
  registration: typeof schema.registrations.$inferSelect
) => {
  const players = await getPlayersForRegistration(registration.id)

  // Calculate total score from players' positionScores
  const totalScore = players.reduce(
    (sum, player) => sum + sumPositionScores(player.positionScores),
    0
  )

  return {
    ...registration,
    players,
    totalScore,
  }
}

/**
 * Updates positionScores for a specific player in a registration
 */
export const updatePlayerPositionScores = async (
  registrationId: string,
  playerId: string,
  positionScores: PositionScores
) => {
  const result = await db
    .update(schema.registrationPlayers)
    .set({ positionScores })
    .where(
      and(
        eq(schema.registrationPlayers.registrationId, registrationId),
        eq(schema.registrationPlayers.playerId, playerId)
      )
    )
    .returning()

  return result[0]
}

/**
 * Gets existing positions for all players in a registration
 * Used for position uniqueness validation
 */
export const getExistingPositionsForRegistration = async (
  registrationId: string,
  excludePlayerId?: string
): Promise<{ playerId: string; positionScores: PositionScores | null }[]> => {
  const query = db
    .select({
      playerId: schema.registrationPlayers.playerId,
      positionScores: schema.registrationPlayers.positionScores,
    })
    .from(schema.registrationPlayers)
    .where(eq(schema.registrationPlayers.registrationId, registrationId))

  const results = await query

  if (excludePlayerId) {
    return results.filter((r) => r.playerId !== excludePlayerId)
  }

  return results
}

/**
 * Adds players to a registration with position validation using a transaction.
 * Uses SELECT FOR UPDATE to prevent race conditions when validating position uniqueness.
 *
 * @param registrationId - The registration ID to add players to
 * @param eventType - The event type for position validation rules
 * @param playerIds - Array of player IDs to add
 * @param playersWithPositions - Optional array with position information
 * @param validatePositions - Function to validate position constraints
 * @returns The result of the operation
 */
export const addPlayersWithPositionValidation = async (
  registrationId: string,
  eventType: string,
  playerIds: string[],
  playersWithPositions?: PlayerWithPosition[],
  validatePositions?: (
    eventType: string,
    newPositionScores: PositionScores | null | undefined,
    existingPositions: Array<'R' | 'L' | 'F' | 'B'>
  ) => { valid: boolean; error?: string }
): Promise<{ success: boolean; error?: string }> => {
  try {
    await db.transaction(async (tx) => {
      // Lock existing rows for this registration to prevent concurrent modifications
      const existingPlayers = await tx
        .select({
          playerId: schema.registrationPlayers.playerId,
          positionScores: schema.registrationPlayers.positionScores,
        })
        .from(schema.registrationPlayers)
        .where(eq(schema.registrationPlayers.registrationId, registrationId))
        .for('update') // Lock rows to prevent concurrent modifications

      // Extract existing positions from locked rows
      const { getPositions } = await import(
        '@/lib/validations/registration-validation'
      )
      const existingPositionsList = existingPlayers.flatMap((p) =>
        getPositions(p.positionScores)
      )

      // Validate position constraints for each new player if validation function provided
      if (validatePositions && playersWithPositions) {
        for (const player of playersWithPositions) {
          const validation = validatePositions(
            eventType,
            player.positionScores,
            existingPositionsList
          )
          if (!validation.valid) {
            throw new Error(validation.error)
          }
        }
      }

      // Insert new players within the transaction
      if (playersWithPositions && playersWithPositions.length > 0) {
        const values = playersWithPositions.map((p, index) => ({
          registrationId,
          playerId: p.playerId,
          positionScores: p.positionScores ?? null,
          order: p.order ?? existingPlayers.length + index + 1,
        }))
        await tx.insert(schema.registrationPlayers).values(values)
      } else {
        const values = playerIds.map((playerId, index) => ({
          registrationId,
          playerId,
          positionScores: null,
          order: existingPlayers.length + index + 1,
        }))
        await tx.insert(schema.registrationPlayers).values(values)
      }
    })

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Updates a player's position scores with validation using a transaction.
 * Uses SELECT FOR UPDATE to prevent race conditions when validating position uniqueness.
 *
 * @param registrationId - The registration ID
 * @param playerId - The player ID to update
 * @param eventType - The event type for position validation rules
 * @param positionScores - The new position scores
 * @param validatePositions - Function to validate position constraints
 * @returns The result of the operation
 */
export const updatePlayerPositionScoresWithValidation = async (
  registrationId: string,
  playerId: string,
  eventType: string,
  positionScores: PositionScores,
  validatePositions?: (
    eventType: string,
    newPositionScores: PositionScores | null | undefined,
    existingPositions: Array<'R' | 'L' | 'F' | 'B'>
  ) => { valid: boolean; error?: string }
): Promise<{
  success: boolean
  error?: string
  data?: typeof schema.registrationPlayers.$inferSelect
}> => {
  try {
    let result: typeof schema.registrationPlayers.$inferSelect | undefined

    await db.transaction(async (tx) => {
      // Lock all registration_players rows for this registration
      const existingPlayers = await tx
        .select({
          playerId: schema.registrationPlayers.playerId,
          positionScores: schema.registrationPlayers.positionScores,
        })
        .from(schema.registrationPlayers)
        .where(eq(schema.registrationPlayers.registrationId, registrationId))
        .for('update') // Lock rows to prevent concurrent modifications

      // Extract existing positions from other players (exclude current player)
      const { getPositions } = await import(
        '@/lib/validations/registration-validation'
      )
      const otherPlayers = existingPlayers.filter(
        (p) => p.playerId !== playerId
      )
      const existingPositionsList = otherPlayers.flatMap((p) =>
        getPositions(p.positionScores)
      )

      // Validate position constraints if validation function provided
      if (validatePositions) {
        const validation = validatePositions(
          eventType,
          positionScores,
          existingPositionsList
        )
        if (!validation.valid) {
          throw new Error(validation.error)
        }
      }

      // Update the player's position scores within the transaction
      const updateResult = await tx
        .update(schema.registrationPlayers)
        .set({ positionScores })
        .where(
          and(
            eq(schema.registrationPlayers.registrationId, registrationId),
            eq(schema.registrationPlayers.playerId, playerId)
          )
        )
        .returning()

      result = updateResult[0]
    })

    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
