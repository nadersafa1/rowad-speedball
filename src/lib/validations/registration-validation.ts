// Registration Validation Utilities
import { EventType, isSoloTestEventType } from '@/types/event-types'
import type { PositionScores, PositionKey } from '@/types/position-scores'
import { POSITION_KEYS } from '@/types/position-scores'
import {
  ONE_HANDED_POSITIONS,
  TWO_HANDED_POSITIONS,
  getPositions as _getPositions,
} from '@/lib/utils/position-utils'

type ValidationResult = { valid: boolean; error?: string }

// ============================================
// POSITION HELPER FUNCTIONS
// ============================================

/**
 * Extract position keys from positionScores object
 * Returns array of position keys that exist in the object (even if value is null)
 *
 * @deprecated Use getPositions from position-utils.ts instead
 */
export const getPositions = _getPositions

/**
 * Check if a specific position is assigned in positionScores
 */
export const hasPosition = (
  positionScores: PositionScores | null | undefined,
  position: PositionKey
): boolean => {
  if (!positionScores) return false
  return position in positionScores
}

/**
 * Get score for a specific position (returns 0 if not set or null)
 */
export const getPositionScore = (
  positionScores: PositionScores | null | undefined,
  position: PositionKey
): number => {
  if (!positionScores) return 0
  const score = positionScores[position]
  return typeof score === 'number' ? score : 0
}

/**
 * Calculate total score from positionScores
 */
export const sumPositionScores = (
  positionScores: PositionScores | null | undefined
): number => {
  if (!positionScores) return 0
  return POSITION_KEYS.reduce(
    (sum, key) => sum + getPositionScore(positionScores, key),
    0
  )
}

/**
 * Check if all four positions have scores (not null) for solo events
 */
export const hasAllPositionScores = (
  positionScores: PositionScores | null | undefined
): boolean => {
  if (!positionScores) return false
  return POSITION_KEYS.every((key) => typeof positionScores[key] === 'number')
}

// ============================================
// POSITION VALIDATION FUNCTIONS
// ============================================

/**
 * Validates position scores structure
 * Ensures only valid keys (R, L, F, B) and values are numbers or null
 */
export const validatePositionScores = (
  positionScores: PositionScores | null | undefined
): ValidationResult => {
  if (positionScores === null || positionScores === undefined) {
    return { valid: true } // null/undefined is valid (no positions assigned)
  }

  const keys = Object.keys(positionScores)

  // Check for invalid keys
  const invalidKeys = keys.filter(
    (key) => !POSITION_KEYS.includes(key as PositionKey)
  )
  if (invalidKeys.length > 0) {
    return {
      valid: false,
      error: `Invalid position keys: ${invalidKeys.join(
        ', '
      )}. Valid keys are R, L, F, B.`,
    }
  }

  // Check for invalid values (must be number or null)
  for (const key of keys as PositionKey[]) {
    const value = positionScores[key]
    if (value !== null && value !== undefined && typeof value !== 'number') {
      return {
        valid: false,
        error: `Position ${key} must have a numeric score or null`,
      }
    }
    if (typeof value === 'number' && value < 0) {
      return {
        valid: false,
        error: `Position ${key} score cannot be negative`,
      }
    }
  }

  return { valid: true }
}

/**
 * Validates position constraints based on event type
 * - solo-teams/relay: one position per player, no repeats
 * - speed-solo-teams: 2 positions per player (one R/L, one F/B), no repeats within category
 * - solo events: all four positions
 */
export const validatePositionConstraints = (
  eventType: EventType | string,
  newPositionScores: PositionScores | null | undefined,
  existingPositions: PositionKey[] = []
): ValidationResult => {
  const newPositions = getPositions(newPositionScores)

  // Solo events: require all four positions for scoring
  if (isSoloTestEventType(eventType)) {
    // For solo events, positions are not strictly enforced during registration
    // but all four scores are required before calculating totals
    return { valid: true }
  }

  // Solo-teams and Relay: one position per player
  if (eventType === EventType.SoloTeams || eventType === EventType.Relay) {
    if (newPositions.length > 1) {
      return {
        valid: false,
        error:
          'Each player can only have one position in solo-teams/relay events',
      }
    }

    // Check for position conflicts with existing players
    for (const pos of newPositions) {
      if (existingPositions.includes(pos)) {
        return {
          valid: false,
          error: `Position ${pos} is already assigned to another player`,
        }
      }
    }

    return { valid: true }
  }

  // Speed-solo-teams: exactly 2 positions (one R/L, one F/B)
  if (eventType === EventType.SpeedSoloTeams) {
    const oneHandedCount = newPositions.filter((p) =>
      ONE_HANDED_POSITIONS.includes(p)
    ).length
    const twoHandedCount = newPositions.filter((p) =>
      TWO_HANDED_POSITIONS.includes(p)
    ).length

    if (newPositions.length > 0) {
      if (oneHandedCount > 1) {
        return {
          valid: false,
          error: 'Player can only have one one-handed position (R or L)',
        }
      }
      if (twoHandedCount > 1) {
        return {
          valid: false,
          error: 'Player can only have one two-handed position (F or B)',
        }
      }
      if (newPositions.length > 2) {
        return {
          valid: false,
          error: 'Player can have at most 2 positions (one R/L and one F/B)',
        }
      }
    }

    // Check for position conflicts with existing players within categories
    for (const pos of newPositions) {
      if (existingPositions.includes(pos)) {
        return {
          valid: false,
          error: `Position ${pos} is already assigned to another player`,
        }
      }
    }

    return { valid: true }
  }

  // Other event types: no position restrictions
  return { valid: true }
}

