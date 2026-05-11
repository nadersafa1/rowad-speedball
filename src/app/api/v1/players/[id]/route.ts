import { NextRequest } from 'next/server'
import { and, desc, eq, not } from 'drizzle-orm'
import z from 'zod'
import { db } from '@/lib/db'
import * as schema from '@/db/schema'
import { calculateAge, getAgeGroup, calculateTotalScore } from '@/db/schema'
import {
  playersParamsSchema,
  playersUpdateSchema,
} from '@/types/api/players.schemas'
import {
  getOrganizationContext,
  type OrganizationContext,
} from '@/lib/organization-helpers'
import { validateUserNotLinked } from '@/lib/user-linking-helpers'
import { sendOrganizationRemovalEmail } from '@/actions/emails/send-organization-removal-email'
import { sendOrganizationWelcomeEmail } from '@/actions/emails/send-organization-welcome-email'
import {
  checkPlayerUpdateAuthorization,
  checkPlayerDeleteAuthorization,
} from '@/lib/authorization'
import { handleApiError } from '@/lib/api-error-handler'
import {
  belongsToUserOrganization,
  hasCoachPermissions,
} from '@/lib/authorization/types'

function canIncludeTestResultForViewer(
  context: OrganizationContext,
  test: typeof schema.tests.$inferSelect | null
): boolean {
  if (!test || test.visibility !== 'coaches-only') {
    return true
  }
  if (context.isSystemAdmin) {
    return true
  }
  return (
    belongsToUserOrganization(context, test.organizationId) &&
    hasCoachPermissions(context)
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params
  const parseResult = playersParamsSchema.safeParse(resolvedParams)

  if (!parseResult.success) {
    return Response.json(z.treeifyError(parseResult.error), { status: 400 })
  }

  const context = await getOrganizationContext()

  try {
    const { id } = resolvedParams

    const row = await db
      .select({
        player: schema.players,
        organizationName: schema.organization.name,
      })
      .from(schema.players)
      .leftJoin(
        schema.organization,
        eq(schema.players.organizationId, schema.organization.id)
      )
      .where(eq(schema.players.id, id))
      .limit(1)

    if (row.length === 0) {
      return Response.json({ message: 'Player not found' }, { status: 404 })
    }

    const playerData = row[0].player
    const organizationName = row[0].organizationName ?? null

    const playerResults = await db
      .select({
        result: schema.testResults,
        test: schema.tests,
      })
      .from(schema.testResults)
      .leftJoin(schema.tests, eq(schema.testResults.testId, schema.tests.id))
      .where(eq(schema.testResults.playerId, id))
      .orderBy(desc(schema.testResults.createdAt))

    const resultsWithTotal = playerResults
      .filter((row) => canIncludeTestResultForViewer(context, row.test))
      .map((row) => ({
        ...row.result,
        totalScore: calculateTotalScore(row.result),
        test: row.test,
      }))

    const playerWithAge = {
      ...playerData,
      organizationName,
      age: calculateAge(playerData.dateOfBirth),
      ageGroup: getAgeGroup(playerData.dateOfBirth),
      testResults: resultsWithTotal,
    }

    return Response.json(playerWithAge)
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/players/[id]',
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
  const resolvedParams = await params
  const paramsResult = playersParamsSchema.safeParse(resolvedParams)

  if (!paramsResult.success) {
    return Response.json(z.treeifyError(paramsResult.error), { status: 400 })
  }

  const context = await getOrganizationContext()
  try {
    const body = await request.json()
    const bodyResult = playersUpdateSchema.safeParse(body)

    if (!bodyResult.success) {
      return Response.json(z.treeifyError(bodyResult.error), { status: 400 })
    }

    const { id } = resolvedParams
    const updateData = bodyResult.data

    const existingPlayer = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.id, id))
      .limit(1)

    if (existingPlayer.length === 0) {
      return Response.json({ message: 'Player not found' }, { status: 404 })
    }

    const playerData = existingPlayer[0]

    // Authorization check
    const authError = checkPlayerUpdateAuthorization(context, playerData)
    if (authError) return authError

    const { isSystemAdmin } = context

    // System admins can change organizationId, org members cannot
    let finalUpdateData = updateData
    if (!isSystemAdmin && 'organizationId' in updateData) {
      const { organizationId, ...rest } = updateData
      finalUpdateData = rest
    }

    // Validate user is not already linked (if userId is being updated)
    if (updateData.userId !== undefined) {
      const validationError = await validateUserNotLinked(
        updateData.userId,
        id,
        undefined
      )
      if (validationError) {
        return Response.json(
          { message: validationError.error },
          { status: 400 }
        )
      }
    }

    let updatedPlayerData

    // If userId is being unlinked, use transaction to ensure atomicity
    if (
      updateData.userId === null &&
      playerData.userId &&
      playerData.organizationId
    ) {
      // Store values in variables to help TypeScript understand they're non-null
      const previousUserId = playerData.userId
      const organizationId = playerData.organizationId

      // Fetch user and organization data before transaction for email
      const [user, organization, existingMemberBefore] = await Promise.all([
        db.query.user.findFirst({
          where: eq(schema.user.id, previousUserId),
        }),
        db.query.organization.findFirst({
          where: eq(schema.organization.id, organizationId),
        }),
        db.query.member.findFirst({
          where: and(
            eq(schema.member.userId, previousUserId),
            eq(schema.member.organizationId, organizationId)
          ),
        }),
      ])

      updatedPlayerData = await db.transaction(async (tx) => {
        // 1. Update player userId to null
        const result = await tx
          .update(schema.players)
          .set({ userId: null })
          .where(eq(schema.players.id, id))
          .returning()

        // 2. Find and remove membership if role matches
        const existingMember = await tx.query.member.findFirst({
          where: and(
            eq(schema.member.userId, previousUserId),
            eq(schema.member.organizationId, organizationId)
          ),
        })

        if (existingMember && existingMember.role === 'player') {
          await tx
            .delete(schema.member)
            .where(eq(schema.member.id, existingMember.id))
        }

        return result[0]
      })

      // Send removal email after successful transaction
      // Log error but don't fail the operation if email fails
      if (
        existingMemberBefore &&
        existingMemberBefore.role === 'player' &&
        user &&
        organization
      ) {
        try {
          await sendOrganizationRemovalEmail({
            user,
            organization,
            role: existingMemberBefore.role,
          })
        } catch (error) {
          console.error('Error sending removal email:', error)
        }
      }
    } else {
      // Normal update - use transaction if userId is being linked
      if (
        updateData.userId !== undefined &&
        updateData.userId !== null &&
        playerData.organizationId
      ) {
        const userId = updateData.userId
        const organizationId = playerData.organizationId

        // Fetch user and organization data before transaction for email
        const [user, organization] = await Promise.all([
          db.query.user.findFirst({
            where: eq(schema.user.id, userId),
          }),
          db.query.organization.findFirst({
            where: eq(schema.organization.id, organizationId),
          }),
        ])

        updatedPlayerData = await db.transaction(async (tx) => {
          // 1. Update player userId
          const result = await tx
            .update(schema.players)
            .set(finalUpdateData)
            .where(eq(schema.players.id, id))
            .returning()

          const updatedPlayer = result[0]

          // 2. Check existing membership and add/update in transaction
          const existingMember = await tx.query.member.findFirst({
            where: eq(schema.member.userId, userId),
          })

          if (!existingMember) {
            // User is not a member of any organization, create membership
            await tx.insert(schema.member).values({
              organizationId,
              userId,
              role: 'player',
              createdAt: new Date(),
            })
          } else if (existingMember.organizationId !== organizationId) {
            // User is a member of a different organization
            await tx
              .update(schema.member)
              .set({
                organizationId,
                role: 'player',
              })
              .where(eq(schema.member.id, existingMember.id))
          } else if (existingMember.role !== 'player') {
            // User is already a member of this organization but with different role
            await tx
              .update(schema.member)
              .set({ role: 'player' })
              .where(eq(schema.member.id, existingMember.id))
          }
          // If user is already a member with player role, no action needed

          return updatedPlayer
        })

        // After successful transaction, trigger welcome email hook
        // Log error but don't fail the operation if email fails
        if (user && organization) {
          try {
            await sendOrganizationWelcomeEmail({
              user,
              organization,
              role: 'player',
            })
          } catch (error) {
            console.error('Error sending welcome email:', error)
          }
        }
      } else {
        // No userId being linked, normal update without transaction
        const result = await db
          .update(schema.players)
          .set(finalUpdateData)
          .where(eq(schema.players.id, id))
          .returning()

        updatedPlayerData = result[0]
      }
    }

    const updatedPlayer = {
      ...updatedPlayerData,
      age: calculateAge(updatedPlayerData.dateOfBirth),
      ageGroup: getAgeGroup(updatedPlayerData.dateOfBirth),
    }

    return Response.json(updatedPlayer)
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/players/[id]',
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
  const resolvedParams = await params
  const parseResult = playersParamsSchema.safeParse(resolvedParams)

  if (!parseResult.success) {
    return Response.json(z.treeifyError(parseResult.error), { status: 400 })
  }

  const context = await getOrganizationContext()
  try {
    const { id } = resolvedParams

    const existingPlayer = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.id, id))
      .limit(1)

    if (existingPlayer.length === 0) {
      return Response.json({ message: 'Player not found' }, { status: 404 })
    }

    const playerData = existingPlayer[0]

    // Authorization check
    const authError = checkPlayerDeleteAuthorization(context, playerData)
    if (authError) return authError

    // If player has a linked user with organization membership, remove membership atomically
    if (playerData.userId && playerData.organizationId) {
      // Store values in variables to help TypeScript understand they're non-null
      const userId = playerData.userId
      const organizationId = playerData.organizationId

      // Fetch user, organization, and member data before transaction for email
      const [user, organization, existingMemberBefore] = await Promise.all([
        db.query.user.findFirst({
          where: eq(schema.user.id, userId),
        }),
        db.query.organization.findFirst({
          where: eq(schema.organization.id, organizationId),
        }),
        db.query.member.findFirst({
          where: and(
            eq(schema.member.userId, userId),
            eq(schema.member.organizationId, organizationId)
          ),
        }),
      ])

      await db.transaction(async (tx) => {
        // 1. Delete the player
        await tx.delete(schema.players).where(eq(schema.players.id, id))

        // 2. Find and remove membership if role matches
        const existingMember = await tx.query.member.findFirst({
          where: and(
            eq(schema.member.userId, userId),
            eq(schema.member.organizationId, organizationId)
          ),
        })

        if (existingMember && existingMember.role === 'player') {
          await tx
            .delete(schema.member)
            .where(eq(schema.member.id, existingMember.id))
        }
      })

      // Send removal email after successful transaction
      // Log error but don't fail the operation if email fails
      if (
        existingMemberBefore &&
        existingMemberBefore.role === 'player' &&
        user &&
        organization
      ) {
        try {
          await sendOrganizationRemovalEmail({
            user,
            organization,
            role: existingMemberBefore.role,
          })
        } catch (error) {
          console.error('Error sending removal email:', error)
        }
      }
    } else {
      // No linked user, just delete the player
      await db.delete(schema.players).where(eq(schema.players.id, id))
    }

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/players/[id]',
      method: 'DELETE',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}
