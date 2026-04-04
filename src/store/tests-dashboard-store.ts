import { create } from 'zustand'
import { apiClient } from '@/lib/api-client'
export type {
  DashboardPlayer,
  DashboardPlayerResult,
  DashboardTest,
} from '@/types/api/results.schemas'
import type {
  DashboardPlayer,
  DashboardTest,
} from '@/types/api/results.schemas'

export type PositionKey = 'leftHand' | 'rightHand' | 'forehand' | 'backhand'
export type AggregationMode = 'average' | 'weighted' | 'max' | 'min'

interface TestsDashboardState {
  selectedTestIds: string[]
  selectedPositions: PositionKey[]
  searchQuery: string
  aggregationMode: AggregationMode
  weights: Record<string, number>
  genderFilter: string
  ageGroupFilter: string

  players: DashboardPlayer[]
  tests: DashboardTest[]
  isLoading: boolean
  error: string | null

  setSelectedTestIds: (ids: string[]) => void
  setSelectedPositions: (positions: PositionKey[]) => void
  setSearchQuery: (query: string) => void
  setAggregationMode: (mode: AggregationMode) => void
  setWeight: (testId: string, weight: number) => void
  setWeights: (weights: Record<string, number>) => void
  setGenderFilter: (gender: string) => void
  setAgeGroupFilter: (ageGroup: string) => void
  fetchDashboardData: () => Promise<void>
  clearError: () => void
  reset: () => void
}

export const ALL_POSITIONS: PositionKey[] = [
  'leftHand',
  'rightHand',
  'forehand',
  'backhand',
]

export const useTestsDashboardStore = create<TestsDashboardState>(
  (set, get) => ({
    selectedTestIds: [],
    selectedPositions: [...ALL_POSITIONS],
    searchQuery: '',
    aggregationMode: 'average',
    weights: {},
    genderFilter: 'all',
    ageGroupFilter: 'all',

    players: [],
    tests: [],
    isLoading: false,
    error: null,

    setSelectedTestIds: (ids) => {
      const currentWeights = get().weights
      const newWeights: Record<string, number> = {}
      const equalWeight = ids.length > 0 ? Number.parseFloat((100 / ids.length).toFixed(2)) : 0
      for (const id of ids) {
        newWeights[id] = currentWeights[id] ?? equalWeight
      }
      set({ selectedTestIds: ids, weights: newWeights })
    },

    setSelectedPositions: (positions) => set({ selectedPositions: positions }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setAggregationMode: (mode) => set({ aggregationMode: mode }),

    setWeight: (testId, weight) =>
      set((state) => ({
        weights: { ...state.weights, [testId]: weight },
      })),

    setWeights: (weights) => set({ weights }),
    setGenderFilter: (gender) => set({ genderFilter: gender }),
    setAgeGroupFilter: (ageGroup) => set({ ageGroupFilter: ageGroup }),

    fetchDashboardData: async () => {
      const { selectedTestIds, genderFilter, ageGroupFilter } = get()
      if (selectedTestIds.length === 0) {
        set({ players: [], tests: [] })
        return
      }

      set({ isLoading: true, error: null })
      try {
        const response = await apiClient.getDashboardResults({
          testIds: selectedTestIds,
          gender: genderFilter === 'all' ? undefined : genderFilter,
          ageGroup: ageGroupFilter === 'all' ? undefined : ageGroupFilter,
        })
        set({
          players: response.players,
          tests: response.tests,
          isLoading: false,
        })
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch dashboard data',
          isLoading: false,
        })
      }
    },

    clearError: () => set({ error: null }),

    reset: () =>
      set({
        selectedTestIds: [],
        selectedPositions: [...ALL_POSITIONS],
        searchQuery: '',
        aggregationMode: 'average',
        weights: {},
        genderFilter: 'all',
        ageGroupFilter: 'all',
        players: [],
        tests: [],
        isLoading: false,
        error: null,
      }),
  })
)
