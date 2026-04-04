'use client'

import * as React from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useTestsDashboardStore,
  ALL_POSITIONS,
} from '@/store/tests-dashboard-store'
import type { AggregationMode, PositionKey } from '@/store/tests-dashboard-store'
import { POSITION_LABELS, AGGREGATION_LABELS } from '../utils/aggregation'
import { orderSelectedTestsOldestFirst } from '../utils/sort-tests-by-conducted'
import type { Test } from '@/types'
import { DashboardAgeGroupFilter } from './dashboard-age-group-filter'
import { DashboardTestMultiSelect } from './dashboard-test-multi-select'
import { DashboardTestWeightsSection } from './dashboard-test-weights-section'

interface DashboardFiltersProps {
  readonly availableTests: Test[]
  readonly isLoadingTests: boolean
}

/**
 * Dashboard filter surface: test selection (API), positions & aggregation (client),
 * gender & age groups (API), optional weights for weighted aggregation.
 */
export default function DashboardFilters({
  availableTests,
  isLoadingTests,
}: DashboardFiltersProps) {
  const selectedTestIds = useTestsDashboardStore((s) => s.selectedTestIds)
  const selectedPositions = useTestsDashboardStore((s) => s.selectedPositions)
  const searchQuery = useTestsDashboardStore((s) => s.searchQuery)
  const aggregationMode = useTestsDashboardStore((s) => s.aggregationMode)
  const setSelectedPositions = useTestsDashboardStore(
    (s) => s.setSelectedPositions
  )
  const setSearchQuery = useTestsDashboardStore((s) => s.setSearchQuery)
  const setAggregationMode = useTestsDashboardStore(
    (s) => s.setAggregationMode
  )
  const setGenderFilter = useTestsDashboardStore((s) => s.setGenderFilter)
  const genderFilter = useTestsDashboardStore((s) => s.genderFilter)

  const togglePosition = (position: PositionKey) => {
    const next = selectedPositions.includes(position)
      ? selectedPositions.filter((p) => p !== position)
      : [...selectedPositions, position]
    if (next.length > 0) {
      setSelectedPositions(next)
    }
  }

  const selectedTestsOldestFirst = React.useMemo(
    () => orderSelectedTestsOldestFirst(selectedTestIds, availableTests),
    [selectedTestIds, availableTests]
  )

  return (
    <Card>
      <CardHeader className='pb-4'>
        <CardTitle className='flex items-center gap-2 text-lg'>
          <SlidersHorizontal className='h-5 w-5' />
          Dashboard Filters
        </CardTitle>
        <CardDescription>
          Select tests, positions, and aggregation mode to analyze player
          performance
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Row 1: data scope (tests, positions, search, aggregation) */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          <DashboardTestMultiSelect
            availableTests={availableTests}
            isLoadingTests={isLoadingTests}
          />

          <div className='space-y-2'>
            <Label>Positions</Label>
            <div className='flex flex-wrap gap-2'>
              {ALL_POSITIONS.map((pos) => (
                <Button
                  key={pos}
                  variant={
                    selectedPositions.includes(pos) ? 'default' : 'outline'
                  }
                  size='sm'
                  onClick={() => togglePosition(pos)}
                  className='text-xs'
                >
                  {POSITION_LABELS[pos]}
                </Button>
              ))}
            </div>
          </div>

          <div className='space-y-2'>
            <Label>Search Players</Label>
            <div className='relative'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
              <Input
                placeholder='Search by name...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='pl-8'
              />
            </div>
          </div>

          <div className='space-y-2'>
            <Label>Aggregation</Label>
            <Select
              value={aggregationMode}
              onValueChange={(v) => setAggregationMode(v as AggregationMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(AGGREGATION_LABELS) as [
                    AggregationMode,
                    string,
                  ][]
                ).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: server filters applied when refetching dashboard results */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          <div className='space-y-2'>
            <Label>Gender</Label>
            <Select value={genderFilter} onValueChange={setGenderFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Genders</SelectItem>
                <SelectItem value='male'>Male</SelectItem>
                <SelectItem value='female'>Female</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DashboardAgeGroupFilter />
        </div>

        {aggregationMode === 'weighted' && selectedTestIds.length > 0 && (
          <DashboardTestWeightsSection
            selectedTestsOldestFirst={selectedTestsOldestFirst}
          />
        )}
      </CardContent>
    </Card>
  )
}
