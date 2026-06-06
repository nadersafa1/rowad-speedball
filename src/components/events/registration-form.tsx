'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRegistrationsStore } from '@/store/registrations-store'
import { useEffect, useMemo } from 'react'
import PlayerCombobox from '@/components/players/player-combobox'
import type { Event, Registration } from '@/types'
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui'
import { isTeamTestEventType } from '@/types/event-types'
import {
  POSITION_KEYS,
  POSITION_LABELS,
  type PositionKey,
} from '@/types/position-scores'
import {
  getPositions,
  ONE_HANDED_POSITIONS,
  TWO_HANDED_POSITIONS,
} from '@/lib/utils/position-utils'
import { DIALOG_CLASSES } from '@/lib/ui-constants'

// Dynamic validation schema based on min/max players and event type
const createRegistrationSchema = (event: Event) => {
  const { minPlayers, maxPlayers, eventType } = event

  const isTeamTest = isTeamTestEventType(eventType)
  // For speed-solo-teams: each player has two positions (one R/L, one F/B)
  const isSpeedSoloTeams = eventType === 'speed-solo-teams'

  const playerSchema = isTeamTest
    ? isSpeedSoloTeams
      ? z.object({
          playerId: z.uuid('Invalid player ID'),
          oneHandedPosition: z
            .enum(['R', 'L'] as const)
            .nullable()
            .optional(),
          twoHandedPosition: z
            .enum(['F', 'B'] as const)
            .nullable()
            .optional(),
        })
      : z.object({
          playerId: z.uuid('Invalid player ID'),
          position: z
            .enum(['R', 'L', 'F', 'B'] as const)
            .nullable()
            .optional(),
        })
    : z.object({
        playerId: z.uuid('Invalid player ID'),
      })

  const baseSchema = z.object({
    players: z
      .array(playerSchema)
      .min(minPlayers, `At least ${minPlayers} player(s) required`)
      .max(maxPlayers, `Maximum ${maxPlayers} players allowed`),
  })

  // For relay and solo-teams, positions must be unique (single position per player)
  if (isTeamTest && (eventType === 'relay' || eventType === 'solo-teams')) {
    return baseSchema.refine(
      (data) => {
        const positions = data.players
          .map((p) => (p as { position?: string | null }).position)
          .filter(Boolean)
        const uniquePositions = new Set(positions)
        return positions.length === uniquePositions.size
      },
      {
        message: 'Each player must have a unique position',
        path: ['players'],
      }
    )
  }

  // For speed-solo-teams, positions must be unique within each category
  if (isTeamTest && isSpeedSoloTeams) {
    return baseSchema.refine(
      (data) => {
        const oneHandedPositions = data.players
          .map(
            (p) =>
              (p as { oneHandedPosition?: string | null }).oneHandedPosition
          )
          .filter(Boolean)
        const twoHandedPositions = data.players
          .map(
            (p) =>
              (p as { twoHandedPosition?: string | null }).twoHandedPosition
          )
          .filter(Boolean)
        const uniqueOneHanded = new Set(oneHandedPositions)
        const uniqueTwoHanded = new Set(twoHandedPositions)
        return (
          oneHandedPositions.length === uniqueOneHanded.size &&
          twoHandedPositions.length === uniqueTwoHanded.size
        )
      },
      {
        message:
          'Positions cannot be repeated within each category (R/L and F/B)',
        path: ['players'],
      }
    )
  }

  return baseSchema
}

type RegistrationFormData = {
  players: {
    playerId: string
    position?: PositionKey | null
    oneHandedPosition?: 'R' | 'L' | null
    twoHandedPosition?: 'F' | 'B' | null
  }[]
}

interface RegistrationFormProps {
  event: Event
  registration?: Registration | null
  onSuccess?: () => void
  onCancel?: () => void
}

