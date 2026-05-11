import { NextRequest } from 'next/server'
import { and, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import * as schema from '@/db/schema'
import { getOrganizationContext } from '@/lib/organization-helpers'
import { getAgeGroup } from '@/db/schema'
import { handleApiError } from '@/lib/api-error-handler'
import {
  dashboardQuerySchema,
  type DashboardPlayer,
  type DashboardResultsResponse,
} from '@/types/api/results.schemas'

// ========================================
// Types
// ========================================

/** Raw row shape returned by the results + players + tests join query */
interface RawResultRow {
  testId: string
  playerId: string
  leftHandScore: number
  rightHandScore: number
  forehandScore: number
  backhandScore: number
  playerName: string | null
  playerGender: string | null
  playerDateOfBirth: string | null
  testName: string | null
  testDateConducted: string | null
}

// ========================================
// Helpers
// ========================================

/**
 * Builds a SQL condition restricting test visibility based on the user's role.
 *
 * - System admins: no restriction (see all tests).
 * - Org members: see their org's tests + public tests + tests without an org.
 * - Unauthenticated / no org: see only public tests + tests without an org.
 */
function buildVisibilityCondition(
  isSystemAdmin: boolean,
  hasCoachAccess: boolean,
  organizationId?: string,
): SQL | undefined {
  if (isSystemAdmin) return undefined

  const publicOrUnscoped = or(
    isNull(schema.tests.organizationId),
    eq(schema.tests.visibility, 'public'),
  )

  if (organizationId) {
    if (hasCoachAccess) {
      // Coaches/admins/owners: can include coaches-only tests from their org
      return or(publicOrUnscoped, eq(schema.tests.organizationId, organizationId))
    }

    // Players/members: can include private tests from their org, but not coaches-only
    return or(
      publicOrUnscoped,
      and(eq(schema.tests.organizationId, organizationId), eq(schema.tests.visibility, 'private')),
    )
  }

  return publicOrUnscoped
}

/**
 * Groups flat result rows into per-player structures, computing each
 * player's age group exactly once. Players that don't match the optional
 * age group filter are excluded early to avoid unnecessary processing.
 */
function groupResultsByPlayer(
  rows: RawResultRow[],
  allowedAgeGroups?: string[],
): DashboardPlayer[] {
  const playerMap = new Map<string, DashboardPlayer>()
  const excludedPlayerIds = new Set<string>()
  const allowedSet =
    allowedAgeGroups && allowedAgeGroups.length > 0
      ? new Set(allowedAgeGroups)
      : null

  for (const row of rows) {
    if (!row.playerId || !row.playerName || !row.playerDateOfBirth) continue
    if (excludedPlayerIds.has(row.playerId)) continue

    let player = playerMap.get(row.playerId)

    if (!player) {
      const playerAgeGroup = getAgeGroup(row.playerDateOfBirth)

      if (allowedSet && !allowedSet.has(playerAgeGroup)) {
        excludedPlayerIds.add(row.playerId)
        continue
      }

      player = {
        id: row.playerId,
        name: row.playerName,
        ageGroup: playerAgeGroup,
        gender: row.playerGender ?? 'male',
        results: [],
      }
      playerMap.set(row.playerId, player)
    }

    player.results.push({
      testId: row.testId,
      testName: row.testName ?? '',
      testDate: row.testDateConducted ?? '',
      leftHandScore: row.leftHandScore,
      rightHandScore: row.rightHandScore,
      forehandScore: row.forehandScore,
      backhandScore: row.backhandScore,
      totalScore:
        row.leftHandScore +
        row.rightHandScore +
        row.forehandScore +
        row.backhandScore,
    })
  }

  return Array.from(playerMap.values())
}

// ========================================
// Route handler
// ========================================

/**
 * GET /api/v1/results/dashboard
 *
 * Returns test results grouped by player for a multi-test comparison dashboard.
 * Accepts multiple test IDs and optional filters (search, gender, age groups).
 * Both the tests metadata and the joined results are fetched in parallel.
 */
export async function GET(request: NextRequest) {
  const context = await getOrganizationContext()

  try {
    // --- Parse & validate query parameters ---
    const { searchParams } = new URL(request.url)
    const queryParams = Object.fromEntries(searchParams.entries())
    const parseResult = dashboardQuerySchema.safeParse(queryParams)

    if (!parseResult.success) {
      return Response.json(z.treeifyError(parseResult.error), { status: 400 })
    }

    const { testIds, q, gender, ageGroups } = parseResult.data

    let effectiveAgeGroups: string[] | undefined
    if (ageGroups.length > 0) {
      effectiveAgeGroups = ageGroups
    }
    const { isSystemAdmin, organization } = context

    // --- Build filter conditions for the results query ---
    const conditions: (SQL | undefined)[] = [
      inArray(schema.testResults.testId, testIds),
    ]

    if (q) {
      conditions.push(ilike(schema.players.name, `%${q}%`))
    }

    if (gender && gender !== 'all') {
      conditions.push(eq(schema.players.gender, gender))
    }

    const visibilityCondition = buildVisibilityCondition(
      isSystemAdmin,
      context.isCoach || context.isAdmin || context.isOwner || context.isSystemAdmin,
      organization?.id,
    )
    if (visibilityCondition) {
      conditions.push(visibilityCondition)
    }

    const combinedCondition = and(...conditions)

    // --- Fetch tests metadata and results in parallel (independent queries) ---
    const [testsData, resultsData] = await Promise.all([
      db
        .select({
          id: schema.tests.id,
          name: schema.tests.name,
          dateConducted: schema.tests.dateConducted,
          playingTime: schema.tests.playingTime,
          recoveryTime: schema.tests.recoveryTime,
        })
        .from(schema.tests)
        .where(inArray(schema.tests.id, testIds)),

      db
        .select({
          testId: schema.testResults.testId,
          playerId: schema.testResults.playerId,
          leftHandScore: schema.testResults.leftHandScore,
          rightHandScore: schema.testResults.rightHandScore,
          forehandScore: schema.testResults.forehandScore,
          backhandScore: schema.testResults.backhandScore,
          playerName: schema.players.name,
          playerGender: schema.players.gender,
          playerDateOfBirth: schema.players.dateOfBirth,
          testName: schema.tests.name,
          testDateConducted: schema.tests.dateConducted,
        })
        .from(schema.testResults)
        .innerJoin(
          schema.players,
          eq(schema.testResults.playerId, schema.players.id),
        )
        .innerJoin(schema.tests, eq(schema.testResults.testId, schema.tests.id))
        .where(combinedCondition),
    ])

    // --- Group flat rows by player, applying age-group filter in-memory ---
    const players = groupResultsByPlayer(resultsData, effectiveAgeGroups)

    const response: DashboardResultsResponse = {
      players,
      tests: testsData.map((t) => ({
        ...t,
        dateConducted: t.dateConducted ?? '',
      })),
    }

    return Response.json(response)
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/results/dashboard',
      method: 'GET',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}
