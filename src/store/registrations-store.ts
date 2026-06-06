// Registrations Store - Single responsibility: Registrations state management
import { create } from 'zustand'
import { apiClient } from '@/lib/api-client'
import type { Registration } from '@/types'
import type { PaginatedResponse } from '@/types/api/pagination'

interface RegistrationsState {
  registrations: Registration[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  pagination: {
    page: number
    limit: number
    totalItems: number
    totalPages: number
  }

  // Actions
  fetchRegistrations: (eventId?: string, groupId?: string) => Promise<void>
  loadMoreRegistrations: (eventId?: string, groupId?: string) => Promise<void>
  createRegistration: (data: {
    eventId: string
    playerIds: string[]
    players?: { playerId: string; position?: string | null; order?: number }[]
  }) => Promise<void>
  bulkCreateRegistrations: (data: {
    eventId: string
    playerIds: string[]
  }) => Promise<{
    count: number
    errors: { playerId: string; playerName: string; error: string }[]
  }>
  updateRegistration: (id: string, data: any) => Promise<void>
  deleteRegistration: (id: string) => Promise<void>
  clearError: () => void
}

const DEFAULT_LIMIT = 100

export const useRegistrationsStore = create<RegistrationsState>((set, get) => ({
  registrations: [],
  isLoading: false,
  isLoadingMore: false,
  error: null,
  pagination: {
    page: 1,
    limit: DEFAULT_LIMIT,
    totalItems: 0,
    totalPages: 0,
  },

  fetchRegistrations: async (eventId?: string, groupId?: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.getRegistrations(
        eventId,
        groupId,
        eventId || groupId ? { page: 1, limit: DEFAULT_LIMIT } : undefined
      )
      set({
        registrations: response.data || [],
        pagination: {
          page: response.page,
          limit: response.limit,
          totalItems: response.totalItems,
          totalPages: response.totalPages,
        },
        isLoading: false,
      })
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch registrations',
        isLoading: false,
      })
    }
  },

  loadMoreRegistrations: async (eventId?: string, groupId?: string) => {
    const { pagination } = get()
    if (pagination.page >= pagination.totalPages) return

    set({ isLoadingMore: true, error: null })
    try {
      const nextPage = pagination.page + 1
      const response = await apiClient.getRegistrations(
        eventId,
        groupId,
        eventId || groupId
          ? { page: nextPage, limit: DEFAULT_LIMIT }
          : undefined
      )

      set((state) => ({
        registrations: [...state.registrations, ...(response.data || [])],
        pagination: {
          page: response.page,
          limit: response.limit,
          totalItems: response.totalItems,
          totalPages: response.totalPages,
        },
        isLoadingMore: false,
      }))
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load more registrations',
        isLoadingMore: false,
      })
    }
  },

  createRegistration: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const newRegistration = (await apiClient.createRegistration(
        data
      )) as Registration
      set((state) => ({
        registrations: [...state.registrations, newRegistration],
        pagination: {
          ...state.pagination,
          totalItems: state.pagination.totalItems + 1,
          totalPages: Math.ceil(
            (state.pagination.totalItems + 1) / state.pagination.limit
          ),
        },
        isLoading: false,
      }))
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create registration',
        isLoading: false,
      })
      throw error
    }
  },

  bulkCreateRegistrations: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const result = await apiClient.bulkCreateRegistrations(data)
      set((state) => ({
        pagination: {
          ...state.pagination,
          totalItems: state.pagination.totalItems + result.count,
          totalPages: Math.ceil(
            (state.pagination.totalItems + result.count) / state.pagination.limit
          ),
        },
        isLoading: false,
      }))
      return result
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create bulk registrations',
        isLoading: false,
      })
      throw error
    }
  },

  updateRegistration: async (id: string, data: any) => {
    set({ isLoading: true, error: null })
    try {
      const updatedRegistration = (await apiClient.updateRegistration(
        id,
        data
      )) as Registration
      set((state) => ({
        registrations: state.registrations.map((r) =>
          r.id === id ? updatedRegistration : r
        ),
        isLoading: false,
      }))
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update registration',
        isLoading: false,
      })
      throw error
    }
  },

  deleteRegistration: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.deleteRegistration(id)
      set((state) => {
        const wasInCurrentPage = state.registrations.some((r) => r.id === id)
        return {
          registrations: state.registrations.filter((r) => r.id !== id),
          pagination: wasInCurrentPage
            ? {
                ...state.pagination,
                totalItems: Math.max(0, state.pagination.totalItems - 1),
                totalPages: Math.ceil(
                  Math.max(0, state.pagination.totalItems - 1) /
                    state.pagination.limit
                ),
              }
            : state.pagination,
          isLoading: false,
        }
      })
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete registration',
        isLoading: false,
      })
      throw error
    }
  },

  clearError: () => set({ error: null }),
}))
