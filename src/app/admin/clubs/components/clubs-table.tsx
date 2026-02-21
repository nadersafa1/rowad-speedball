'use client'

import * as React from 'react'
import {
  getCoreRowModel,
  useReactTable,
  VisibilityState,
} from '@tanstack/react-table'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { apiClient } from '@/lib/api-client'
import { OrganizationForm } from '@/components/organizations/organization-form'

import {
  BaseDataTable,
  PaginationConfig,
  TableControls,
  TablePagination,
  useTableExport,
  useTableSorting,
  useTableHandlers,
} from '@/lib/table-core'
import { useRoles } from '@/hooks/authorization/use-roles'
import { createClubsColumns } from '@/config/tables/columns/clubs-columns'
import {
  clubsTableConfig,
  type ClubWithCount,
  type ClubsSortBy,
} from '@/config/tables/clubs.config'
import { SortOrder } from '@/types'

export interface ClubsTableProps {
  clubs: ClubWithCount[]
  pagination: PaginationConfig
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onSearchChange?: (search: string) => void
  searchValue?: string
  sortBy?: ClubsSortBy
  sortOrder?: SortOrder
  onSortingChange?: (sortBy?: ClubsSortBy, sortOrder?: SortOrder) => void
  isLoading?: boolean
  onRefetch?: () => void
}

export default function ClubsTable({
  clubs,
  pagination,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  searchValue = '',
  sortBy,
  sortOrder,
  onSortingChange,
  isLoading = false,
  onRefetch,
}: ClubsTableProps) {
  const { isSystemAdmin } = useRoles()

  // Permission checks
  const canEdit = isSystemAdmin
  const canDelete = isSystemAdmin

  // Column visibility state
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({
      createdAt: false,
    })

  // Use table sorting hook
  const { handleSort } = useTableSorting<ClubWithCount, ClubsSortBy>({
    sortBy,
    sortOrder,
    onSortingChange: (newSortBy?: ClubsSortBy, newSortOrder?: SortOrder) => {
      onSortingChange?.(newSortBy, newSortOrder)
    },
  })

  // Use table handlers hook
  const {
    editingItem: editClub,
    editDialogOpen,
    setEditDialogOpen,
    handleEdit,
    handleDelete,
    handleEditSuccess,
    handleEditCancel,
    deletingItem,
    handleDeleteConfirm,
    deleteDialogOpen,
    isDeleting,
    handleDeleteCancel,
    setDeleteDialogOpen,
  } = useTableHandlers<ClubWithCount>({
    deleteItem: async (id: string) => {
      await apiClient.deleteOrganization(id)
      toast.success('Club deleted successfully')
    },
    onRefetch: () => {
      onRefetch?.()
    },
  })

  // Create columns
  const columns = React.useMemo(
    () =>
      createClubsColumns({
        canEdit,
        canDelete,
        onEdit: handleEdit,
        onDelete: handleDelete,
        sortBy,
        sortOrder,
        onSort: (columnId: string) => handleSort(columnId as ClubsSortBy),
      }),
    [
      canEdit,
      canDelete,
      handleEdit,
      handleDelete,
      sortBy,
      sortOrder,
      handleSort,
    ]
  )

  // Initialize table for column visibility control
  const table = useReactTable({
    data: clubs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
  })

  // Column label mapping helper
  const getColumnLabel = React.useCallback((columnId: string) => {
    const labels: Record<string, string> = {
      name: 'Name',
      slug: 'Slug',
      createdAt: 'Created',
    }
    return labels[columnId] || columnId
  }, [])

  // Export hook
  const { handleExport, isExporting } = useTableExport<ClubWithCount>({
    data: clubs,
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'slug', label: 'Slug' },
      { key: 'createdAt', label: 'Created At' },
    ],
    filename: 'clubs',
    enabled: clubsTableConfig.features.export,
  })

  return (
    <div className='w-full space-y-4'>
      {/* Controls */}
      <TableControls<ClubWithCount>
        searchValue={searchValue}
        onSearchChange={onSearchChange ?? (() => {})}
        searchPlaceholder='Search clubs...'
        table={table}
        getColumnLabel={getColumnLabel}
        exportEnabled={clubsTableConfig.features.export}
        onExport={handleExport}
        isExporting={isExporting}
      />

      {/* Table */}
      <BaseDataTable
        data={clubs}
        columns={columns}
        pagination={pagination}
        isLoading={isLoading}
        enableNavigation={clubsTableConfig.features.navigation}
        emptyMessage='No clubs found.'
        routingBasePath={clubsTableConfig.routing.basePath}
        routingDetailPath={clubsTableConfig.routing.detailPath}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        enableRowSelection={clubsTableConfig.features.selection}
      />

      {/* Pagination */}
      {clubsTableConfig.features.pagination && (
        <TablePagination
          pagination={pagination}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          pageSizeOptions={clubsTableConfig.pageSizeOptions}
          showPageSizeSelector={true}
          showPageNumbers={true}
        />
      )}

      {/* Edit Dialog */}
      {editClub && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Club</DialogTitle>
              <DialogDescription>
                Update the club name and slug
              </DialogDescription>
            </DialogHeader>
            <OrganizationForm
              organization={editClub}
              onSuccess={handleEditSuccess}
              onCancel={handleEditCancel}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Club</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className='font-semibold'>
                {deletingItem?.name || 'this club'}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleDeleteCancel}
              disabled={isDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? 'Deleting...' : 'Delete Club'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
