'use client'

import { useEffect, useMemo } from 'react'
import { BarChart3, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import Loading from '@/components/ui/loading'
import { useRoles } from '@/hooks/authorization/use-roles'
import { useTestsStore } from '@/store/tests-store'
import { useTestsDashboardStore } from '@/store/tests-dashboard-store'
import { computeAggregatedRows } from './utils/aggregation'
import DashboardFilters from './components/dashboard-filters'
import DashboardTable from './components/dashboard-table'
import DashboardCharts from './components/dashboard-charts'

export default function TestsDashboardPage() {
  const {
    isOwner,
    isAdmin,
    isCoach,
    isAuthenticated,
    isLoading: rolesLoading,
  } = useRoles()

  const {
    tests: availableTests,
    fetchTests,
    isLoading: testsLoading,
  } = useTestsStore()

  const {
    selectedTestIds,
    selectedPositions,
    searchQuery,
    aggregationMode,
    weights,
    genderFilter,
    ageGroupFilter,
    players,
    tests: dashboardTests,
    isLoading: dashboardLoading,
    error,
    fetchDashboardData,
    clearError,
  } = useTestsDashboardStore()

  // Load the list of available tests on mount
  useEffect(() => {
    fetchTests({ limit: 100 })
  }, [fetchTests])

  // Refetch dashboard data when server-side filters change
  useEffect(() => {
    if (selectedTestIds.length > 0) {
      fetchDashboardData()
    }
  }, [selectedTestIds, genderFilter, ageGroupFilter, fetchDashboardData])

  // Client-side aggregation: recomputed when players, positions, mode, or search change
  const aggregatedRows = useMemo(
    () =>
      computeAggregatedRows(
        players,
        selectedTestIds,
        selectedPositions,
        aggregationMode,
        weights,
        searchQuery
      ),
    [players, selectedTestIds, selectedPositions, aggregationMode, weights, searchQuery]
  )

  if (rolesLoading) {
    return <Loading />
  }

  if (!isAuthenticated || (!isOwner && !isAdmin && !isCoach)) {
    return (
      <div className='container mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-8'>
        <Card className='border-destructive'>
          <CardContent className='pt-6'>
            <p className='text-destructive'>
              You do not have permission to view this page.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='container mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-8'>
      <div className='mb-4'>
        <Button variant='ghost' size='sm' asChild>
          <Link href='/tests' className='gap-2'>
            <ArrowLeft className='h-4 w-4' />
            Back to Tests
          </Link>
        </Button>
      </div>

      <PageHeader
        icon={BarChart3}
        title='Tests Dashboard'
        description='Analyze and compare player performance across multiple tests'
      />

      {error && (
        <Card className='border-destructive mb-4'>
          <CardContent className='pt-6 flex items-center justify-between'>
            <p className='text-destructive'>Error: {error}</p>
            <Button variant='outline' size='sm' onClick={clearError}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      <div className='space-y-6'>
        <DashboardFilters
          availableTests={availableTests}
          isLoadingTests={testsLoading}
        />

        <DashboardTable
          rows={aggregatedRows}
          selectedTestIds={selectedTestIds}
          selectedPositions={selectedPositions}
          aggregationMode={aggregationMode}
          tests={dashboardTests}
          isLoading={dashboardLoading}
        />

        <DashboardCharts
          rows={aggregatedRows}
          selectedTestIds={selectedTestIds}
          selectedPositions={selectedPositions}
          aggregationMode={aggregationMode}
          tests={dashboardTests}
        />
      </div>
    </div>
  )
}
