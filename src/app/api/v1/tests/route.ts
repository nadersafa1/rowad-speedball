import { NextRequest } from 'next/server'
import {
  and,
  count,
  desc,
  eq,
  ilike,
  gte,
  lte,
  isNull,
  or,
  asc,
} from 'drizzle-orm'
import z from 'zod'
import { db } from '@/lib/db'
import * as schema from '@/db/schema'
import { testsCreateSchema, testsQuerySchema } from '@/types/api/tests.schemas'
import { createPaginatedResponse } from '@/types/api/pagination'
import { testsService } from '@/lib/services/tests.service'
import {
  getOrganizationContext,
  resolveOrganizationId,
} from '@/lib/organization-helpers'
import { checkTestCreateAuthorization } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-error-handler'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const queryParams = Object.fromEntries(searchParams.entries())
  const parseResult = testsQuerySchema.safeParse(queryParams)

  if (!parseResult.success) {
    return Response.json(z.treeifyError(parseResult.error), { status: 400 })
  }

  try {
    const {
      q,
      playingTime,
      recoveryTime,
      dateFrom,
      dateTo,
      visibility,
      organizationId,
      sortBy,
      sortOrder,
      page,
      limit,
    } = parseResult.data

    const offset = (page - 1) * limit
    const conditions: any[] = []

    // Get organization context for authorization
    const { isSystemAdmin, organization } = await getOrganizationContext()

    // Text search filter
    if (q) {
      conditions.push(ilike(schema.tests.name, `%${q}%`))
    }

    // Playing time filter
    if (playingTime !== undefined) {
      conditions.push(eq(schema.tests.playingTime, playingTime))
    }

    // Recovery time filter
    if (recoveryTime !== undefined) {
      conditions.push(eq(schema.tests.recoveryTime, recoveryTime))
    }

    // Date filters
    if (dateFrom) {
      conditions.push(gte(schema.tests.dateConducted, dateFrom))
    }

    if (dateTo) {
      conditions.push(lte(schema.tests.dateConducted, dateTo))
    }

    // Organization filter (only for system admins)
    // Only apply if organizationId is explicitly provided and user is system admin
    if (organizationId !== undefined && isSystemAdmin) {
      if (organizationId === null) {
        // Filter for tests without organization (global tests)
        conditions.push(isNull(schema.tests.organizationId))
      } else {
        // Filter for specific organization
        conditions.push(eq(schema.tests.organizationId, organizationId))
      }
    }

    // Apply organization-based filtering based on user role:
    // 1. System admin: sees all tests (unless organizationId filter is applied)
    // 2. Org members (admin/owner/coach/player/member): see their org tests + public tests + tests without org
    // 3. Non-authenticated users: see public tests + tests without org
    if (!isSystemAdmin) {
      if (organization?.id) {
        // Org members: can see tests from their organization (public + private),
        // all public tests, and all tests without organization
        conditions.push(
          or(
            isNull(schema.tests.organizationId),
            eq(schema.tests.organizationId, organization.id),
            eq(schema.tests.visibility, 'public')
          )
        )
      } else {
        // Non-authenticated users: can only see public tests and tests without organization
        conditions.push(
          or(
            isNull(schema.tests.organizationId),
            eq(schema.tests.visibility, 'public')
          )
        )
      }
    }

    // Visibility filter handling:
    // - If visibility param is provided: apply it (with permission check for private)
    // - If no visibility param: non-authenticated users get visibility='public' filter
    //   (org members don't need this filter as visibility is already handled in OR condition above)
    if (visibility) {
      if (visibility !== 'public' && !isSystemAdmin) {
        // Only system admins can filter by non-public tests
        return Response.json(
          { message: 'Cannot filter non-public tests' },
          { status: 403 }
        )
      }
      conditions.push(eq(schema.tests.visibility, visibility))
    }

    const combinedCondition =
      conditions.length > 0
        ? conditions.reduce((acc, condition) =>
            acc ? and(acc, condition) : condition
          )
        : undefined

    let countQuery = db.select({ count: count() }).from(schema.tests)
    if (combinedCondition) {
      countQuery = countQuery.where(combinedCondition) as any
    }

    let dataQuery = db
      .select({
        test: schema.tests,
        organizationName: schema.organization.name,
      })
      .from(schema.tests)
      .leftJoin(
        schema.organization,
        eq(schema.tests.organizationId, schema.organization.id)
      )

    if (combinedCondition) {
      dataQuery = dataQuery.where(combinedCondition) as any
    }

    // Dynamic sorting
    if (sortBy) {
      // Map sortBy to actual schema fields
      const sortFieldMap: Record<string, any> = {
        name: schema.tests.name,
        dateConducted: schema.tests.dateConducted,
        createdAt: schema.tests.createdAt,
        updatedAt: schema.tests.updatedAt,
      }

      const sortField = sortFieldMap[sortBy]
      if (sortField) {
        const order = sortOrder === 'asc' ? asc(sortField) : desc(sortField)
        dataQuery = dataQuery.orderBy(order) as any
      }
    } else {
      dataQuery = dataQuery.orderBy(desc(schema.tests.createdAt)) as any
    }

    // Stats queries - use same filters but without pagination
    const publicCountQuery = db
      .select({ count: count() })
      .from(schema.tests)
      .where(
        combinedCondition
          ? and(combinedCondition, eq(schema.tests.visibility, 'public'))
          : eq(schema.tests.visibility, 'public')
      )

    const privateCountQuery = db
      .select({ count: count() })
      .from(schema.tests)
      .where(
        combinedCondition
          ? and(
              combinedCondition,
              or(
                eq(schema.tests.visibility, 'private'),
                eq(schema.tests.visibility, 'coaches-only')
              )
            )
          : or(
              eq(schema.tests.visibility, 'private'),
              eq(schema.tests.visibility, 'coaches-only')
            )
      )

    const [countResult, dataResult, publicCountResult, privateCountResult] =
      await Promise.all([
        countQuery,
        dataQuery.limit(limit).offset(offset),
        publicCountQuery,
        privateCountQuery,
      ])

    const totalItems = countResult[0].count
    const publicCount = publicCountResult[0].count
    const privateCount = privateCountResult[0].count

    const testsWithCalculatedFields = dataResult.map((row) => ({
      ...row.test,
      organizationName: row.organizationName ?? null,
      totalTime: testsService.calculateTotalTime(row.test),
      formattedTotalTime: testsService.formatTotalTime(row.test),
      status: testsService.getTestStatus(row.test.dateConducted),
    }))

    const paginatedResponse = createPaginatedResponse(
      testsWithCalculatedFields,
      page,
      limit,
      totalItems
    )

    // Add stats to response
    paginatedResponse.stats = {
      totalCount: totalItems,
      publicCount,
      privateCount,
    }

    return Response.json(paginatedResponse)
  } catch (error) {
    const context = await getOrganizationContext()
    return handleApiError(error, {
      endpoint: '/api/v1/tests',
      method: 'GET',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}

export async function POST(request: NextRequest) {
  // Authorization check
  const context = await getOrganizationContext()
  const authError = checkTestCreateAuthorization(context)
  if (authError) return authError

  const { isSystemAdmin, organization } = context

  try {
    const body = await request.json()
    const parseResult = testsCreateSchema.safeParse(body)

    if (!parseResult.success) {
      return Response.json(z.treeifyError(parseResult.error), { status: 400 })
    }

    const {
      name,
      playingTime,
      recoveryTime,
      dateConducted,
      description,
      visibility,
      organizationId: providedOrgId,
    } = parseResult.data

    // Resolve organization ID using helper
    const { organizationId: finalOrganizationId, error: orgError } =
      await resolveOrganizationId(context, providedOrgId)
    if (orgError) return orgError

    const result = await db
      .insert(schema.tests)
      .values({
        name,
        playingTime,
        recoveryTime,
        dateConducted,
        description,
        visibility: visibility || 'public',
        organizationId: finalOrganizationId,
      })
      .returning()

    const newTest = {
      ...result[0],
      totalTime: testsService.calculateTotalTime(result[0]),
      formattedTotalTime: testsService.formatTotalTime(result[0]),
      status: testsService.getTestStatus(result[0].dateConducted),
    }

    return Response.json(newTest, { status: 201 })
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/tests',
      method: 'POST',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}
