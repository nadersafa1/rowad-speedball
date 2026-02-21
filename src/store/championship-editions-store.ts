// Championship Editions Store - Single responsibility: Championship editions state management
import { create } from 'zustand'
import { apiClient } from '@/lib/api-client'
import type { ChampionshipEditionWithRelations } from '@/components/championship-editions/championship-editions-table-types'

interface ChampionshipEditionsFilters {
  q?: string
  championshipId?: string
  status?: 'draft' | 'published' | 'archived'
  sortBy?: 'status' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
  page?: number
  limit?: number
}

interface ChampionshipEditionsState {
  editions: ChampionshipEditionWithRelations[]
  selectedEdition: ChampionshipEditionWithRelations | null
  isLoading: boolean
  error: string | null
  pagination: {
    page: number
    limit: number
    totalItems: number
    totalPages: number
  }

  // Actions
  fetchEditions: (filters?: ChampionshipEditionsFilters) => Promise<void>
  fetchEdition: (id: string) => Promise<void>
  createEdition: (data: any) => Promise<void>
  updateEdition: (id: string, data: any) => Promise<void>
  deleteEdition: (id: string) => Promise<void>
  clearError: () => void
  clearSelectedEdition: () => void
}

export const useChampionshipEditionsStore = create<ChampionshipEditionsState>(
  (set, get) => ({
    editions: [],
    selectedEdition: null,
    isLoading: false,
    error: null,
    pagination: {
      page: 1,
      limit: 10,
      totalItems: 0,
      totalPages: 0,
    },

    fetchEditions: async (filters = {}) => {
      set({ isLoading: true, error: null })

      try {
        const params = {
          q: filters.q,
          championshipId: filters.championshipId,
          status: filters.status,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
          page: filters.page,
          limit: filters.limit,
        }

        const response = await apiClient.getChampionshipEditions(params)

        set({
          editions: response.data,
          pagination: {
            page: response.page,
            limit: response.limit,
            totalItems: response.totalItems,
            totalPages: response.totalPages,
          },
          isLoading: false,
        })
      } catch (error: any) {
        set({
          error: error.message || 'Failed to fetch championship editions',
          isLoading: false,
        })
        throw error
      }
    },

    fetchEdition: async (id: string) => {
      set({ isLoading: true, error: null })

      try {
        const edition = await apiClient.getChampionshipEdition(id)
        set({
          selectedEdition: edition as ChampionshipEditionWithRelations,
          isLoading: false,
        })
      } catch (error: any) {
        set({
          error: error.message || 'Failed to fetch championship edition',
          isLoading: false,
        })
        throw error
      }
    },

    createEdition: async (data: any) => {
      set({ isLoading: true, error: null })

      try {
        const newEdition = (await apiClient.createChampionshipEdition(
          data,
        )) as ChampionshipEditionWithRelations
        set((state) => ({
          editions: [...state.editions, newEdition],
          isLoading: false,
        }))
      } catch (error: any) {
        set({
          error: error.message || 'Failed to create championship edition',
          isLoading: false,
        })
        throw error
      }
    },

    updateEdition: async (id: string, data: any) => {
      set({ isLoading: true, error: null })

      try {
        const updatedEdition = (await apiClient.updateChampionshipEdition(
          id,
          data,
        )) as ChampionshipEditionWithRelations
        set((state) => ({
          editions: state.editions.map((e) =>
            e.id === id ? updatedEdition : e,
          ),
          selectedEdition:
            state.selectedEdition?.id === id
              ? updatedEdition
              : state.selectedEdition,
          isLoading: false,
        }))
      } catch (error: any) {
        set({
          error: error.message || 'Failed to update championship edition',
          isLoading: false,
        })
        throw error
      }
    },

    deleteEdition: async (id: string) => {
      set({ isLoading: true, error: null })

      try {
        await apiClient.deleteChampionshipEdition(id)
        set((state) => ({
          editions: state.editions.filter((edition) => edition.id !== id),
          selectedEdition:
            state.selectedEdition?.id === id ? null : state.selectedEdition,
          isLoading: false,
        }))
      } catch (error: any) {
        set({
          error: error.message || 'Failed to delete championship edition',
          isLoading: false,
        })
        throw error
      }
    },

    clearError: () => set({ error: null }),
    clearSelectedEdition: () => set({ selectedEdition: null }),
  }),
)