const RegistrationForm = ({
  event,
  registration,
  onSuccess,
  onCancel,
}: RegistrationFormProps) => {
  const {
    createRegistration,
    updateRegistration,
    isLoading,
    error,
    clearError,
    registrations,
    fetchRegistrations,
  } = useRegistrationsStore()

  const isEditing = !!registration
  const isTeamTest = isTeamTestEventType(event.eventType)
  const isSpeedSoloTeams = event.eventType === 'speed-solo-teams'

  const schema = useMemo(() => createRegistrationSchema(event), [event])

  // Helper to extract positions from positionScores for editing
  const getDefaultPlayerData = (player: {
    id: string
    positionScores?: Record<string, number | null> | null
  }) => {
    const positions = getPositions(player.positionScores)
    if (isSpeedSoloTeams) {
      const oneHanded = positions.find((p) =>
        ONE_HANDED_POSITIONS.includes(p as PositionKey)
      ) as 'R' | 'L' | null
      const twoHanded = positions.find((p) =>
        TWO_HANDED_POSITIONS.includes(p as PositionKey)
      ) as 'F' | 'B' | null
      return {
        playerId: player.id,
        oneHandedPosition: oneHanded ?? null,
        twoHandedPosition: twoHanded ?? null,
      }
    }
    return {
      playerId: player.id,
      position: (positions[0] as PositionKey) ?? null,
    }
  }

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      players: registration?.players
        ? registration.players.map(getDefaultPlayerData)
        : Array(event.minPlayers)
            .fill(null)
            .map(() =>
              isSpeedSoloTeams
                ? {
                    playerId: '',
                    oneHandedPosition: null,
                    twoHandedPosition: null,
                  }
                : { playerId: '', position: null }
            ),
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'players',
  })

  // Fetch existing registrations to exclude already-registered players
  useEffect(() => {
    fetchRegistrations(event.id)
  }, [event.id, fetchRegistrations])

  const watchedPlayers = form.watch('players')

  // Calculate excluded player IDs based on existing registrations
  const excludedPlayerIds = useMemo(() => {
    const excluded: string[] = []

    registrations.forEach((reg) => {
      if (
        reg.id !== registration?.id &&
        reg.players &&
        reg.players.length > 0
      ) {
        reg.players.forEach((p) => excluded.push(p.id))
      }
    })

    return excluded
  }, [registrations, registration])

  // Get excluded IDs for each player slot
  const getExcludedIdsForSlot = (slotIndex: number) => {
    const selectedInOtherSlots = watchedPlayers
      .filter((_, idx) => idx !== slotIndex)
      .map((p) => p.playerId)
      .filter(Boolean)

    return [...excludedPlayerIds, ...selectedInOtherSlots]
  }

  // Get positions already selected by other players (for relay/solo-teams)
  const getExcludedPositionsForSlot = (slotIndex: number): PositionKey[] => {
    if (event.eventType !== 'relay' && event.eventType !== 'solo-teams')
      return []
    return watchedPlayers
      .filter((_, idx) => idx !== slotIndex)
      .map((p) => p.position)
      .filter((pos): pos is PositionKey => pos !== null && pos !== undefined)
  }

  // Get excluded one-handed positions for speed-solo-teams (R or L already taken)
  const getExcludedOneHandedForSlot = (slotIndex: number): ('R' | 'L')[] => {
    if (!isSpeedSoloTeams) return []
    return watchedPlayers
      .filter((_, idx) => idx !== slotIndex)
      .map((p) => p.oneHandedPosition)
      .filter((pos): pos is 'R' | 'L' => pos !== null && pos !== undefined)
  }

  // Get excluded two-handed positions for speed-solo-teams (F or B already taken)
  const getExcludedTwoHandedForSlot = (slotIndex: number): ('F' | 'B')[] => {
    if (!isSpeedSoloTeams) return []
    return watchedPlayers
      .filter((_, idx) => idx !== slotIndex)
      .map((p) => p.twoHandedPosition)
      .filter((pos): pos is 'F' | 'B' => pos !== null && pos !== undefined)
  }

  const onSubmit = async (data: RegistrationFormData) => {
    try {
      clearError()
      const playerIds = data.players.map((p) => p.playerId)

      // For team test events, include players array with positionScores
      // Convert position selection(s) to positionScores format
      let playersWithPositions:
        | {
            playerId: string
            positionScores: Record<string, null> | null
            order: number
          }[]
        | undefined

      if (isTeamTest) {
        if (isSpeedSoloTeams) {
          // Speed-solo-teams: combine both positions into positionScores
          playersWithPositions = data.players.map((p, index) => {
            const scores: Record<string, null> = {}
            if (p.oneHandedPosition) scores[p.oneHandedPosition] = null
            if (p.twoHandedPosition) scores[p.twoHandedPosition] = null
            return {
              playerId: p.playerId,
              positionScores: Object.keys(scores).length > 0 ? scores : null,
              order: index + 1,
            }
          })
        } else {
          // Relay/solo-teams: single position
          playersWithPositions = data.players.map((p, index) => ({
            playerId: p.playerId,
            positionScores: p.position ? { [p.position]: null } : null,
            order: index + 1,
          }))
        }
      }

      if (isEditing && registration) {
        await updateRegistration(registration.id, {
          playerIds,
          players: playersWithPositions,
        })
      } else {
        await createRegistration({
          eventId: event.id,
          playerIds,
          players: playersWithPositions,
        })
      }
      onSuccess?.()
    } catch (err) {
      console.error('Error submitting registration form:', err)
    }
  }

  const canAddPlayer = fields.length < event.maxPlayers
  const canRemovePlayer = fields.length > event.minPlayers

  const getPlayerLabel = (index: number) => {
    if (event.maxPlayers === 1) return 'Player'
    return `Player ${index + 1}`
  }

  return (
    <DialogContent className={`${DIALOG_CLASSES.simpleForm} max-h-[90vh] overflow-y-auto`}>
      <DialogHeader>
        <DialogTitle>
          {isEditing ? 'Edit Registration' : 'Register for Event'}
        </DialogTitle>
        <DialogDescription>
          {isEditing
            ? `Update ${
                event.maxPlayers === 1 ? 'the player' : 'players'
              } for this registration`
            : `Select ${
                event.maxPlayers === 1 ? 'a player' : 'players'
              } to register`}
          {event.minPlayers !== event.maxPlayers &&
            ` (${event.minPlayers}-${event.maxPlayers} players)`}
          . Only players from your club are eligible.
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
          {fields.map((field, index) => (
            <div key={field.id} className='space-y-2'>
              {/* Header with label and remove button */}
              <div className='flex items-center justify-between'>
                <FormLabel>{getPlayerLabel(index)}</FormLabel>
                {canRemovePlayer && index >= event.minPlayers && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => remove(index)}
                    className='h-6 w-6 p-0 text-destructive'
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                )}
              </div>

              {/* For relay/solo-teams: player and position on same line */}
              {isTeamTest && !isSpeedSoloTeams ? (
                <div className='flex gap-2 items-start'>
                  <FormField
                    control={form.control}
                    name={`players.${index}.playerId`}
                    render={({ field: formField }) => (
                      <FormItem className='flex-1'>
                        <FormControl>
                          <PlayerCombobox
                            value={formField.value || undefined}
                            gender={
                              event.gender === 'mixed' ? 'all' : event.gender
                            }
                            organizationId={event.organizationId}
                            onValueChange={formField.onChange}
                            placeholder='Select player'
                            excludedPlayerIds={getExcludedIdsForSlot(index)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`players.${index}.position`}
                    render={({ field: positionField }) => (
                      <FormItem className='w-32'>
                        <Select
                          onValueChange={(value) =>
                            positionField.onChange(
                              value === 'none' ? null : value
                            )
                          }
                          value={positionField.value ?? 'none'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Position' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value='none'>-</SelectItem>
                            {POSITION_KEYS.filter(
                              (pos) =>
                                !getExcludedPositionsForSlot(index).includes(
                                  pos
                                )
                            ).map((pos) => (
                              <SelectItem key={pos} value={pos}>
                                {POSITION_LABELS[pos]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : (
                /* For non-team or speed-solo-teams: player only (positions handled separately) */
                <FormField
                  control={form.control}
                  name={`players.${index}.playerId`}
                  render={({ field: formField }) => (
                    <FormItem>
                      <FormControl>
                        <PlayerCombobox
                          value={formField.value || undefined}
                          onValueChange={formField.onChange}
                          gender={
                            event.gender === 'mixed' ? 'all' : event.gender
                          }
                          organizationId={event.organizationId}
                          placeholder={`Select ${getPlayerLabel(
                            index
                          ).toLowerCase()}`}
                          excludedPlayerIds={getExcludedIdsForSlot(index)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* For speed-solo-teams: dual position selects (R/L and F/B) */}
              {isSpeedSoloTeams && (
                <div className='grid grid-cols-2 gap-2'>
                  <FormField
                    control={form.control}
                    name={`players.${index}.oneHandedPosition`}
                    render={({ field: positionField }) => (
                      <FormItem>
                        <FormLabel className='text-xs text-muted-foreground'>
                          One-Handed (R/L)
                        </FormLabel>
                        <Select
                          onValueChange={(value) =>
                            positionField.onChange(
                              value === 'none' ? null : value
                            )
                          }
                          value={positionField.value ?? 'none'}
                        >
                          <FormControl>
                            <SelectTrigger className='h-8'>
                              <SelectValue placeholder='R or L' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value='none'>-</SelectItem>
                            {ONE_HANDED_POSITIONS.filter(
                              (pos) =>
                                !getExcludedOneHandedForSlot(index).includes(
                                  pos as 'R' | 'L'
                                )
                            ).map((pos) => (
                              <SelectItem key={pos} value={pos}>
                                {POSITION_LABELS[pos]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`players.${index}.twoHandedPosition`}
                    render={({ field: positionField }) => (
                      <FormItem>
                        <FormLabel className='text-xs text-muted-foreground'>
                          Two-Handed (F/B)
                        </FormLabel>
                        <Select
                          onValueChange={(value) =>
                            positionField.onChange(
                              value === 'none' ? null : value
                            )
                          }
                          value={positionField.value ?? 'none'}
                        >
                          <FormControl>
                            <SelectTrigger className='h-8'>
                              <SelectValue placeholder='F or B' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value='none'>-</SelectItem>
                            {TWO_HANDED_POSITIONS.filter(
                              (pos) =>
                                !getExcludedTwoHandedForSlot(index).includes(
                                  pos as 'F' | 'B'
                                )
                            ).map((pos) => (
                              <SelectItem key={pos} value={pos}>
                                {POSITION_LABELS[pos]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>
          ))}

          {canAddPlayer && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() =>
                append(
                  isSpeedSoloTeams
                    ? {
                        playerId: '',
                        oneHandedPosition: null,
                        twoHandedPosition: null,
                      }
                    : { playerId: '', position: null }
                )
              }
              className='w-full'
            >
              <Plus className='mr-2 h-4 w-4' />
              Add Player
            </Button>
          )}

          {error && <div className='text-sm text-destructive'>{error}</div>}

          <DialogFooter className='flex-col sm:flex-row gap-2 sm:gap-0'>
            {onCancel && (
              <Button
                type='button'
                variant='outline'
                onClick={onCancel}
                className='w-full sm:w-auto'
              >
                Cancel
              </Button>
            )}
            <Button
              type='submit'
              disabled={isLoading}
              className='w-full sm:w-auto'
            >
              <UserPlus className='mr-2 h-4 w-4' />
              {isLoading
                ? isEditing
                  ? 'Updating...'
                  : 'Registering...'
                : isEditing
                ? 'Update Registration'
                : 'Register'}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  )
}

export default RegistrationForm
