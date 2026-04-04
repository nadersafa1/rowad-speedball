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
import type { Test } from '@/types'
import { sortTestsNewestFirst } from '../utils/sort-tests-by-conducted'

interface DashboardTestMultiSelectProps {
  readonly availableTests: Test[]
  readonly isLoadingTests: boolean
}

/**
 * Multi-select of tests whose results power the dashboard. Selection drives the API request.
 */
export function DashboardTestMultiSelect({
  availableTests,
  isLoadingTests,
}: DashboardTestMultiSelectProps) {
  const selectedTestIds = useTestsDashboardStore((s) => s.selectedTestIds)
  const setSelectedTestIds = useTestsDashboardStore((s) => s.setSelectedTestIds)

  const [open, setOpen] = React.useState(false)

  const testsNewestFirst = React.useMemo(
    () => sortTestsNewestFirst(availableTests),
    [availableTests]
  )

  const selectedTestNames = React.useMemo(() => {
    return selectedTestIds
      .map((id) => availableTests.find((t) => t.id === id)?.name)
      .filter(Boolean) as string[]
  }, [selectedTestIds, availableTests])

  const toggleTest = (testId: string) => {
    const next = selectedTestIds.includes(testId)
      ? selectedTestIds.filter((id) => id !== testId)
      : [...selectedTestIds, testId]
    setSelectedTestIds(next)
  }

  const selectOrClearAll = () => {
    if (selectedTestIds.length === availableTests.length) {
      setSelectedTestIds([])
    } else {
      setSelectedTestIds(availableTests.map((t) => t.id))
    }
  }

  return (
    <div className='space-y-2'>
      <Label>Tests</Label>
      <Popover open={open} onOpenChange={setOpen}>
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
              onClick={selectOrClearAll}
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
                  onCheckedChange={() => toggleTest(test.id)}
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
  )
}
