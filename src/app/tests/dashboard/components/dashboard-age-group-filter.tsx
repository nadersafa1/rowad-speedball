'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTestsDashboardStore } from '@/store/tests-dashboard-store'
import {
  dashboardAgeGroupValues,
  type DashboardAgeGroupValue,
} from '@/types/api/results.schemas'
import {
  isFullDashboardAgeGroupSelection,
} from '@/lib/utils/dashboard-age-groups'

const AGE_GROUP_LABELS: Record<DashboardAgeGroupValue, string> = {
  mini: 'Mini (U-07)',
  'U-09': 'U-09',
  'U-11': 'U-11',
  'U-13': 'U-13',
  'U-15': 'U-15',
  'U-17': 'U-17',
  'U-19': 'U-19',
  'U-21': 'U-21',
  Seniors: 'Seniors',
}

function AgeGroupTriggerSummary({
  selected,
}: Readonly<{
  selected: readonly DashboardAgeGroupValue[]
}>) {
  if (selected.length === 0) {
    return (
      <span className='text-muted-foreground'>No age groups selected</span>
    )
  }

  const allSelected = isFullDashboardAgeGroupSelection(selected)
  if (allSelected) {
    return <span className='text-muted-foreground'>All age groups</span>
  }

  if (selected.length <= 2) {
    return (
      <div className='flex flex-wrap gap-1'>
        {selected.map((g) => (
          <Badge key={g} variant='secondary' className='text-xs'>
            {AGE_GROUP_LABELS[g]}
          </Badge>
        ))}
      </div>
    )
  }

  return (
    <Badge variant='secondary' className='text-xs'>
      {selected.length} age groups
    </Badge>
  )
}

/**
 * Multi-select age groups for server-side filtering of dashboard players.
 * Empty or “all checked” both mean no `ageGroups` query param (see dashboardAgeGroupsForApi).
 */
export function DashboardAgeGroupFilter() {
  const ageGroupFilters = useTestsDashboardStore((s) => s.ageGroupFilters)
  const setAgeGroupFilters = useTestsDashboardStore((s) => s.setAgeGroupFilters)

  const [open, setOpen] = React.useState(false)

  const allSelected = isFullDashboardAgeGroupSelection(ageGroupFilters)
  const hasSelection = ageGroupFilters.length > 0

  const toggleGroup = (value: DashboardAgeGroupValue) => {
    const next = ageGroupFilters.includes(value)
      ? ageGroupFilters.filter((g) => g !== value)
      : [...ageGroupFilters, value]
    setAgeGroupFilters(next)
  }

  const selectAllGroups = () => {
    setAgeGroupFilters([...dashboardAgeGroupValues])
  }

  const clearAllGroups = () => {
    setAgeGroupFilters([])
  }

  return (
    <div className='space-y-2'>
      <Label>Age groups</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            className='w-full justify-start font-normal h-auto min-h-9'
          >
            <AgeGroupTriggerSummary selected={ageGroupFilters} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-72 p-0' align='start'>
          <div className='p-2 border-b flex flex-col gap-1'>
            {!allSelected && (
              <Button
                variant='ghost'
                size='sm'
                className='w-full justify-start text-xs'
                onClick={selectAllGroups}
              >
                Select all age groups
              </Button>
            )}
            {hasSelection && (
              <Button
                variant='ghost'
                size='sm'
                className='w-full justify-start text-xs text-muted-foreground'
                onClick={clearAllGroups}
              >
                Reset
              </Button>
            )}
          </div>
          <div className='max-h-60 overflow-y-auto p-2 space-y-1'>
            {dashboardAgeGroupValues.map((value) => (
              <label
                key={value}
                className='flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer'
              >
                <Checkbox
                  checked={ageGroupFilters.includes(value)}
                  onCheckedChange={() => toggleGroup(value)}
                />
                <span className='text-sm'>{AGE_GROUP_LABELS[value]}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