/**
 * Validates max_players > min_players constraint for events
 */
export const validateMaxGreaterThanMin = (
  minPlayers: number,
  maxPlayers: number
): ValidationResult => {
  if (maxPlayers < minPlayers) {
    return {
      valid: false,
      error: 'Maximum players must be greater than or equal to minimum players',
    }
  }
  return { valid: true }
}

/**
 * Validates player count based on min/max configuration
 */
export const validateRegistrationPlayerCount = (
  _eventType: EventType | string, // Kept for backward compatibility but no longer used for logic
  playerCount: number,
  minPlayers: number = 1,
  maxPlayers: number = 2
): ValidationResult => {
  if (playerCount === 0) {
    return { valid: false, error: 'At least one player is required' }
  }

  if (playerCount < minPlayers) {
    return {
      valid: false,
      error: `This event requires at least ${minPlayers} player${
        minPlayers > 1 ? 's' : ''
      }`,
    }
  }

  if (playerCount > maxPlayers) {
    return {
      valid: false,
      error: `This event allows maximum ${maxPlayers} player${
        maxPlayers > 1 ? 's' : ''
      }`,
    }
  }

  return { valid: true }
}

/**
 * Validates gender rules for an array of players
 */
export const validateGenderRulesForPlayers = (
  eventGender: 'male' | 'female' | 'mixed',
  playerGenders: ('male' | 'female')[],
  eventType: EventType | string
): ValidationResult => {
  if (playerGenders.length === 0) {
    return { valid: false, error: 'At least one player is required' }
  }

  const maleCount = playerGenders.filter((g) => g === 'male').length
  const femaleCount = playerGenders.filter((g) => g === 'female').length

  // Solo test events and Singles: single player events
  if (isSoloTestEventType(eventType) || eventType === EventType.Singles) {
    if (eventGender === 'male' && playerGenders[0] !== 'male') {
      return { valid: false, error: "Men's event requires a male player" }
    }
    if (eventGender === 'female' && playerGenders[0] !== 'female') {
      return { valid: false, error: "Women's event requires a female player" }
    }
    return { valid: true }
  }

  // For doubles and team events
  if (eventGender === 'male') {
    if (femaleCount > 0) {
      return {
        valid: false,
        error: "Men's event requires all players to be male",
      }
    }
  } else if (eventGender === 'female') {
    if (maleCount > 0) {
      return {
        valid: false,
        error: "Women's event requires all players to be female",
      }
    }
  } else if (eventGender === 'mixed') {
    // For mixed doubles specifically, require at least 1 of each gender
    if (eventType === EventType.Doubles) {
      if (maleCount !== 1 || femaleCount !== 1) {
        return {
          valid: false,
          error: 'Mixed doubles requires 1 male and 1 female player',
        }
      }
    }
    // For mixed team events, any combination is allowed
  }

  return { valid: true }
}

type PlayerOrgRecord = { organizationId: string | null }

/**
 * Validates that an event belongs to a club (has organizationId).
 * System admins may register for events without an organization.
 */
export const validateEventIsClubScoped = (
  eventOrganizationId: string | null | undefined,
  isSystemAdmin: boolean
): ValidationResult => {
  if (isSystemAdmin) {
    return { valid: true }
  }

  if (!eventOrganizationId) {
    return {
      valid: false,
      error: 'Registrations can only be added to club events',
    }
  }

  return { valid: true }
}

/**
 * Validates registration window (start/end dates) for an event.
 */
export const validateRegistrationWindow = (event: {
  registrationStartDate?: string | null
  registrationEndDate?: string | null
}): ValidationResult => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (event.registrationStartDate) {
    const startDate = new Date(event.registrationStartDate)
    startDate.setHours(0, 0, 0, 0)
    if (today < startDate) {
      return {
        valid: false,
        error: 'Registration has not opened yet',
      }
    }
  }

  if (event.registrationEndDate) {
    const endDate = new Date(event.registrationEndDate)
    endDate.setHours(23, 59, 59, 999)
    if (today > endDate) {
      return {
        valid: false,
        error: 'Registration period has ended',
      }
    }
  }

  return { valid: true }
}

/**
 * Validates that all players belong to the event's organization.
 * System admins may register players from any organization.
 */
export const validatePlayersBelongToOrganization = (
  players: PlayerOrgRecord[],
  eventOrganizationId: string | null | undefined,
  isSystemAdmin: boolean
): ValidationResult => {
  if (isSystemAdmin) {
    return { valid: true }
  }

  if (!eventOrganizationId) {
    return {
      valid: false,
      error: 'Event must belong to a club to register players',
    }
  }

  const invalidPlayer = players.find(
    (p) => p.organizationId !== eventOrganizationId
  )
  if (invalidPlayer) {
    return {
      valid: false,
      error: 'All players must belong to the event club',
    }
  }

  return { valid: true }
}

/**
 * Checks if a player's gender matches the event gender requirements.
 */
export const isPlayerGenderEligible = (
  eventGender: 'male' | 'female' | 'mixed',
  playerGender: 'male' | 'female'
): boolean => {
  if (eventGender === 'mixed') return true
  return eventGender === playerGender
}
