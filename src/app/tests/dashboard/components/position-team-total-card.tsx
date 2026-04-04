'use client'

import * as React from 'react'
import { Calculator } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  useTestsDashboardStore,
  ALL_POSITIONS,
} from '@/store/tests-dashboard-store'
import type { PositionKey } from '@/store/tests-dashboard-store'
import {
  computeAggregatedRows,
  POSITION_LABELS,
  POSITION_SCORE_MAP,
  type AggregatedPlayerRow,
} from '../utils/aggregation'

const NONE_VALUE = '__none__'

function scoreForPosition(row: AggregatedPlayerRow, pos: PositionKey): number {
  return row.aggregated[POSITION_SCORE_MAP[pos]]
}

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export default function PositionTeamTotalCard() {
  const {
    players,
    selectedTestIds,
    selectedPositions,
    aggregationMode,
    weights,
  } = useTestsDashboardStore()

  const [pickByPosition, setPickByPosition] = React.useState<
    Partial<Record<PositionKey, string>>
  >({})

  const aggregatedRows = React.useMemo(
    () =>
      computeAggregatedRows(
        players,
        selectedTestIds,
        selectedPositions,
        aggregationMode,
        weights,
        ''
      ),
    [
      players,
      selectedTestIds,
      selectedPositions,
      aggregationMode,
      weights,
    ]
  )

  const rowById = React.useMemo(() => {
    const m = new Map<string, AggregatedPlayerRow>()
    for (const row of aggregatedRows) {
      m.set(row.playerId, row)
    }
    return m
  }, [aggregatedRows])

  React.useEffect(() => {
    const valid = new Set(aggregatedRows.map((r) => r.playerId))
    setPickByPosition((prev) => {
      let changed = false
      const next: Partial<Record<PositionKey, string>> = { ...prev }
      for (const pos of ALL_POSITIONS) {
        const id = next[pos]
        if (id && !valid.has(id)) {
          delete next[pos]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [aggregatedRows])

  const sortedRows = React.useMemo(() => {
    return [...aggregatedRows].sort((a, b) =>
      a.playerName.localeCompare(b.playerName)
    )
  }, [aggregatedRows])

  const total = React.useMemo(() => {
    return ALL_POSITIONS.reduce((sum, pos) => {
      const id = pickByPosition[pos]
      if (!id) return sum
      const row = rowById.get(id)
      if (!row) return sum
      return sum + scoreForPosition(row, pos)
    }, 0)
  }, [pickByPosition, rowById])

  const allPicked = ALL_POSITIONS.every((pos) => Boolean(pickByPosition[pos]))

  const handlePositionChange = React.useCallback(
    (pos: PositionKey, value: string) => {
      setPickByPosition((prev) => {
        const next = { ...prev }
        if (value === NONE_VALUE) {
          delete next[pos]
        } else {
          next[pos] = value
        }
        return next
      })
    },
    []
  )

  const idsUsedElsewhere = React.useCallback(
    (currentPos: PositionKey) => {
      const s = new Set<string>()
      for (const p of ALL_POSITIONS) {
        if (p === currentPos) continue
        const id = pickByPosition[p]
        if (id) s.add(id)
      }
      return s
    },
    [pickByPosition]
  )

  if (selectedTestIds.length === 0) {
    return (
      <Card>
        <CardHeader className='pb-4'>
          <CardTitle className='flex items-center gap-2 text-lg'>
            <Calculator className='h-5 w-5' />
            Position team total
          </CardTitle>
          <CardDescription>
            Select at least one test above to pick four players (one per
            position) and sum their scores. Runs entirely in the browser.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className='pb-4'>
        <CardTitle className='flex items-center gap-2 text-lg'>
          <Calculator className='h-5 w-5' />
          Position team total
        </CardTitle>
        <CardDescription>
          Choose a different player for each position. Each row uses that
          player&apos;s aggregated score for that position (same logic as the
          table). The total updates instantly on the client.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
          {ALL_POSITIONS.map((pos) => {
            const excluded = idsUsedElsewhere(pos)
            const pickedId = pickByPosition[pos]
            const value = pickedId ?? NONE_VALUE

            return (
              <div key={pos} className='space-y-2'>
                <Label>{POSITION_LABELS[pos]}</Label>
                <Select
                  value={value}
                  onValueChange={(v) => handlePositionChange(pos, v)}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue
                      placeholder={`Select player for ${POSITION_LABELS[pos]}…`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>
                      <span className='text-muted-foreground'>None</span>
                    </SelectItem>
                    {sortedRows
                      .filter((row) => !excluded.has(row.playerId))
                      .map((row) => {
                        const n = scoreForPosition(row, pos)
                        return (
                          <SelectItem key={row.playerId} value={row.playerId}>
                            <span className='tabular-nums'>
                              {row.playerName} — {formatScore(n)}
                            </span>
                          </SelectItem>
                        )
                      })}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </div>

        <div className='space-y-2 pt-2 border-t'>
          <Label htmlFor='position-team-total'>Total (4 positions)</Label>
          <Input
            id='position-team-total'
            readOnly
            className='font-semibold tabular-nums bg-muted/50'
            value={allPicked ? formatScore(total) : '—'}
          />
          {!allPicked && (
            <p className='text-xs text-muted-foreground'>
              Pick one player per position to see the combined total.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
