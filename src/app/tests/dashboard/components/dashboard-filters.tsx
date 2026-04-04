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
import { Checkbox } from '@/components/ui/checkbox'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import {
  useTestsDashboardStore,
  ALL_POSITIONS,
} from '@/store/tests-dashboard-store'
import type {
  PositionKey,
  AggregationMode,
} from '@/store/tests-dashboard-store'
import { POSITION_LABELS, AGGREGATION_LABELS } from '../utils/aggregation'
import type { Test } from '@/types'

interface DashboardFiltersProps {
  readonly availableTests: Test[]
  readonly isLoadingTests: boolean
}

export default function DashboardFilters({
  availableTests,
  isLoadingTests,
}: DashboardFiltersProps) {
  const {
    selectedTestIds,
    selectedPositions,
    searchQuery,
    aggregationMode,
    weights,
    genderFilter,
    ageGroupFilter,
    setSelectedTestIds,
    setSelectedPositions,
    setSearchQuery,
    setAggregationMode,
    setWeight,
    setGenderFilter,
    setAgeGroupFilter,
  } = useTestsDashboardStore()

  const [testsOpen, setTestsOpen] = React.useState(false)

  const handleTestToggle = React.useCallback(
    (testId: string) => {
      const newIds = selectedTestIds.includes(testId)
        ? selectedTestIds.filter((id) => id !== testId)
        : [...selectedTestIds, testId]
      setSelectedTestIds(newIds)
    },
    [selectedTestIds, setSelectedTestIds]
  )

  const handlePositionToggle = React.useCallback(
    (position: PositionKey) => {
      const newPositions = selectedPositions.includes(position)
        ? selectedPositions.filter((p) => p !== position)
        : [...selectedPositions, position]
      if (newPositions.length > 0) {
        setSelectedPositions(newPositions)
      }
    },
    [selectedPositions, setSelectedPositions]
  )

  const handleSelectAllTests = React.useCallback(() => {
    if (selectedTestIds.length === availableTests.length) {
      setSelectedTestIds([])
    } else {
      setSelectedTestIds(availableTests.map((t) => t.id))
    }
  }, [selectedTestIds.length, availableTests, setSelectedTestIds])

  const totalWeight = React.useMemo(() => {
    return selectedTestIds.reduce((sum, id) => sum + (weights[id] ?? 0), 0)
  }, [selectedTestIds, weights])

  const selectedTestNames = React.useMemo(() => {
    return selectedTestIds
      .map((id) => availableTests.find((t) => t.id === id)?.name)
      .filter(Boolean)
  }, [selectedTestIds, availableTests])

  const testsNewestFirst = React.useMemo(() => {
    return [...availableTests].sort(
      (a, b) =>
        new Date(b.dateConducted).getTime() -
        new Date(a.dateConducted).getTime()
    )
  }, [availableTests])

  const selectedTestsOldestFirst = React.useMemo(() => {
    return selectedTestIds
      .map((id) => availableTests.find((t) => t.id === id))
      .filter((t): t is Test => t != null)
      .sort(
        (a, b) =>
          new Date(a.dateConducted).getTime() -
          new Date(b.dateConducted).getTime()
      )
  }, [selectedTestIds, availableTests])

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
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          {/* Test Multi-Select */}
          <div className='space-y-2'>
            <Label>Tests</Label>
            <Popover open={testsOpen} onOpenChange={setTestsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  className='w-full justify-start font-normal h-auto min-h-9'
                  disabled={isLoadingTests}
                >
                  {selectedTestIds.length === 0 ? (
                    <span className='text-muted-foreground'>
                      {isLoadingTests ? 'Loading tests...' : 'Select tests...'}
                    </span>
                  ) : (
                    <div className='flex flex-wrap gap-1'>
                      {selectedTestNames.length <= 2 ? (
                        selectedTestNames.map((name) => (
                          <Badge key={name} variant='secondary' className='text-xs'>
                            {name}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant='secondary' className='text-xs'>
                          {selectedTestIds.length} tests selected
                        </Badge>
                      )}
                    </div>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-80 p-0' align='start'>
                <div className='p-2 border-b'>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='w-full justify-start text-xs'
                    onClick={handleSelectAllTests}
                  >
                    {selectedTestIds.length === availableTests.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </Button>
                </div>
                <div className='max-h-60 overflow-y-auto p-2 space-y-1'>
                  {testsNewestFirst.map((test) => (
                    <label
                      key={test.id}
                      className='flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer'
                    >
                      <Checkbox
                        checked={selectedTestIds.includes(test.id)}
                        onCheckedChange={() => handleTestToggle(test.id)}
                      />
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm truncate'>{test.name}</p>
                        <p className='text-xs text-muted-foreground'>
                          {new Date(test.dateConducted).toLocaleDateString()}
                        </p>
                      </div>
                    </label>
                  ))}
                  {availableTests.length === 0 && !isLoadingTests && (
                    <p className='text-sm text-muted-foreground text-center py-4'>
                      No tests available
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Position Toggles */}
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
                  onClick={() => handlePositionToggle(pos)}
                  className='text-xs'
                >
                  {POSITION_LABELS[pos]}
                </Button>
              ))}
            </div>
          </div>

          {/* Player Search */}
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

          {/* Aggregation Mode */}
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

        {/* Second row: Gender & Age Group */}
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

          <div className='space-y-2'>
            <Label>Age Group</Label>
            <Select value={ageGroupFilter} onValueChange={setAgeGroupFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Age Groups</SelectItem>
                <SelectItem value='mini'>Mini (U-07)</SelectItem>
                <SelectItem value='U-09'>U-09</SelectItem>
                <SelectItem value='U-11'>U-11</SelectItem>
                <SelectItem value='U-13'>U-13</SelectItem>
                <SelectItem value='U-15'>U-15</SelectItem>
                <SelectItem value='U-17'>U-17</SelectItem>
                <SelectItem value='U-19'>U-19</SelectItem>
                <SelectItem value='U-21'>U-21</SelectItem>
                <SelectItem value='Seniors'>Seniors</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Weighted Mode - Weight Inputs */}
        {aggregationMode === 'weighted' && selectedTestIds.length > 0 && (
          <div className='space-y-3 pt-3 border-t'>
            <div className='flex items-center justify-between'>
              <Label className='text-sm font-medium'>
                Test Weights
              </Label>
              <span
                className={`text-xs font-medium ${Math.abs(totalWeight - 100) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}
              >
                Total: {Number.isInteger(totalWeight) ? totalWeight : totalWeight.toFixed(2)}%{' '}
                {Math.abs(totalWeight - 100) >= 0.01 && '(should be 100%)'}
              </span>
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
              {selectedTestsOldestFirst.map((test) => (
                <div
                  key={test.id}
                  className='rounded-lg border bg-muted/40 p-3 space-y-1.5'
                >
                  <div>
                    <p className='text-sm font-medium truncate' title={test.name}>
                      {test.name}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {new Date(test.dateConducted).toLocaleDateString()}
                    </p>
                  </div>
                  <div className='flex items-center gap-1.5'>
                    <Label htmlFor={`weight-${test.id}`} className='text-xs text-muted-foreground shrink-0'>
                      Weight
                    </Label>
                    <Input
                      id={`weight-${test.id}`}
                      type='number'
                      min={0}
                      max={100}
                      step='any'
                      value={weights[test.id] ?? 0}
                      onChange={(e) => {
                        const val = Number.parseFloat(e.target.value)
                        setWeight(
                          test.id,
                          Number.isNaN(val) ? 0 : Math.max(0, Math.min(100, val))
                        )
                      }}
                      className='w-20 h-8 text-sm'
                    />
                    <span className='text-xs text-muted-foreground'>%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
