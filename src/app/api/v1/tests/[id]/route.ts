import { NextRequest } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import z from 'zod'
import { db } from '@/lib/db'
import * as schema from '@/db/schema'
import { testsParamsSchema, testsUpdateSchema } from '@/types/api/tests.schemas'
import { testsService } from '@/lib/services/tests.service'
import { getOrganizationContext } from '@/lib/organization-helpers'
import {
  checkTestReadAuthorization,
  checkTestUpdateAuthorization,
  checkTestDeleteAuthorization,
} from '@/lib/authorization'
import { belongsToUserOrganization, hasCoachPermissions } from '@/lib/authorization/types'
import { handleApiError } from '@/lib/api-error-handler'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params
  const parseResult = testsParamsSchema.safeParse(resolvedParams)

  if (!parseResult.success) {
    return Response.json(z.treeifyError(parseResult.error), { status: 400 })
  }

  try {
    const { id } = resolvedParams

    // Check if test exists early (terminate early if not found)
    const row = await db
      .select({
        test: schema.tests,
        organizationName: schema.organization.name,
      })
      .from(schema.tests)
      .leftJoin(
        schema.organization,
        eq(schema.tests.organizationId, schema.organization.id)
      )
      .where(eq(schema.tests.id, id))
      .limit(1)

    if (row.length === 0) {
      return Response.json({ message: 'Test not found' }, { status: 404 })
    }

    const test = row[0].test
    const organizationName = row[0].organizationName ?? null

    // Authorization check
    const context = await getOrganizationContext()
    const authError = checkTestReadAuthorization(context, test)
    if (authError) return authError

    const includeResults =
      test.visibility !== 'coaches-only' ||
      context.isSystemAdmin ||
      (belongsToUserOrganization(context, test.organizationId) &&
        hasCoachPermissions(context))

    const resultsWithTotal = includeResults
      ? (
          await db
            .select({
              result: schema.testResults,
              player: schema.players,
            })
            .from(schema.testResults)
            .leftJoin(
              schema.players,
              eq(schema.testResults.playerId, schema.players.id)
            )
            .where(eq(schema.testResults.testId, id))
            .orderBy(desc(schema.testResults.createdAt))
        ).map((row) => ({
          ...row.result,
          totalScore: testsService.calculateTotalScore(row.result),
          player: row.player,
        }))
      : []

    const testWithCalculatedFields = {
      ...test,
      organizationName: organizationName,
      totalTime: testsService.calculateTotalTime(test),
      formattedTotalTime: testsService.formatTotalTime(test),
      status: testsService.getTestStatus(test.dateConducted),
      testResults: resultsWithTotal,
    }

    return Response.json(testWithCalculatedFields)
  } catch (error) {
    const context = await getOrganizationContext()
    return handleApiError(error, {
      endpoint: '/api/v1/tests/[id]',
      method: 'GET',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getOrganizationContext()

  try {
    // Parse params and body first (quick validation, no DB calls)
    const resolvedParams = await params
    const parseParams = testsParamsSchema.safeParse(resolvedParams)
    if (!parseParams.success) {
      return Response.json(z.treeifyError(parseParams.error), { status: 400 })
    }

    const body = await request.json()
    const parseResult = testsUpdateSchema.safeParse(body)

    if (!parseResult.success) {
      return Response.json(z.treeifyError(parseResult.error), { status: 400 })
    }

    const { id } = parseParams.data
    const updateData = parseResult.data

    // Check if test exists early (terminate early if not found)
    const existing = await db
      .select()
      .from(schema.tests)
      .where(eq(schema.tests.id, id))
      .limit(1)

    if (existing.length === 0) {
      return Response.json({ message: 'Test not found' }, { status: 404 })
    }

    const testData = existing[0]

    // Authorization check
    const authError = checkTestUpdateAuthorization(context, testData)
    if (authError) return authError

    const { isSystemAdmin } = context

    // Handle organizationId updates:
    // - System admins can change organizationId to any organization or null
    // - Org members cannot change organizationId (must remain their organization)
    let finalUpdateData: typeof updateData
    if (!isSystemAdmin) {
      // Remove organizationId from update if org member tries to change it
      const { organizationId, ...rest } = updateData
      finalUpdateData = rest
    } else {
      // System admin: validate referenced organization exists if being updated
      if (
        updateData.organizationId !== undefined &&
        updateData.organizationId !== null
      ) {
        const orgCheck = await db
          .select()
          .from(schema.organization)
          .where(eq(schema.organization.id, updateData.organizationId))
          .limit(1)
        if (orgCheck.length === 0) {
          return Response.json(
            { message: 'Organization not found' },
            { status: 404 }
          )
        }
      }
      finalUpdateData = updateData
    }

    const result = await db
      .update(schema.tests)
      .set({
        ...finalUpdateData,
        updatedAt: new Date(),
      })
      .where(eq(schema.tests.id, id))
      .returning()

    const updatedTest = {
      ...result[0],
      totalTime: testsService.calculateTotalTime(result[0]),
      formattedTotalTime: testsService.formatTotalTime(result[0]),
      status: testsService.getTestStatus(result[0].dateConducted),
    }

    return Response.json(updatedTest)
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/tests/[id]',
      method: 'PATCH',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getOrganizationContext()

  try {
    // Parse params first (quick validation, no DB calls)
    const resolvedParams = await params
    const parseResult = testsParamsSchema.safeParse(resolvedParams)

    if (!parseResult.success) {
      return Response.json(z.treeifyError(parseResult.error), { status: 400 })
    }

    const { id } = parseResult.data

    // Check if test exists early (terminate early if not found)
    const existing = await db
      .select()
      .from(schema.tests)
      .where(eq(schema.tests.id, id))
      .limit(1)

    if (existing.length === 0) {
      return Response.json({ message: 'Test not found' }, { status: 404 })
    }

    const testData = existing[0]

    // Authorization check
    const authError = checkTestDeleteAuthorization(context, testData)
    if (authError) return authError

    // Delete test
    // Cascade delete behavior (configured in schema):
    // - tests -> test_results: cascade (all test results deleted)
    await db.delete(schema.tests).where(eq(schema.tests.id, id))

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/tests/[id]',
      method: 'DELETE',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}
