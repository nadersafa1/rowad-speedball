import { NextRequest } from 'next/server'
import { and, asc, count, desc, eq, ilike, or, SQL, sql } from 'drizzle-orm'
import z from 'zod'
import { db } from '@/lib/db'
import * as schema from '@/db/schema'
import {
  registrationsCreateSchema,
  registrationsQuerySchema,
} from '@/types/api/registrations.schemas'
import { getOrganizationContext } from '@/lib/organization-helpers'
import {
  validateRegistrationPlayerCount,
  validateGenderRulesForPlayers,
} from '@/lib/validations/registration-validation'
import {
  checkEventReadAuthorization,
  checkRegistrationCreateAuthorization,
  isSystemAdmin,
} from '@/lib/authorization'
import {
  enrichRegistrationWithPlayers,
  addPlayersToRegistration,
  checkPlayersAlreadyRegistered,
} from '@/lib/registration-helpers'
import { validatePositionAssignments } from '@/lib/utils/position-utils'
import { getRegistrationTotalScore } from '@/lib/utils/score-calculations'
import { createPaginatedResponse } from '@/types/api/pagination'
import { handleApiError } from '@/lib/api-error-handler'
import {
  validateEventIsClubScoped,
  validateRegistrationWindow,
  validatePlayersBelongToOrganization,
} from '@/lib/validations/registration-validation'

/**
 * Optimized GET /api/v1/registrations
 *
 * Performance improvements:
 * 1. Apply ALL filters at database level before fetching data
 * 2. Use SQL for sorting by computed fields (totalScore, position scores)
 * 3. Apply pagination at database level
 * 4. Only enrich the paginated subset of results
 *
 * This eliminates the inefficiency of fetching all data -> filtering in memory -> slicing for pagination
 */
