import { NextRequest } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import z from 'zod'
import { db } from '@/lib/db'
import * as schema from '@/db/schema'
import { registrationEligibilitySchema } from '@/types/api/registrations.schemas'
import { getOrganizationContext } from '@/lib/organization-helpers'
import {
  checkRegistrationCreateAuthorization,
  isSystemAdmin,
} from '@/lib/authorization'
import { getRegisteredPlayerIdsForEvent } from '@/lib/registration-helpers'
import {
  isPlayerGenderEligible,
  validateEventIsClubScoped,
} from '@/lib/validations/registration-validation'
import { handleApiError } from '@/lib/api-error-handler'

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext()

  try {
    const body = await request.json()
    const parseResult = registrationEligibilitySchema.safeParse(body)

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

    let playersData: (typeof schema.players.$inferSelect)[]

    if (playerIds && playerIds.length > 0) {
      playersData = await db
        .select()
        .from(schema.players)
        .where(inArray(schema.players.id, playerIds))
    } else if (eventData.organizationId) {
      playersData = await db
        .select()
        .from(schema.players)
        .where(eq(schema.players.organizationId, eventData.organizationId))
    } else {
      playersData = []
    }

    const registeredPlayerIds = new Set(
      await getRegisteredPlayerIdsForEvent(eventId)
    )

    const eventGender = eventData.gender as 'male' | 'female' | 'mixed'

    const data = playersData.map((player) => {
      const isClubMember =
        systemAdmin ||
        !eventData.organizationId ||
        player.organizationId === eventData.organizationId
      const genderMatch = isPlayerGenderEligible(
        eventGender,
        player.gender as 'male' | 'female'
      )
      const isRegistered = registeredPlayerIds.has(player.id)

      let blockReason: string | undefined
      if (!isClubMember) {
        blockReason = 'Player does not belong to this club'
      } else if (!genderMatch) {
        blockReason = 'Gender does not match event requirements'
      } else if (isRegistered) {
        blockReason = 'Already registered'
      }

      return {
        playerId: player.id,
        playerName: player.name,
        playerGender: player.gender,
        isEligible: isClubMember && genderMatch && !isRegistered,
        isRegistered,
        genderMatch,
        isClubMember,
        blockReason,
      }
    })

    return Response.json({ data })
  } catch (error) {
    return handleApiError(error, {
      endpoint: '/api/v1/registrations/eligibility',
      method: 'POST',
      userId: context.userId,
      organizationId: context.organization?.id,
    })
  }
}
