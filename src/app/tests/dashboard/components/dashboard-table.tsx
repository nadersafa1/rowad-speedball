'use client'

import * as React from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  VisibilityState,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  POSITION_LABELS,
  AGGREGATION_LABELS,
  POSITION_SCORE_MAP,
  type AggregatedPlayerRow,
} from '../utils/aggregation'
import type {
  PositionKey,
  AggregationMode,
  DashboardTest,
} from '@/store/tests-dashboard-store'

// ========================================
// Props & types
// ========================================

interface DashboardTableProps {
  readonly rows: AggregatedPlayerRow[]
  readonly selectedTestIds: string[]
  readonly selectedPositions: PositionKey[]
  readonly aggregationMode: AggregationMode
  readonly tests: DashboardTest[]
  readonly isLoading: boolean
}

// ========================================
// Small presentational sub-components
// ========================================

function SortIcon({ sorted }: { readonly sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ArrowUp className='ml-1 h-3 w-3' />
  if (sorted === 'desc') return <ArrowDown className='ml-1 h-3 w-3' />
  return <ArrowUpDown className='ml-1 h-3 w-3' />
}

function SortableHeader({
  column,
  label,
}: {
  readonly column: {
    getIsSorted: () => false | 'asc' | 'desc'
    toggleSorting: (desc: boolean) => void
  }
  readonly label: string
}) {
  const sorted = column.getIsSorted()
  return (
    <Button
      variant='ghost'
      size='sm'
      className='-ml-3 h-8 text-xs'
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {label}
      <SortIcon sorted={sorted} />
    </Button>
  )
}

// ========================================
// Column label resolver
// ========================================

/**
 * Derives a human-readable label from a column ID.
 * Column IDs follow conventions: 'playerName', 'agg_leftHand', '{testId}_leftHand', etc.
 */
function getColumnLabel(
  id: string,
  tests: DashboardTest[],
  aggregationMode: AggregationMode,
): string {
  if (id === 'playerName') return 'Player'
  if (id === 'ageGroup') return 'Age Group'
  if (id === 'gender') return 'Gender'
  if (id === 'agg_total') return `${AGGREGATION_LABELS[aggregationMode]} Total`

  if (id.startsWith('agg_')) {
    const posKey = id.replace('agg_', '') as PositionKey
    return `${AGGREGATION_LABELS[aggregationMode]} ${POSITION_LABELS[posKey]}`
  }

  // Per-test columns use the format: {testId}_{position|total}
  const separatorIndex = id.indexOf('_')
  if (separatorIndex > 0) {
    const testId = id.substring(0, separatorIndex)
    const rest = id.substring(separatorIndex + 1)
    const testName = tests.find((t) => t.id === testId)?.name ?? 'Test'

    if (rest === 'total') return `${testName} Total`
    const posKey = rest as PositionKey
    if (POSITION_LABELS[posKey]) return `${testName} ${POSITION_LABELS[posKey]}`
  }

  return id
}

// ========================================
// Column builders (keep the columns memo focused)
// ========================================

function buildPlayerInfoColumns(): ColumnDef<AggregatedPlayerRow>[] {
  return [
    {
      accessorKey: 'playerName',
      header: ({ column }) => <SortableHeader column={column} label='Player' />,
      cell: ({ row }) => (
        <div className='font-medium'>{row.original.playerName}</div>
      ),
      size: 160,
    },
    {
      accessorKey: 'ageGroup',
      header: ({ column }) => (
        <SortableHeader column={column} label='Age Group' />
      ),
      size: 100,
    },
    {
      accessorKey: 'gender',
      header: ({ column }) => <SortableHeader column={column} label='Gender' />,
      cell: ({ getValue }) => (
        <span className='capitalize'>{getValue() as string}</span>
      ),
      size: 80,
    },
  ]
}

function buildPerTestColumns(
  sortedTestIds: string[],
  selectedPositions: PositionKey[],
  tests: DashboardTest[],
): ColumnDef<AggregatedPlayerRow>[] {
  const cols: ColumnDef<AggregatedPlayerRow>[] = []

  for (const testId of sortedTestIds) {
    const testName = tests.find((t) => t.id === testId)?.name ?? 'Unknown'

    for (const pos of selectedPositions) {
      const scoreKey = POSITION_SCORE_MAP[pos]
      cols.push({
        id: `${testId}_${pos}`,
        header: () => (
          <div className='text-center text-xs'>
            <div className='truncate max-w-[80px]' title={testName}>
              {testName}
            </div>
            <div className='text-muted-foreground'>{POSITION_LABELS[pos]}</div>
          </div>
        ),
        accessorFn: (row) => row.perTestScores[testId]?.[scoreKey] ?? null,
        cell: ({ getValue }) => {
          const val = getValue() as number | null
          return (
            <div className='text-center tabular-nums'>
              {val ?? <span className='text-muted-foreground'>-</span>}
            </div>
          )
        },
        size: 80,
      })
    }

    cols.push({
      id: `${testId}_total`,
      header: () => (
        <div className='text-center text-xs'>
          <div className='truncate max-w-[80px]' title={testName}>
            {testName}
          </div>
          <div className='text-muted-foreground font-semibold'>Total</div>
        </div>
      ),
      accessorFn: (row) => row.perTestScores[testId]?.totalScore ?? 0,
      cell: ({ getValue }) => {
        const val = getValue() as number
        return (
          <div className='text-center font-medium tabular-nums'>
            {val || <span className='text-muted-foreground'>-</span>}
          </div>
        )
      },
      size: 80,
    })
  }

  return cols
}

function buildAggregatedColumns(
  selectedPositions: PositionKey[],
  aggregationMode: AggregationMode,
): ColumnDef<AggregatedPlayerRow>[] {
  const aggLabel = AGGREGATION_LABELS[aggregationMode]
  const cols: ColumnDef<AggregatedPlayerRow>[] = []

  for (const pos of selectedPositions) {
    const scoreKey = POSITION_SCORE_MAP[pos]
    cols.push({
      id: `agg_${pos}`,
      header: ({ column }) => (
        <div className='text-center'>
          <SortableHeader
            column={column}
            label={`${aggLabel} ${POSITION_LABELS[pos]}`}
          />
        </div>
      ),
      accessorFn: (row) => row.aggregated[scoreKey],
      cell: ({ getValue }) => (
        <div className='text-center font-medium tabular-nums text-primary'>
          {getValue() as number}
        </div>
      ),
      size: 90,
    })
  }

  cols.push({
    id: 'agg_total',
    header: ({ column }) => (
      <div className='text-center'>
        <SortableHeader column={column} label={`${aggLabel} Total`} />
      </div>
    ),
    accessorFn: (row) => row.aggregated.totalScore,
    cell: ({ getValue }) => (
      <div className='text-center font-bold tabular-nums text-primary'>
        {getValue() as number}
      </div>
    ),
    size: 100,
  })

  return cols
}

// ========================================
// Main component
// ========================================

export default function DashboardTable({
  rows,
  selectedTestIds,
  selectedPositions,
  aggregationMode,
  tests,
  isLoading,
}: DashboardTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})

  // Sort test columns chronologically (oldest first) for consistent display
  const sortedTestIds = React.useMemo(() => {
    return [...selectedTestIds].sort((a, b) => {
      const testA = tests.find((t) => t.id === a)
      const testB = tests.find((t) => t.id === b)
      if (!testA || !testB) return 0
      return (
        new Date(testA.dateConducted).getTime() -
        new Date(testB.dateConducted).getTime()
      )
    })
  }, [selectedTestIds, tests])

  const columns = React.useMemo<ColumnDef<AggregatedPlayerRow>[]>(() => {
    const infoCols = buildPlayerInfoColumns()
    const testCols = buildPerTestColumns(
      sortedTestIds,
      selectedPositions,
      tests,
    )
    const aggCols =
      sortedTestIds.length > 0
        ? buildAggregatedColumns(selectedPositions, aggregationMode)
        : []

    return [...infoCols, ...testCols, ...aggCols]
  }, [sortedTestIds, selectedPositions, aggregationMode, tests])

  // Reset column visibility when test/position selection changes.
  // Per-test detail columns default to hidden; users toggle them via the Columns menu.
  React.useEffect(() => {
    const hidden: VisibilityState = {}
    for (const testId of sortedTestIds) {
      for (const pos of selectedPositions) {
        hidden[`${testId}_${pos}`] = false
      }
      hidden[`${testId}_total`] = false
    }
    setColumnVisibility(hidden)
  }, [sortedTestIds, selectedPositions])

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.playerId,
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='text-lg'>Player Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={`skel-${i}`} className='h-10 w-full' />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (selectedTestIds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='text-lg'>Player Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-center py-8'>
            Select at least one test to view player scores.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-lg'>
            Player Scores
            {rows.length > 0 && (
              <span className='text-sm font-normal text-muted-foreground ml-2'>
                ({rows.length} players)
              </span>
            )}
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='sm' className='gap-1'>
                Columns
                <ChevronDown className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='end'
              className='max-h-80 overflow-y-auto'
            >
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {getColumnLabel(column.id, tests, aggregationMode)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className='rounded-md border overflow-x-auto'>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className='text-center py-8 text-muted-foreground'
                  >
                    No results found for the selected tests.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