export async function GET(request: NextRequest) {
  const context = await getOrganizationContext()
  const { searchParams } = new URL(request.url)
  const queryParams = Object.fromEntries(searchParams.entries())
  const parseResult = registrationsQuerySchema.safeParse(queryParams)

  if (!parseResult.success) {
    return Response.json(z.treeifyError(parseResult.error), { status: 400 })
  }

  try {
    const {
      eventId,
      groupId,
      organizationId,
      q,
      sortBy,
      sortOrder,
      page,
      limit,
    } = parseResult.data

    // Authorization checks
    if (eventId) {
      const event = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
        .limit(1)

      if (event.length === 0) {
        return Response.json({ message: 'Event not found' }, { status: 404 })
      }

      const authError = checkEventReadAuthorization(context, event[0])
      if (authError) return authError
    }

    if (groupId && !eventId) {
      const group = await db
        .select()
        .from(schema.groups)
        .where(eq(schema.groups.id, groupId))
        .limit(1)

      if (group.length === 0) {
        return Response.json({ message: 'Group not found' }, { status: 404 })
      }

      const event = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, group[0].eventId))
        .limit(1)

      if (event.length === 0) {
        return Response.json({ message: 'Event not found' }, { status: 404 })
      }

      const authError = checkEventReadAuthorization(context, event[0])
      if (authError) return authError
    }

    const offset = (page - 1) * limit

    // Build query conditions
    const conditions: SQL<unknown>[] = []
    if (eventId) conditions.push(eq(schema.registrations.eventId, eventId))
    if (groupId) conditions.push(eq(schema.registrations.groupId, groupId))

    // Build query with joins for filtering by player name and organization
    // We join to registration_players and players to enable filtering
    const baseQuery = db
      .select({
        registration: schema.registrations,
      })
      .from(schema.registrations)
      .leftJoin(
        schema.registrationPlayers,
        eq(schema.registrations.id, schema.registrationPlayers.registrationId)
      )
      .leftJoin(
        schema.players,
        eq(schema.registrationPlayers.playerId, schema.players.id)
      )

    // Apply text search filter at database level
    if (q) {
      conditions.push(
        or(
          ilike(schema.players.name, `%${q}%`),
          ilike(schema.players.nameRtl, `%${q}%`)
        )!
      )
    }

    // Apply organization filter at database level
    if (organizationId !== undefined) {
      if (organizationId === null) {
        conditions.push(sql`${schema.players.organizationId} IS NULL`)
      } else {
        conditions.push(eq(schema.players.organizationId, organizationId))
      }
    }

    const combinedCondition =
      conditions.length > 0
        ? conditions.reduce<SQL<unknown> | undefined>(
            (acc, cond) => (acc ? and(acc, cond) : cond),
            undefined
          )
        : undefined

    // For position score or totalScore sorting, we need SQL expressions
    const positionScoreFields = ['positionR', 'positionL', 'positionF', 'positionB']

    if (sortBy && positionScoreFields.includes(sortBy)) {
      // Sorting by individual position score (R, L, F, B)
      const positionKey = sortBy.replace('position', '') as 'R' | 'L' | 'F' | 'B'

      // Build SQL expression for position score extraction
      const positionScoreExpr = sql<number>`COALESCE((
        SELECT COALESCE((position_scores->>'${sql.raw(positionKey)}')::int, 0)
        FROM registration_players
        WHERE registration_id = ${schema.registrations.id}
        LIMIT 1
      ), 0)`

      let query = baseQuery.$dynamic()
      if (combinedCondition) {
        query = query.where(combinedCondition)
      }

      // Group by registration ID to avoid duplicates from joins
      query = query.groupBy(
        schema.registrations.id,
        schema.registrations.eventId,
        schema.registrations.groupId,
        schema.registrations.seed,
        schema.registrations.matchesWon,
        schema.registrations.matchesLost,
        schema.registrations.setsWon,
        schema.registrations.setsLost,
        schema.registrations.points,
        schema.registrations.qualified,
        schema.registrations.teamName,
        schema.registrations.createdAt,
        schema.registrations.updatedAt
      )

      // Apply sorting
      const orderDirection = sortOrder === 'asc' ? asc : desc
      query = query.orderBy(orderDirection(positionScoreExpr))

      // Get total count (need to count distinct registrations)
      const countQuery = db
        .select({ count: sql<number>`COUNT(DISTINCT ${schema.registrations.id})` })
        .from(schema.registrations)
        .leftJoin(
          schema.registrationPlayers,
          eq(schema.registrations.id, schema.registrationPlayers.registrationId)
        )
        .leftJoin(
          schema.players,
          eq(schema.registrationPlayers.playerId, schema.players.id)
        )

      const finalCountQuery = combinedCondition
        ? countQuery.where(combinedCondition)
        : countQuery

      const [countResult, results] = await Promise.all([
        finalCountQuery,
        query.limit(limit).offset(offset),
      ])

      const totalItems = Number(countResult[0].count)

      // Enrich with player data
      const registrationsWithPlayers = await Promise.all(
        results.map(async (row) => {
          const enriched = await enrichRegistrationWithPlayers(row.registration)
          return {
            ...enriched,
            totalScore: enriched.totalScore ?? getRegistrationTotalScore(enriched),
          }
        })
      )

      const paginatedResponse = createPaginatedResponse(
        registrationsWithPlayers,
        page,
        limit,
        totalItems
      )

      return Response.json(paginatedResponse)
    }

    if (sortBy === 'totalScore') {
      // Sorting by total score (sum of all position scores)
      const totalScoreExpr = sql<number>`
        COALESCE((
          SELECT SUM(
            COALESCE((position_scores->>'R')::int, 0) +
            COALESCE((position_scores->>'L')::int, 0) +
            COALESCE((position_scores->>'F')::int, 0) +
            COALESCE((position_scores->>'B')::int, 0)
          )
          FROM registration_players
          WHERE registration_id = ${schema.registrations.id}
        ), 0)
      `

      let query = baseQuery.$dynamic()
      if (combinedCondition) {
        query = query.where(combinedCondition)
      }

      // Group by registration ID to avoid duplicates from joins
      query = query.groupBy(
        schema.registrations.id,
        schema.registrations.eventId,
        schema.registrations.groupId,
        schema.registrations.seed,
        schema.registrations.matchesWon,
        schema.registrations.matchesLost,
        schema.registrations.setsWon,
        schema.registrations.setsLost,
        schema.registrations.points,
        schema.registrations.qualified,
        schema.registrations.teamName,
        schema.registrations.createdAt,
        schema.registrations.updatedAt
      )

      // Apply sorting
      const orderDirection = sortOrder === 'asc' ? asc : desc
      query = query.orderBy(orderDirection(totalScoreExpr))

      // Get total count
      const countQuery = db
        .select({ count: sql<number>`COUNT(DISTINCT ${schema.registrations.id})` })
        .from(schema.registrations)
        .leftJoin(
          schema.registrationPlayers,
          eq(schema.registrations.id, schema.registrationPlayers.registrationId)
        )
        .leftJoin(
          schema.players,
          eq(schema.registrationPlayers.playerId, schema.players.id)
        )

      const finalCountQuery = combinedCondition
        ? countQuery.where(combinedCondition)
        : countQuery

      const [countResult, results] = await Promise.all([
        finalCountQuery,
        query.limit(limit).offset(offset),
      ])

      const totalItems = Number(countResult[0].count)

      // Enrich with player data
      const registrationsWithPlayers = await Promise.all(
        results.map(async (row) => {
          const enriched = await enrichRegistrationWithPlayers(row.registration)
          return {
            ...enriched,
            totalScore: enriched.totalScore ?? getRegistrationTotalScore(enriched),
          }
        })
      )

      const paginatedResponse = createPaginatedResponse(
        registrationsWithPlayers,
        page,
        limit,
        totalItems
      )

      return Response.json(paginatedResponse)
    }

    // Default query without special sorting (createdAt or no sortBy)
    let query = baseQuery.$dynamic()
    if (combinedCondition) {
      query = query.where(combinedCondition)
    }

    // Group by registration ID to avoid duplicates from joins
    query = query.groupBy(
      schema.registrations.id,
      schema.registrations.eventId,
      schema.registrations.groupId,
      schema.registrations.seed,
      schema.registrations.matchesWon,
      schema.registrations.matchesLost,
      schema.registrations.setsWon,
      schema.registrations.setsLost,
      schema.registrations.points,
      schema.registrations.qualified,
      schema.registrations.teamName,
      schema.registrations.createdAt,
      schema.registrations.updatedAt
    )

    // Apply default sorting
    if (sortBy === 'createdAt') {
      const orderDirection = sortOrder === 'asc' ? asc : desc
      query = query.orderBy(orderDirection(schema.registrations.createdAt))
    } else {
      // Default to createdAt desc
      query = query.orderBy(desc(schema.registrations.createdAt))
    }

    // Get total count
    const countQuery = db
      .select({ count: sql<number>`COUNT(DISTINCT ${schema.registrations.id})` })
      .from(schema.registrations)
      .leftJoin(
        schema.registrationPlayers,
        eq(schema.registrations.id, schema.registrationPlayers.registrationId)
      )
      .leftJoin(
        schema.players,
        eq(schema.registrationPlayers.playerId, schema.players.id)
      )

    const finalCountQuery = combinedCondition
      ? countQuery.where(combinedCondition)
      : countQuery

    const [countResult, results] = await Promise.all([
      finalCountQuery,
      query.limit(limit).offset(offset),
    ])

    const totalItems = Number(countResult[0].count)

    // Enrich with player data
    const registrationsWithPlayers = await Promise.all(
      results.map(async (row) => {
        const enriched = await enrichRegistrationWithPlayers(row.registration)
        return {
          ...enriched,
          totalScore: enriched.totalScore ?? getRegistrationTotalScore(enriched),
        }
      })
    )

    const paginatedResponse = createPaginatedResponse(
      registrationsWithPlayers,
      page,
      limit,
      totalItems
    )

    return Response.json(paginatedResponse)
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/registrations',
      method: 'GET',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext()

  try {
    const body = await request.json()
    const parseResult = registrationsCreateSchema.safeParse(body)

    if (!parseResult.success) {
      return Response.json(z.treeifyError(parseResult.error), { status: 400 })
    }

    const {
      eventId,
      playerIds,
      players: playersWithPositions,
    } = parseResult.data

    // Get event
    const event = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, eventId))
      .limit(1)

    if (event.length === 0) {
      return Response.json({ message: 'Event not found' }, { status: 404 })
    }

    const eventData = event[0]

    // Authorization check
    const authError = checkRegistrationCreateAuthorization(context, eventData)
    if (authError) return authError

    const systemAdmin = isSystemAdmin(context)

    const clubScopeValidation = validateEventIsClubScoped(
      eventData.organizationId,
      systemAdmin
    )
    if (!clubScopeValidation.valid) {
      return Response.json({ message: clubScopeValidation.error }, { status: 400 })
    }

    const windowValidation = validateRegistrationWindow(eventData)
    if (!windowValidation.valid) {
      return Response.json({ message: windowValidation.error }, { status: 400 })
    }

    // Validate player count based on min/max configuration
    const countValidation = validateRegistrationPlayerCount(
      eventData.eventType,
      playerIds.length,
      eventData.minPlayers,
      eventData.maxPlayers
    )
    if (!countValidation.valid) {
      return Response.json({ message: countValidation.error }, { status: 400 })
    }

    // Check for duplicate player IDs
    const uniquePlayerIds = new Set(playerIds)
    if (uniquePlayerIds.size !== playerIds.length) {
      return Response.json(
        { message: 'Duplicate player IDs are not allowed' },
        { status: 400 }
      )
    }

    // Fetch all players
    const playersData = await Promise.all(
      playerIds.map(async (playerId) => {
        const player = await db
          .select()
          .from(schema.players)
          .where(eq(schema.players.id, playerId))
          .limit(1)
        return player[0] || null
      })
    )

    // Check all players exist
    const missingIndex = playersData.findIndex((p) => !p)
    if (missingIndex !== -1) {
      return Response.json(
        { message: `Player ${missingIndex + 1} not found` },
        { status: 404 }
      )
    }

    const orgValidation = validatePlayersBelongToOrganization(
      playersData.filter((p): p is NonNullable<typeof p> => p !== null),
      eventData.organizationId,
      systemAdmin
    )
    if (!orgValidation.valid) {
      return Response.json({ message: orgValidation.error }, { status: 400 })
    }

    // Validate gender rules
    const genders = playersData.map((p) => p!.gender as 'male' | 'female')
    const genderValidation = validateGenderRulesForPlayers(
      eventData.gender as 'male' | 'female' | 'mixed',
      genders,
      eventData.eventType
    )
    if (!genderValidation.valid) {
      return Response.json({ message: genderValidation.error }, { status: 400 })
    }

    // Check for duplicate registrations
    const duplicateCheck = await checkPlayersAlreadyRegistered(
      eventId,
      playerIds
    )
    if (duplicateCheck.registered) {
      return Response.json(
        { message: 'Player(s) already registered for this event' },
        { status: 400 }
      )
    }

    // Create registration
    const result = await db
      .insert(schema.registrations)
      .values({ eventId })
      .returning()

    const registration = result[0]

    // Validate position uniqueness using position-utils
    if (playersWithPositions) {
      const validation = validatePositionAssignments(
        eventData.eventType,
        playersWithPositions.map((p) => p.positionScores ?? null)
      )
      if (!validation.valid) {
        return Response.json({ message: validation.error }, { status: 400 })
      }
    }

    // Add players to junction table (with positions if provided)
    await addPlayersToRegistration(
      registration.id,
      playerIds,
      playersWithPositions
    )

    // Return enriched registration
    const enrichedRegistration = await enrichRegistrationWithPlayers(
      registration
    )

    return Response.json(enrichedRegistration, { status: 201 })
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/registrations',
      method: 'POST',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}
