import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import z from 'zod'
import { db } from '@/lib/db'
import * as schema from '@/db/schema'
import {
  registrationsParamsSchema,
  registrationsUpdateSchema,
} from '@/types/api/registrations.schemas'
import { getOrganizationContext } from '@/lib/organization-helpers'
import {
  checkRegistrationUpdateAuthorization,
  checkRegistrationDeleteAuthorization,
  isSystemAdmin,
} from '@/lib/authorization'
import {
  checkPlayersAlreadyRegistered,
  enrichRegistrationWithPlayers,
} from '@/lib/registration-helpers'
import {
  validateRegistrationPlayerCount,
  validateGenderRulesForPlayers,
  validatePlayersBelongToOrganization,
} from '@/lib/validations/registration-validation'
import { handleApiError } from '@/lib/api-error-handler'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getOrganizationContext()

  try {
    const resolvedParams = await params
    const parseParams = registrationsParamsSchema.safeParse(resolvedParams)
    if (!parseParams.success) {
      return Response.json(z.treeifyError(parseParams.error), { status: 400 })
    }

    const body = await request.json()
    const parseResult = registrationsUpdateSchema.safeParse(body)

    if (!parseResult.success) {
      return Response.json(z.treeifyError(parseResult.error), { status: 400 })
    }

    const { id } = parseParams.data
    const updateData = parseResult.data

    // Check if registration exists
    const existing = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.id, id))
      .limit(1)

    if (existing.length === 0) {
      return Response.json(
        { message: 'Registration not found' },
        { status: 404 }
      )
    }

    // Get parent event for authorization check
    const event = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, existing[0].eventId))
      .limit(1)

    if (event.length === 0) {
      return Response.json({ message: 'Event not found' }, { status: 404 })
    }

    // Check authorization based on parent event
    const authError = checkRegistrationUpdateAuthorization(context, event[0])
    if (authError) {
      return authError
    }

    const eventData = event[0]
    const systemAdmin = isSystemAdmin(context)
    const { playerIds, players, ...otherUpdateData } = updateData

    // Handle player updates if provided
    if (playerIds) {
      // Validate player count based on min/max configuration
      const countValidation = validateRegistrationPlayerCount(
        eventData.eventType,
        playerIds.length,
        eventData.minPlayers,
        eventData.maxPlayers
      )
      if (!countValidation.valid) {
        return Response.json(
          { message: countValidation.error },
          { status: 400 }
        )
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
        return Response.json(
          { message: genderValidation.error },
          { status: 400 }
        )
      }

      // Check for duplicate registrations (excluding current registration)
      const duplicateCheck = await checkPlayersAlreadyRegistered(
        eventData.id,
        playerIds
      )
      if (duplicateCheck.registered) {
        // Check if the duplicate is from the same registration (allowed)
        const currentRegistrationPlayers = await db
          .select({ playerId: schema.registrationPlayers.playerId })
          .from(schema.registrationPlayers)
          .where(eq(schema.registrationPlayers.registrationId, id))

        const currentPlayerIds = new Set(
          currentRegistrationPlayers.map((rp) => rp.playerId)
        )

        // If duplicate player is not in current registration, it's an error
        if (
          duplicateCheck.playerId &&
          !currentPlayerIds.has(duplicateCheck.playerId)
        ) {
          return Response.json(
            { message: 'Player(s) already registered for this event' },
            { status: 400 }
          )
        }
      }

      // Update players in transaction
      await db.transaction(async (tx) => {
        // Delete existing players
        await tx
          .delete(schema.registrationPlayers)
          .where(eq(schema.registrationPlayers.registrationId, id))

        // Add new players with positionScores (if provided) or just playerIds
        const playersWithPositions = updateData.players
        if (playersWithPositions && playersWithPositions.length > 0) {
          const values = playersWithPositions.map((p, index) => ({
            registrationId: id,
            playerId: p.playerId,
            positionScores: p.positionScores ?? null,
            order: p.order ?? index + 1,
          }))
          await tx.insert(schema.registrationPlayers).values(values)
        } else {
          const values = playerIds.map((playerId, index) => ({
            registrationId: id,
            playerId,
            positionScores: null,
            order: index + 1,
          }))
          await tx.insert(schema.registrationPlayers).values(values)
        }
      })
    }

    // Update other registration fields if provided
    const result = await db
      .update(schema.registrations)
      .set({
        ...otherUpdateData,
        updatedAt: new Date(),
      })
      .where(eq(schema.registrations.id, id))
      .returning()

    // Return enriched registration with players
    const enrichedRegistration = await enrichRegistrationWithPlayers(result[0])

    return Response.json(enrichedRegistration)
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/registrations/[id]',
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
    const resolvedParams = await params
    const parseResult = registrationsParamsSchema.safeParse(resolvedParams)

    if (!parseResult.success) {
      return Response.json(z.treeifyError(parseResult.error), { status: 400 })
    }

    const { id } = parseResult.data

    // Check if registration exists
    const existing = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.id, id))
      .limit(1)

    if (existing.length === 0) {
      return Response.json(
        { message: 'Registration not found' },
        { status: 404 }
      )
    }

    // Get parent event for authorization check
    const event = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, existing[0].eventId))
      .limit(1)

    if (event.length === 0) {
      return Response.json({ message: 'Event not found' }, { status: 404 })
    }

    // Check authorization based on parent event
    const eventData = event[0]
    const authError = checkRegistrationDeleteAuthorization(context, eventData)
    if (authError) {
      return authError
    }

    // Delete registration
    // Cascade delete behavior (configured in schema):
    // - registrations -> matches: cascade (via registration1Id and registration2Id)
    //   When a registration is deleted, all matches that reference it (either as registration1 or registration2) are automatically deleted
    // - matches -> sets: cascade (all sets in deleted matches are automatically deleted)
    // When a registration is deleted, all related matches and their sets are automatically deleted
    await db.delete(schema.registrations).where(eq(schema.registrations.id, id))

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/registrations/[id]',
      method: 'DELETE',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}
