'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTestsDashboardStore } from '@/store/tests-dashboard-store'
import type { Test } from '@/types'

function clampWeight(value: number) {
  return Math.max(0, Math.min(100, value))
}

/**
 * Per-test weight inputs when aggregation mode is “weighted”. Weights are client-only until scores are combined.
 */
export function DashboardTestWeightsSection({
  selectedTestsOldestFirst,
}: Readonly<{
  selectedTestsOldestFirst: Test[]
}>) {
  const weights = useTestsDashboardStore((s) => s.weights)
  const setWeight = useTestsDashboardStore((s) => s.setWeight)

  const totalWeight = selectedTestsOldestFirst.reduce(
    (sum, test) => sum + (weights[test.id] ?? 0),
    0
  )
  const weightOk = Math.abs(totalWeight - 100) < 0.01

  return (
    <div className='space-y-3 pt-3 border-t'>
      <div className='flex items-center justify-between'>
        <Label className='text-sm font-medium'>Test Weights</Label>
        <span
          className={`text-xs font-medium ${weightOk ? 'text-green-600' : 'text-amber-600'}`}
        >
          Total:{' '}
          {Number.isInteger(totalWeight) ? totalWeight : totalWeight.toFixed(2)}%{' '}
          {!weightOk && '(should be 100%)'}
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
              <Label
                htmlFor={`weight-${test.id}`}
                className='text-xs text-muted-foreground shrink-0'
              >
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
                    Number.isNaN(val) ? 0 : clampWeight(val)
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
  )
}
