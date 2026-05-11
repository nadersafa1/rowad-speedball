import type { OrganizationContext } from '@/lib/organization-helpers'
import type {
  AuthorizationResult,
  ResultResource,
  TestResource,
} from '@/lib/authorization/types'
import {
  requireAuthentication,
  requireOrganization,
  hasCoachPermissions,
  forbiddenResponse,
  isSystemAdmin,
  checkOrganizationAccess,
  belongsToUserOrganization,
} from '@/lib/authorization/types'

/**
 * Check if user has authorization to create test results
 * Returns Response if unauthorized, null if authorized
 *
 * Authorization rules:
 * - Must be authenticated
 * - Must be system admin, org admin, org owner, or org coach
 * - Must have an active organization (unless system admin)
 * - Test must belong to user's organization (unless system admin)
 */
export function checkResultCreateAuthorization(
  context: OrganizationContext,
  test: TestResource
): AuthorizationResult {
  // Require authentication
  const authCheck = requireAuthentication(context)
  if (authCheck) return authCheck

  // Check role permissions
  if (!hasCoachPermissions(context)) {
    return forbiddenResponse(
      'Only system admins, club admins, club owners, and club coaches can create test results'
    )
  }

  // Require active organization (unless system admin)
  if (!isSystemAdmin(context)) {
    const orgCheck = requireOrganization(context)
    if (orgCheck) return orgCheck
  }

  // Organization ownership check: org members can only create results for tests from their own organization
  const ownershipCheck = checkOrganizationAccess(
    context,
    test.organizationId,
    'You can only create test results for tests from your own organization'
  )
  if (ownershipCheck) return ownershipCheck

  return null
}

/**
 * Check if user has authorization to read/view a test result
 * Returns Response if unauthorized, null if authorized
 *
 * Authorization rules:
 * - System admin: can see all results
 * - Org members: can see results from their org tests (public + private) + public tests + tests without org
 * - Non-authenticated: can see results from public tests + tests without org
 */
export function checkResultReadAuthorization(
  context: OrganizationContext,
  test: TestResource | null
): AuthorizationResult {
  // System admin: can see all results
  if (isSystemAdmin(context)) {
    return null
  }

  // If test is null, allow (will be handled as 404 later)
  if (!test) {
    return null
  }

  const isPublic = test.visibility === 'public'
  const hasNoOrganization = test.organizationId === null
  const isFromUserOrg = belongsToUserOrganization(context, test.organizationId)

  // coaches-only: only system admins or same-org owner/admin/coach can read results
  if (test.visibility === 'coaches-only') {
    if (!isFromUserOrg || !hasCoachPermissions(context)) {
      return forbiddenResponse('Forbidden')
    }
    return null
  }

  // Allow if: public OR no organization OR from user's org (private)
  // Block if: private AND has organization AND not from user's org
  if (!isPublic && !hasNoOrganization && !isFromUserOrg) {
    return forbiddenResponse('Forbidden')
  }

  return null
}

/**
 * Check if user has authorization to update a test result
 * Returns Response if unauthorized, null if authorized
 *
 * Authorization rules:
 * - Must be authenticated
 * - Must be system admin, org admin, org owner, or org coach
 * - Must have an active organization (unless system admin)
 * - Test must belong to user's organization (unless system admin)
 */
export function checkResultUpdateAuthorization(
  context: OrganizationContext,
  result: ResultResource,
  test: TestResource
): AuthorizationResult {
  // Require authentication
  const authCheck = requireAuthentication(context)
  if (authCheck) return authCheck

  // Check role permissions
  if (!hasCoachPermissions(context)) {
    return forbiddenResponse(
      'Only system admins, club admins, club owners, and club coaches can update test results'
    )
  }

  // Require active organization (unless system admin)
  if (!isSystemAdmin(context)) {
    const orgCheck = requireOrganization(context)
    if (orgCheck) return orgCheck
  }

  // Organization ownership check: org members can only update results for tests from their own organization
  const ownershipCheck = checkOrganizationAccess(
    context,
    test.organizationId,
    'You can only update test results for tests from your own organization'
  )
  if (ownershipCheck) return ownershipCheck

  return null
}

/**
 * Check if user has authorization to delete a test result
 * Returns Response if unauthorized, null if authorized
 *
 * Authorization rules:
 * - Must be authenticated
 * - Must be system admin, org admin, or org owner (coaches CANNOT delete)
 * - Must have an active organization (unless system admin)
 * - Test must belong to user's organization (unless system admin)
 */
export function checkResultDeleteAuthorization(
  context: OrganizationContext,
  result: ResultResource,
  test: TestResource
): AuthorizationResult {
  // Require authentication
  const authCheck = requireAuthentication(context)
  if (authCheck) return authCheck

  // Check role permissions (more restrictive - no coaches)
  const { isSystemAdmin, isAdmin, isOwner } = context
  if (!isSystemAdmin && !isAdmin && !isOwner) {
    return forbiddenResponse(
      'Only system admins, club admins, and club owners can delete test results'
    )
  }

  // Require active organization (unless system admin)
  if (!isSystemAdmin) {
    const orgCheck = requireOrganization(context)
    if (orgCheck) return orgCheck
  }

  // Organization ownership check: org members can only delete results for tests from their own organization
  const ownershipCheck = checkOrganizationAccess(
    context,
    test.organizationId,
    'You can only delete test results for tests from your own organization'
  )
  if (ownershipCheck) return ownershipCheck

  return null
}
