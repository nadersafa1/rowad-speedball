import { UserRoles, UsersSortBy } from '@/app/admin/users/types'
import { User } from '@/db/schema'
import {
  standardPaginationSchema,
  standardSortSchema,
  standardTextSearchSchema,
} from '@/lib/api-helpers/query-builders'
import { z } from 'zod'

export const usersQuerySchema = z
  .object({
    ...standardTextSearchSchema.shape,
    ...standardPaginationSchema.shape,
    ...standardSortSchema.shape,
    role: z.enum(Object.values(UserRoles)).optional(),
    sortBy: z.enum(Object.values(UsersSortBy)).optional(),
    unassigned: z
      .string()
      .optional()
      .transform((val) => val === 'true'),
  })
  .strict()

export type UsersQuery = z.infer<typeof usersQuerySchema>

export const updateUserFederationRoleSchema = z
  .object({
    role: z.enum(['federation-admin', 'federation-editor']).nullable(),
    federationId: z.uuid().nullable(),
  })
  .refine(
    (data) =>
      (data.role === null && data.federationId === null) ||
      (data.role !== null && data.federationId !== null),
    {
      message: 'Role and federationId must both be set or both be null',
    },
  )

export type UpdateUserFederationRoleInput = z.infer<
  typeof updateUserFederationRoleSchema
>

export interface UsersGetData extends User {
  federation?: {
    id: string
    name: string
  } | null
  organization?: {
    id: string
    name: string
    role: string
  } | null
}
