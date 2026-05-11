'use client'

import * as React from 'react'
import { Table } from '@/components/ui/table'
import { flexRender } from '@tanstack/react-table'
import {
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Dialog } from '@/components/ui/dialog'
import { useOrganizationContext } from '@/hooks/authorization/use-organization-context'
import { createColumns } from './results-table-columns'
import { ResultsTableControls } from './results-table-controls'
import { ResultsTablePagination } from './results-table-pagination'
import { ResultsTableActions } from './results-table-actions'
import { useResultsTableHandlers, useResultsTable } from './results-table-hooks'
import { ResultsTableProps, ResultWithPlayer } from './results-table-types'
import ResultsForm from '@/components/results/results-form'

const ResultsTable = ({
  results,
  pagination,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  searchValue = '',
  gender,
  ageGroup,
  yearOfBirth,
  onGenderChange,
  onAgeGroupChange,
  onYearOfBirthChange,
  sortBy,
  sortOrder,
  onSortingChange,
  isLoading = false,
  onRefetch,
}: ResultsTableProps) => {
  const { context } = useOrganizationContext()
  const { isSystemAdmin, isAdmin, isOwner, isCoach } = context

  // Calculate permissions based on backend authorization logic:
  // Can Edit: System Admin OR Org Admin OR Org Owner OR Org Coach
  // Can Delete: System Admin OR Org Admin OR Org Owner OR Org Coach
  const canEdit = isSystemAdmin || isAdmin || isOwner || isCoach
  const canDelete = isSystemAdmin || isAdmin || isOwner || isCoach

  const {
    editResult,
    editDialogOpen,
    setEditDialogOpen,
    setEditResult,
    handleEdit,
    handleDelete,
    handleEditSuccess,
    handleSort,
  } = useResultsTableHandlers({
    onRefetch,
    onSortingChange,
    sortBy,
    sortOrder,
  })

  const baseColumns = React.useMemo(
    () =>
      createColumns(
        isSystemAdmin,
        handleEdit,
        handleDelete,
        sortBy,
        sortOrder,
        handleSort,
        (pagination.page - 1) * pagination.limit + 1
      ),
    [
      isSystemAdmin,
      handleEdit,
      handleDelete,
      sortBy,
      sortOrder,
      handleSort,
      pagination,
    ]
  )

  // Add actions column if user can edit or delete
  const columns = React.useMemo(() => {
    if (!canEdit && !canDelete) return baseColumns
    return [
      ...baseColumns,
      {
        id: 'actions',
        enableHiding: false,
        header: () => <div className='text-right'>Actions</div>,
        cell: ({ row }: { row: any }) => (
          <div className='text-right'>
            <ResultsTableActions
              result={row.original}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </div>
        ),
      },
    ]
  }, [baseColumns, canEdit, canDelete, handleEdit, handleDelete])

  const { table } = useResultsTable({
    results,
    columns,
    totalPages: pagination.totalPages,
  })

  const handleCancel = () => {
    setEditDialogOpen(false)
    setEditResult(null)
  }

  return (
    <div className='w-full space-y-4'>
      <ResultsTableControls
        table={table}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        gender={gender}
        ageGroup={ageGroup}
        yearOfBirth={yearOfBirth}
        onGenderChange={onGenderChange}
        onAgeGroupChange={onAgeGroupChange}
        onYearOfBirthChange={onYearOfBirthChange}
      />
      <div className='rounded-md border overflow-x-auto'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className='whitespace-nowrap px-2 sm:px-4'
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          {isLoading ? (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center px-2 sm:px-4'
                >
                  Loading...
                </TableCell>
              </TableRow>
            </TableBody>
          ) : !table.getRowModel().rows?.length ? (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-32 text-center px-2 sm:px-4'
                >
                  <div className='flex flex-col items-center justify-center gap-2 py-4'>
                    <p className='text-lg font-medium text-muted-foreground'>
                      No results found
                    </p>
                    <p className='text-sm text-muted-foreground'>
                      {searchValue
                        ? 'Try adjusting your search terms or filters.'
                        : 'No results match the current filters.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className='px-2 sm:px-4 whitespace-nowrap'
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      </div>
      <ResultsTablePagination
        pagination={pagination}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        isLoading={isLoading}
      />
      {editResult && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <ResultsForm
            result={editResult}
            preselectedTestId={editResult.testId}
            onSuccess={handleEditSuccess}
            onCancel={handleCancel}
          />
        </Dialog>
      )}
    </div>
  )
}

export default ResultsTable
