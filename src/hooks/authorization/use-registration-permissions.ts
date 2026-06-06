'use client'

import { useMemo } from 'react'
import { useOrganizationContext } from './use-organization-context'

/**
 * Hook to check registration-based permissions
 * Returns permission flags based on the parent event's organization and user role
 *
 * Note: Registrations belong to events. Authorization is based on the parent event's organization.
 * Important: Coaches CAN delete registrations (different from events where only admins/owners can delete).
 *
 * @param eventOrganizationId - The organization ID of the parent event
 */
export const useRegistrationPermissions = (eventOrganizationId?: string | null) => {
  const { context } = useOrganizationContext()
  const { isSystemAdmin, isAdmin, isOwner, isCoach, organization } = context

  return useMemo(() => {
    // Check if event belongs to user's organization
    const isEventFromUserOrg =
      !!organization?.id && eventOrganizationId === organization.id

    // Create permission: System admins, org admins, org owners, org coaches
    // Must be from user's org (unless system admin)
    const canCreate =
      (isSystemAdmin || isAdmin || isOwner || isCoach) &&
      (isSystemAdmin || (isEventFromUserOrg && !!organization?.id))

    // Read permission: Registrations inherit visibility from parent events
    const canRead = true

    // Update permission: System admins, org admins, org owners, org coaches
    // Must be from user's org (unless system admin)
    const canUpdate =
      (isSystemAdmin || isAdmin || isOwner || isCoach) &&
      (isSystemAdmin || (isEventFromUserOrg && !!organization?.id))

    // Delete permission: System admins, org admins, org owners, org coaches
    // Note: Coaches CAN delete registrations (different from deleting events)
    // Must be from user's org (unless system admin)
    const canDelete =
      (isSystemAdmin || isAdmin || isOwner || isCoach) &&
      (isSystemAdmin || (isEventFromUserOrg && !!organization?.id))

    return {
      canRead,
      canCreate,
      canUpdate,
      canDelete,
    }
  }, [eventOrganizationId, isSystemAdmin, isAdmin, isOwner, isCoach, organization])
}
