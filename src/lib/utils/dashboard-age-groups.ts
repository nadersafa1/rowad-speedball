import {
  dashboardAgeGroupValues,
  type DashboardAgeGroupValue,
} from '@/types/api/results.schemas'

/**
 * Dashboard age-group filter: the API omits `ageGroups` when there is no effective
 * restriction — empty selection, or every group checked (same as “show all”).
 */
export function isFullDashboardAgeGroupSelection(
  selected: readonly DashboardAgeGroupValue[]
): boolean {
  if (selected.length !== dashboardAgeGroupValues.length) {
    return false
  }
  return dashboardAgeGroupValues.every((g) => selected.includes(g))
}

/**
 * Returns the list to send as `ageGroups`, or `undefined` when the API should not filter by age.
 */
export function dashboardAgeGroupsForApi(
  selected: readonly DashboardAgeGroupValue[]
): DashboardAgeGroupValue[] | undefined {
  if (selected.length === 0) return undefined
  if (isFullDashboardAgeGroupSelection(selected)) return undefined
  return [...selected]
}
