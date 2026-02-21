/**
 * Clubs Table Configuration
 * Defines routing, features, and behavior for the clubs table
 */

import { TableConfig } from '@/lib/table-core'
import { SortOrder } from '@/types'
import type { Organization } from 'better-auth/plugins'

export type ClubWithCount = Organization

export interface ClubsTableFilters extends Record<string, unknown> {
  q?: string
}

export type ClubsSortBy = 'name' | 'slug' | 'createdAt'

export const clubsTableConfig: TableConfig<ClubWithCount, ClubsTableFilters> = {
  entity: 'club',
  entityPlural: 'clubs',
  routing: {
    basePath: '/admin/clubs',
    detailPath: (id: string) => `/admin/clubs/${id}`,
  },
  features: {
    navigation: true,
    search: true,
    filters: false,
    sorting: true,
    pagination: true,
    selection: false,
    export: true,
    columnVisibility: true,
  },
  defaultSort: {
    sortBy: 'createdAt',
    sortOrder: SortOrder.DESC,
  },
  defaultPageSize: 25,
  pageSizeOptions: [10, 25, 50, 100],
}
