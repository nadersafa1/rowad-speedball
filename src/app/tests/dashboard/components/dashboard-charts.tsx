'use client'

import * as React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { AggregatedPlayerRow } from '../utils/aggregation'
import {
  POSITION_LABELS,
  AGGREGATION_LABELS,
  POSITION_SCORE_MAP,
  POSITION_COLORS,
} from '../utils/aggregation'
import type {
  PositionKey,
  AggregationMode,
  DashboardTest,
} from '@/store/tests-dashboard-store'

// ========================================
// Props & constants
// ========================================

interface DashboardChartsProps {
  readonly rows: AggregatedPlayerRow[]
  readonly selectedTestIds: string[]
  readonly selectedPositions: PositionKey[]
  readonly aggregationMode: AggregationMode
  readonly tests: DashboardTest[]
}

const TEST_COLORS = [
  '#22c55e',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
]

const MAX_TOP_PLAYERS = 15
const NAME_MAX_LEN_MOBILE = 10
const NAME_MAX_LEN_DESKTOP = 14

// ========================================
// Hooks
// ========================================

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const mq = globalThis.matchMedia('(max-width: 640px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

// ========================================
// Chart data builders
// ========================================

function truncateName(name: string, maxLen: number): string {
  return name.length > maxLen ? name.substring(0, maxLen) + '…' : name
}

// ========================================
// Sub-components
// ========================================

function TopPlayersChart({
  rows,
  selectedPositions,
  aggregationMode,
  isMobile,
}: {
  readonly rows: AggregatedPlayerRow[]
  readonly selectedPositions: PositionKey[]
  readonly aggregationMode: AggregationMode
  readonly isMobile: boolean
}) {
  const aggLabel = AGGREGATION_LABELS[aggregationMode]

  const topPlayersData = React.useMemo(() => {
    const maxLen = isMobile ? NAME_MAX_LEN_MOBILE : NAME_MAX_LEN_DESKTOP
    return [...rows]
      .sort((a, b) => b.aggregated.totalScore - a.aggregated.totalScore)
      .slice(0, MAX_TOP_PLAYERS)
      .map((row) => ({
        name: truncateName(row.playerName, maxLen),
        fullName: row.playerName,
        ...Object.fromEntries(
          selectedPositions.map((pos) => [
            POSITION_LABELS[pos],
            row.aggregated[POSITION_SCORE_MAP[pos]],
          ])
        ),
        total: row.aggregated.totalScore,
      }))
  }, [rows, selectedPositions, isMobile])

  const playerCount = Math.min(topPlayersData.length, MAX_TOP_PLAYERS)
  const chartHeight = isMobile
    ? Math.max(300, playerCount * 40)
    : Math.max(350, playerCount * 28)

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-lg'>
          Top Players by {aggLabel} Score
        </CardTitle>
        <CardDescription>
          {aggLabel} scores broken down by position (top{' '}
          {Math.min(rows.length, MAX_TOP_PLAYERS)} players)
        </CardDescription>
      </CardHeader>
      <CardContent className='px-2 sm:px-6'>
        <ResponsiveContainer width='100%' height={chartHeight}>
          <BarChart
            data={topPlayersData}
            layout='vertical'
            margin={
              isMobile
                ? { left: 0, right: 8, top: 5, bottom: 5 }
                : { left: 10, right: 20, top: 5, bottom: 5 }
            }
          >
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis type='number' tick={{ fontSize: isMobile ? 10 : 12 }} />
            <YAxis
              dataKey='name'
              type='category'
              width={isMobile ? 75 : 100}
              tick={{ fontSize: isMobile ? 10 : 12 }}
            />
            <Tooltip
              formatter={(value, name) => [value, name]}
              labelFormatter={(label, payload) => {
                const item = payload?.[0]?.payload as
                  | { fullName?: string }
                  | undefined
                return item?.fullName ?? label
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: isMobile ? 11 : 14, paddingTop: 8 }}
            />
            {selectedPositions.map((pos) => (
              <Bar
                key={pos}
                dataKey={POSITION_LABELS[pos]}
                stackId='score'
                fill={POSITION_COLORS[pos]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function PositionBreakdownChart({
  rows,
  selectedTestIds,
  selectedPositions,
  tests,
  isMobile,
}: {
  readonly rows: AggregatedPlayerRow[]
  readonly selectedTestIds: string[]
  readonly selectedPositions: PositionKey[]
  readonly tests: DashboardTest[]
  readonly isMobile: boolean
}) {
  const positionBreakdownData = React.useMemo(() => {
    return selectedPositions.map((pos) => {
      const scoreKey = POSITION_SCORE_MAP[pos]
      const entry: Record<string, string | number> = {
        position: POSITION_LABELS[pos],
      }

      for (const testId of selectedTestIds) {
        const testName = tests.find((t) => t.id === testId)?.name ?? 'Unknown'
        const playerScores = rows
          .map((r) => r.perTestScores[testId]?.[scoreKey])
          .filter((s): s is number => s !== undefined)

        entry[testName] =
          playerScores.length > 0
            ? Math.round(
                playerScores.reduce((a, b) => a + b, 0) / playerScores.length
              )
            : 0
      }

      return entry
    })
  }, [selectedPositions, selectedTestIds, tests, rows])

  const chartHeight = isMobile
    ? 280 + selectedTestIds.length * 24
    : 350

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-lg'>
          Average Score by Position Across Tests
        </CardTitle>
        <CardDescription>
          Comparing average player scores per position across selected tests
        </CardDescription>
      </CardHeader>
      <CardContent className='px-2 sm:px-6'>
        <ResponsiveContainer width='100%' height={chartHeight}>
          <BarChart
            data={positionBreakdownData}
            margin={
              isMobile
                ? { left: 0, right: 8, top: 5, bottom: 5 }
                : { left: 0, right: 20, top: 5, bottom: 5 }
            }
          >
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis
              dataKey='position'
              tick={{ fontSize: isMobile ? 10 : 12 }}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: isMobile ? 10 : 12 }}
              width={isMobile ? 30 : 40}
            />
            <Tooltip />
            <Legend
              layout={isMobile ? 'vertical' : 'horizontal'}
              align='center'
              verticalAlign='bottom'
              wrapperStyle={{
                fontSize: isMobile ? 11 : 14,
                paddingTop: 12,
              }}
            />
            {selectedTestIds.map((testId, idx) => {
              const test = tests.find((t) => t.id === testId)
              return (
                <Bar
                  key={testId}
                  dataKey={test?.name ?? 'Unknown'}
                  fill={TEST_COLORS[idx % TEST_COLORS.length]}
                />
              )
            })}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ========================================
// Main component
// ========================================

export default function DashboardCharts({
  rows,
  selectedTestIds,
  selectedPositions,
  aggregationMode,
  tests,
}: DashboardChartsProps) {
  const isMobile = useIsMobile()

  if (selectedTestIds.length === 0 || rows.length === 0) {
    return null
  }

  return (
    <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
      <TopPlayersChart
        rows={rows}
        selectedPositions={selectedPositions}
        aggregationMode={aggregationMode}
        isMobile={isMobile}
      />

      {selectedTestIds.length > 1 && (
        <PositionBreakdownChart
          rows={rows}
          selectedTestIds={selectedTestIds}
          selectedPositions={selectedPositions}
          tests={tests}
          isMobile={isMobile}
        />
      )}
    </div>
  )
}
