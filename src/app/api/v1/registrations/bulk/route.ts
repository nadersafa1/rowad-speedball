import { NextRequest } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import z from 'zod'
import { db } from '@/lib/db'
import * as schema from '@/db/schema'
import { bulkCreateRegistrationsSchema } from '@/types/api/registrations.schemas'
import { getOrganizationContext } from '@/lib/organization-helpers'
import {
  checkRegistrationCreateAuthorization,
  isSystemAdmin,
} from '@/lib/authorization'
import {
  addPlayersToRegistration,
  getRegisteredPlayerIdsForEvent,
} from '@/lib/registration-helpers'
import {
  validateEventIsClubScoped,
  validateRegistrationWindow,
  validatePlayersBelongToOrganization,
  isPlayerGenderEligible,
} from '@/lib/validations/registration-validation'
import { isSinglePlayerEventType } from '@/types/event-types'
import { handleApiError } from '@/lib/api-error-handler'

interface BulkRegistrationError {
  playerId: string
  playerName: string
  error: string
}

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext()

  try {
    const body = await request.json()
    const parseResult = bulkCreateRegistrationsSchema.safeParse(body)

    if (!parseResult.success) {
      return Response.json(z.treeifyError(parseResult.error), { status: 400 })
    }

    const { eventId, playerIds } = parseResult.data

    const event = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, eventId))
      .limit(1)

    if (event.length === 0) {
      return Response.json({ message: 'Event not found' }, { status: 404 })
    }

    const eventData = event[0]

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

    if (!isSinglePlayerEventType(eventData.eventType)) {
      return Response.json(
        {
          message:
            'Bulk registration is only supported for solo/singles events',
        },
        { status: 400 }
      )
    }

    const uniquePlayerIds = [...new Set(playerIds)]
    const playersData = await db
      .select()
      .from(schema.players)
      .where(inArray(schema.players.id, uniquePlayerIds))

    if (playersData.length !== uniquePlayerIds.length) {
      return Response.json(
        { message: 'One or more players not found' },
        { status: 404 }
      )
    }

    const orgValidation = validatePlayersBelongToOrganization(
      playersData,
      eventData.organizationId,
      systemAdmin
    )
    if (!orgValidation.valid) {
      return Response.json({ message: orgValidation.error }, { status: 400 })
    }

    const registeredPlayerIds = new Set(
      await getRegisteredPlayerIdsForEvent(eventId)
    )

    const eventGender = eventData.gender as 'male' | 'female' | 'mixed'
    const errors: BulkRegistrationError[] = []
    let count = 0

    for (const player of playersData) {
      if (registeredPlayerIds.has(player.id)) {
        errors.push({
          playerId: player.id,
          playerName: player.name,
          error: 'Already registered',
        })
        continue
      }

      if (
        !isPlayerGenderEligible(
          eventGender,
          player.gender as 'male' | 'female'
        )
      ) {
        errors.push({
          playerId: player.id,
          playerName: player.name,
          error: 'Gender does not match event requirements',
        })
        continue
      }

      const result = await db
        .insert(schema.registrations)
        .values({ eventId })
        .returning()

      const registration = result[0]
      await addPlayersToRegistration(registration.id, [player.id])
      registeredPlayerIds.add(player.id)
      count++
    }

    return Response.json({ count, errors }, { status: 201 })
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/registrations/bulk',
      method: 'POST',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}
