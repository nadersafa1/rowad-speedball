import { useEffect } from 'react'
import { useTestsStore } from '@/store/tests-store'
import { useTestsDashboardStore } from '@/store/tests-dashboard-store'

/**
 * Keeps the tests dashboard in sync with backend data:
 * 1) Loads the test catalog once for the filter dropdown (Zustand tests store).
 * 2) Refetches aggregated dashboard results when server-side filters or selected tests change.
 *
 * useEffect is appropriate here: we react to store state and trigger HTTP, not derived UI.
 * `fetchTests` / `fetchDashboardData` catch failures inside the Zustand actions and update each
 * store’s `error` field; they do not reject, so no outer `.catch` is needed.
 */
export function useTestsDashboardPageSync() {
  const fetchTests = useTestsStore((s) => s.fetchTests)

  const selectedTestIds = useTestsDashboardStore((s) => s.selectedTestIds)
  const genderFilter = useTestsDashboardStore((s) => s.genderFilter)
  const ageGroupFilters = useTestsDashboardStore((s) => s.ageGroupFilters)
  const fetchDashboardData = useTestsDashboardStore((s) => s.fetchDashboardData)

  useEffect(() => {
    fetchTests({ limit: 100 })
  }, [fetchTests])

  useEffect(() => {
    if (selectedTestIds.length === 0) return
    fetchDashboardData()
  }, [selectedTestIds, genderFilter, ageGroupFilters, fetchDashboardData])
}
