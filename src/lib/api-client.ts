// API Client - Single responsibility: HTTP communication with backend
import type { PaginatedResponse } from '@/types/api/pagination'
import type { OrganizationContext } from '@/lib/organization-helpers'
import type { EventType } from '@/types/event-types'
import type { EventFormat } from '@/types/event-format'
import type { TeamLevel } from '@/types/team-level'
import { Season } from '@/db/schema'
import type { UsersGetData } from '@/types/api/users.schemas'
import type { DashboardResultsResponse } from '@/types/api/results.schemas'
import { SortOrder } from '@/types'
import { UserRoles, UsersSortBy } from '@/app/admin/users/types'

export class ApiClient {
  private readonly baseUrl: string

  constructor(baseUrl?: string) {
    // Use relative path since API is on the same server now
    this.baseUrl = baseUrl || '/api/v1'
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Network error' }))

      // If it's an authentication error, provide more specific message
      if (response.status === 401) {
        throw new Error('Authentication required. Please log in again.')
      }

      // Handle both error.error and error.message formats
      const errorMessage =
        error.error || error.message || `HTTP ${response.status}`
      throw new Error(errorMessage)
    }

    // Handle 204 No Content responses (e.g., DELETE operations)
    if (response.status === 204 || response.statusText === 'No Content') {
      return null as T
    }

    // Check if response has content before parsing JSON
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      return null as T
    }

    return response.json()
  }

  // ========================================
  // Auth methods
  // ========================================

  async logout() {
    return this.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  async verifyAuth() {
    return this.request('/auth/verify')
  }

  // ========================================
  // Player methods
  // ========================================

  async getPlayers(
    params?: {
      q?: string
      gender?: string
      ageGroup?: string
      preferredHand?: string
      team?: string
      club?: string | null
      organizationId?: string | null
      sortBy?: string
      sortOrder?: 'asc' | 'desc'
      page?: number
      limit?: number
      unassigned?: string | boolean
    },
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.q) searchParams.set('q', params.q)
    if (params?.gender) searchParams.set('gender', params.gender)
    if (params?.ageGroup) searchParams.set('ageGroup', params.ageGroup)
    if (params?.preferredHand)
      searchParams.set('preferredHand', params.preferredHand)
    if (params?.team) searchParams.set('team', params.team)
    // Support both club and organizationId, prefer organizationId
    const orgId =
      params?.organizationId !== undefined
        ? params.organizationId
        : params?.club
    if (orgId !== undefined) {
      if (orgId === null) {
        searchParams.set('organizationId', 'null')
      } else if (orgId) {
        searchParams.set('organizationId', orgId)
      }
    }
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.unassigned !== undefined) {
      searchParams.set(
        'unassigned',
        typeof params.unassigned === 'boolean'
          ? params.unassigned.toString()
          : params.unassigned,
      )
    }

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/players${query ? `?${query}` : ''}`,
      { signal },
    )
  }

  async getPlayer(id: string) {
    return this.request(`/players/${id}`)
  }

  async getPlayerMatches(
    playerId: string,
    params?: { page?: number; limit?: number },
  ) {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request(
      `/players/${playerId}/matches${query ? `?${query}` : ''}`,
    )
  }

  async createPlayer(data: any) {
    return this.request('/players', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updatePlayer(id: string, data: any) {
    return this.request(`/players/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deletePlayer(id: string) {
    return this.request(`/players/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Player Notes methods
  // ========================================

  async getPlayerNotes(
    playerId: string,
    params?: {
      noteType?: 'performance' | 'medical' | 'behavioral' | 'general' | 'all'
      sortOrder?: 'asc' | 'desc'
      page?: number
      limit?: number
    },
  ): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.noteType) searchParams.set('noteType', params.noteType)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/players/${playerId}/notes${query ? `?${query}` : ''}`,
    )
  }

  async createPlayerNote(
    playerId: string,
    data: {
      content: string
      noteType: 'performance' | 'medical' | 'behavioral' | 'general'
    },
  ) {
    return this.request(`/players/${playerId}/notes`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updatePlayerNote(
    playerId: string,
    noteId: string,
    data: {
      content?: string
      noteType?: 'performance' | 'medical' | 'behavioral' | 'general'
    },
  ) {
    return this.request(`/players/${playerId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deletePlayerNote(playerId: string, noteId: string) {
    return this.request(`/players/${playerId}/notes/${noteId}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Federation methods
  // ========================================

  async getFederations(params?: {
    q?: string
    sortBy?: 'name' | 'createdAt' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.q) searchParams.set('q', params.q)
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/federations${query ? `?${query}` : ''}`,
    )
  }

  async getFederation(id: string) {
    return this.request(`/federations/${id}`)
  }

  async createFederation(data: any) {
    return this.request('/federations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateFederation(id: string, data: any) {
    return this.request(`/federations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteFederation(id: string) {
    return this.request(`/federations/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Federation Clubs methods
  // ========================================

  async getFederationClubs(params?: {
    federationId?: string
    organizationId?: string
    sortBy?: 'createdAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.federationId)
      searchParams.set('federationId', params.federationId)
    if (params?.organizationId)
      searchParams.set('organizationId', params.organizationId)
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/federation-clubs${query ? `?${query}` : ''}`,
    )
  }

  // ========================================
  // Championship methods
  // ========================================

  async getChampionships(params?: {
    q?: string
    federationId?: string
    competitionScope?: 'clubs' | 'open'
    sortBy?: 'name' | 'competitionScope' | 'createdAt' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.q) searchParams.set('q', params.q)
    if (params?.federationId)
      searchParams.set('federationId', params.federationId)
    if (params?.competitionScope)
      searchParams.set('competitionScope', params.competitionScope)
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/championships${query ? `?${query}` : ''}`,
    )
  }

  async getChampionship(id: string) {
    return this.request(`/championships/${id}`)
  }

  async createChampionship(data: any) {
    return this.request('/championships', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateChampionship(id: string, data: any) {
    return this.request(`/championships/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteChampionship(id: string) {
    return this.request(`/championships/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Championship Editions methods
  // ========================================

  async getChampionshipEditions(params?: {
    q?: string
    championshipId?: string
    status?: 'draft' | 'published' | 'archived'
    sortBy?: 'status' | 'createdAt' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.q) searchParams.set('q', params.q)
    if (params?.championshipId)
      searchParams.set('championshipId', params.championshipId)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/championship-editions${query ? `?${query}` : ''}`,
    )
  }

  async getChampionshipEdition(id: string) {
    return this.request(`/championship-editions/${id}`)
  }

  async createChampionshipEdition(data: any) {
    return this.request('/championship-editions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateChampionshipEdition(id: string, data: any) {
    return this.request(`/championship-editions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteChampionshipEdition(id: string) {
    return this.request(`/championship-editions/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Test methods
  // ========================================

  async getTests(params?: {
    q?: string
    playingTime?: number
    recoveryTime?: number
    dateFrom?: string
    dateTo?: string
    organizationId?: string | null
    sortBy?: 'name' | 'dateConducted' | 'createdAt' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.q) searchParams.set('q', params.q)
    if (params?.playingTime)
      searchParams.set('playingTime', params.playingTime.toString())
    if (params?.recoveryTime)
      searchParams.set('recoveryTime', params.recoveryTime.toString())
    if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom)
    if (params?.dateTo) searchParams.set('dateTo', params.dateTo)
    if (params?.organizationId !== undefined) {
      if (params.organizationId === null) {
        searchParams.set('organizationId', 'null')
      } else {
        searchParams.set('organizationId', params.organizationId)
      }
    }
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/tests${query ? `?${query}` : ''}`,
    )
  }

  async getTest(id: string, includeResults?: boolean) {
    const params = includeResults ? '?includeResults=true' : ''
    return this.request(`/tests/${id}${params}`)
  }

  async createTest(data: any) {
    return this.request('/tests', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateTest(id: string, data: any) {
    return this.request(`/tests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteTest(id: string) {
    return this.request(`/tests/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Results methods
  // ========================================

  async getResults(params?: {
    testId: string
    q?: string
    gender?: string
    ageGroup?: string
    yearOfBirth?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.testId) searchParams.set('testId', params.testId)
    if (params?.q) searchParams.set('q', params.q)
    if (params?.gender) searchParams.set('gender', params.gender)
    if (params?.ageGroup) searchParams.set('ageGroup', params.ageGroup)
    if (params?.yearOfBirth) searchParams.set('yearOfBirth', params.yearOfBirth)
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/results${query ? `?${query}` : ''}`,
    )
  }

  async getPlayerResults(playerId: string) {
    return this.request(`/results/player/${playerId}`)
  }

  async getTestResults(testId: string) {
    return this.request(`/results/test/${testId}`)
  }

  async createResult(data: any) {
    return this.request('/results', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateResult(id: string, data: any) {
    return this.request(`/results/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteResult(id: string) {
    return this.request(`/results/${id}`, {
      method: 'DELETE',
    })
  }

  async getDashboardResults(params: {
    testIds: string[]
    q?: string
    gender?: string
    ageGroup?: string
  }): Promise<DashboardResultsResponse> {
    const searchParams = new URLSearchParams()
    searchParams.set('testIds', params.testIds.join(','))
    if (params.q) searchParams.set('q', params.q)
    if (params.gender) searchParams.set('gender', params.gender)
    if (params.ageGroup) searchParams.set('ageGroup', params.ageGroup)

    return this.request<DashboardResultsResponse>(
      `/results/dashboard?${searchParams.toString()}`,
    )
  }

  // ========================================
  // Events methods
  // ========================================

  async getEvents(params?: {
    q?: string
    eventType?: EventType
    gender?: 'male' | 'female' | 'mixed'
    format?: EventFormat
    visibility?: 'public' | 'private'
    organizationId?: string | null
    trainingSessionId?: string
    championshipEditionId?: string
    sortBy?:
      | 'name'
      | 'eventType'
      | 'gender'
      | 'completed'
      | 'createdAt'
      | 'updatedAt'
      | 'registrationStartDate'
      | 'registrationsCount'
      | 'lastMatchPlayedDate'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.q) searchParams.set('q', params.q)
    if (params?.eventType) searchParams.set('eventType', params.eventType)
    if (params?.gender) searchParams.set('gender', params.gender)
    if (params?.format) searchParams.set('format', params.format)
    if (params?.visibility) searchParams.set('visibility', params.visibility)
    if (params?.trainingSessionId) {
      searchParams.set('trainingSessionId', params.trainingSessionId)
    }
    if (params?.championshipEditionId) {
      searchParams.set('championshipEditionId', params.championshipEditionId)
    }
    if (params?.organizationId !== undefined) {
      if (params.organizationId === null) {
        searchParams.set('organizationId', 'null')
      } else {
        searchParams.set('organizationId', params.organizationId)
      }
    }
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/events${query ? `?${query}` : ''}`,
    )
  }

  async getEvent(id: string) {
    return this.request(`/events/${id}`)
  }

  async createEvent(data: any) {
    return this.request('/events', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateEvent(id: string, data: any) {
    return this.request(`/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteEvent(id: string) {
    return this.request(`/events/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Bracket methods
  // ========================================

  async generateBracket(
    eventId: string,
    seeds?: Array<{ registrationId: string; seed: number }>,
  ) {
    return this.request(`/events/${eventId}/generate-bracket`, {
      method: 'POST',
      body: seeds ? JSON.stringify({ seeds }) : undefined,
    })
  }

  async resetBracket(eventId: string) {
    return this.request(`/events/${eventId}/reset-bracket`, {
      method: 'POST',
    })
  }

  // ========================================
  // Heat generation methods (for test events)
  // ========================================

  async generateHeats(
    eventId: string,
    options?: {
      playersPerHeat?: number
      shuffleRegistrations?: boolean
      seeds?: Array<{ registrationId: string; seed: number }>
    },
  ) {
    return this.request(`/events/${eventId}/generate-heats`, {
      method: 'POST',
      body: options ? JSON.stringify(options) : undefined,
    })
  }

  async resetHeats(eventId: string) {
    return this.request(`/events/${eventId}/reset-heats`, {
      method: 'POST',
    })
  }

  // ========================================
  // Groups methods
  // ========================================

  async getGroups(eventId?: string) {
    const params = eventId ? `?eventId=${eventId}` : ''
    return this.request(`/groups${params}`)
  }

  async createGroup(data: { eventId: string; registrationIds: string[] }) {
    return this.request('/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async deleteGroup(id: string) {
    return this.request(`/groups/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Registrations methods
  // ========================================

  async getRegistrations(
    eventId?: string,
    groupId?: string,
    params?: {
      q?: string
      organizationId?: string | null
      sortBy?: string
      sortOrder?: 'asc' | 'desc'
      page?: number
      limit?: number
    },
  ): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (eventId) searchParams.set('eventId', eventId)
    if (groupId) searchParams.set('groupId', groupId)
    if (params?.q) searchParams.set('q', params.q)
    if (params?.organizationId !== undefined) {
      if (params.organizationId === null) {
        searchParams.set('organizationId', 'null')
      } else {
        searchParams.set('organizationId', params.organizationId)
      }
    }
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/registrations${query ? `?${query}` : ''}`,
    )
  }

  async createRegistration(data: {
    eventId: string
    playerIds: string[]
    players?: { playerId: string; position?: string | null; order?: number }[]
  }) {
    return this.request('/registrations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateRegistration(id: string, data: any) {
    return this.request(`/registrations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteRegistration(id: string) {
    return this.request(`/registrations/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Player Position Scores methods
  // ========================================

  async updatePlayerPositionScores(
    registrationId: string,
    payload: {
      playerId: string
      positionScores: Record<string, number | null>
    },
  ) {
    return this.request(`/registrations/${registrationId}/scores`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  async updatePlayerPositionScoresBatch(
    registrationId: string,
    updates: {
      playerId: string
      positionScores: Record<string, number | null>
    }[],
  ) {
    return this.request(`/registrations/${registrationId}/scores`, {
      method: 'PATCH',
      body: JSON.stringify({ updates }),
    })
  }

  // ========================================
  // Matches methods
  // ========================================

  async getMatches(params?: {
    eventId?: string
    groupId?: string
    round?: number
    sortBy?:
      | 'round'
      | 'matchNumber'
      | 'matchDate'
      | 'played'
      | 'createdAt'
      | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }) {
    const searchParams = new URLSearchParams()
    if (params?.eventId) searchParams.set('eventId', params.eventId)
    if (params?.groupId) searchParams.set('groupId', params.groupId)
    if (params?.round) searchParams.set('round', params.round.toString())
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/matches${query ? `?${query}` : ''}`,
    )
  }

  async getMatch(id: string) {
    return this.request(`/matches/${id}`)
  }

  async updateMatch(id: string, data: any) {
    return this.request(`/matches/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  // ========================================
  // Sets methods
  // ========================================

  async getSets(matchId?: string) {
    const params = matchId ? `?matchId=${matchId}` : ''
    return this.request(`/sets${params}`)
  }

  async createSet(data: {
    matchId: string
    setNumber: number
    registration1Score: number
    registration2Score: number
  }) {
    return this.request('/sets', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateSet(id: string, data: any) {
    return this.request(`/sets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async markSetAsPlayed(id: string) {
    return this.request(`/sets/${id}/played`, {
      method: 'PATCH',
    })
  }

  async deleteSet(id: string) {
    return this.request(`/sets/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Coaches methods
  // ========================================

  async getCoaches(params?: {
    q?: string
    gender?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
    unassigned?: string | boolean
    organizationId?: string | null
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.q) searchParams.set('q', params.q)
    if (params?.gender) searchParams.set('gender', params.gender)
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.unassigned !== undefined) {
      searchParams.set(
        'unassigned',
        typeof params.unassigned === 'boolean'
          ? params.unassigned.toString()
          : params.unassigned,
      )
    }
    if (params?.organizationId !== undefined) {
      searchParams.set(
        'organizationId',
        params.organizationId === null ? 'null' : params.organizationId,
      )
    }

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/coaches${query ? `?${query}` : ''}`,
    )
  }

  async getCoach(id: string) {
    return this.request(`/coaches/${id}`)
  }

  async createCoach(data: any) {
    return this.request('/coaches', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateCoach(id: string, data: any) {
    return this.request(`/coaches/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteCoach(id: string) {
    return this.request(`/coaches/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Training Sessions methods
  // ========================================

  async getTrainingSessions(params?: {
    q?: string
    intensity?: string
    type?: string
    dateFrom?: string
    dateTo?: string
    ageGroup?: string
    organizationId?: string | null
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.q) searchParams.set('q', params.q)
    if (params?.intensity) searchParams.set('intensity', params.intensity)
    if (params?.type) searchParams.set('type', params.type)
    if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom)
    if (params?.dateTo) searchParams.set('dateTo', params.dateTo)
    if (params?.ageGroup) searchParams.set('ageGroup', params.ageGroup)
    if (params?.organizationId !== undefined) {
      searchParams.set(
        'organizationId',
        params.organizationId === null ? 'null' : params.organizationId,
      )
    }
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/training-sessions${query ? `?${query}` : ''}`,
    )
  }

  async getTrainingSession(id: string) {
    return this.request(`/training-sessions/${id}`)
  }

  async createTrainingSession(data: any) {
    return this.request('/training-sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateTrainingSession(id: string, data: any) {
    return this.request(`/training-sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteTrainingSession(id: string) {
    return this.request(`/training-sessions/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Training Session Attendance methods
  // ========================================

  async getTrainingSessionAttendance(sessionId: string) {
    return this.request(`/training-sessions/${sessionId}/attendance`)
  }

  async getTrainingSessionAttendanceRecord(
    sessionId: string,
    playerId: string,
  ) {
    return this.request(
      `/training-sessions/${sessionId}/attendance/${playerId}`,
    )
  }

  async updateAttendanceStatus(
    sessionId: string,
    playerId: string,
    status: string,
  ) {
    return this.request(
      `/training-sessions/${sessionId}/attendance/${playerId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
    )
  }

  async createAttendanceRecord(
    sessionId: string,
    playerId: string,
    status: string = 'pending',
  ) {
    return this.request(`/training-sessions/${sessionId}/attendance`, {
      method: 'POST',
      body: JSON.stringify({ playerId, status }),
    })
  }

  async deleteAttendanceRecord(sessionId: string, playerId: string) {
    return this.request(
      `/training-sessions/${sessionId}/attendance/${playerId}`,
      {
        method: 'DELETE',
      },
    )
  }

  async bulkUpdateAttendanceStatus(
    sessionId: string,
    updates: Array<{ playerId: string; status: string }>,
  ) {
    return this.request(`/training-sessions/${sessionId}/attendance/bulk`, {
      method: 'PATCH',
      body: JSON.stringify({ updates }),
    })
  }

  async bulkDeleteAttendanceRecords(sessionId: string, playerIds: string[]) {
    return this.request(`/training-sessions/${sessionId}/attendance/bulk`, {
      method: 'DELETE',
      body: JSON.stringify({ playerIds }),
    })
  }

  // ========================================
  // Generic methods for convenience
  // ========================================

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint)
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Users API
  // ========================================

  async getUsers(params?: {
    q?: string
    role?: UserRoles
    sortBy?: UsersSortBy
    sortOrder?: SortOrder
    page?: number
    limit?: number
    unassigned?: string | boolean
  }): Promise<PaginatedResponse<UsersGetData>> {
    const searchParams = new URLSearchParams()
    if (params?.q) searchParams.set('q', params.q)
    if (params?.role) searchParams.set('role', params.role)
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.unassigned !== undefined) {
      searchParams.set(
        'unassigned',
        typeof params.unassigned === 'boolean'
          ? params.unassigned.toString()
          : params.unassigned,
      )
    }

    return this.request<PaginatedResponse<UsersGetData>>(
      `/users?${searchParams.toString()}`,
    )
  }

  async getUser(id: string): Promise<any> {
    return this.request(`/users/${id}`)
  }

  async updateUserFederationRole(
    userId: string,
    data: { role: string | null; federationId: string | null },
  ): Promise<any> {
    return this.request(`/users/${userId}/federation-role`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  // ========================================
  // My Memberships methods
  // ========================================

  async getMyMemberships(): Promise<
    Array<{
      id: string
      userId: string
      organizationId: string
      role: string
      createdAt: Date
      organization: {
        id: string
        name: string
        slug: string
      }
    }>
  > {
    return this.request('/users/me/memberships')
  }

  async getMyOrganizationContext(): Promise<OrganizationContext> {
    return this.request<OrganizationContext>('/users/me/organization-context')
  }

  async getMyProfile(): Promise<{
    user: any
    player: any | null
    coach: any | null
  }> {
    return this.request('/users/me')
  }

  async updateMyPlayer(data: {
    name?: string
    preferredHand?: 'left' | 'right' | 'both'
    teamLevel?: TeamLevel
  }): Promise<any> {
    return this.request('/users/me/player', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async updateMyCoach(data: { name?: string }): Promise<any> {
    return this.request('/users/me/coach', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  // ========================================
  // Organizations API
  // ========================================

  async getOrganizations(params?: {
    q?: string
    sortBy?: 'name' | 'slug' | 'createdAt'
    sortOrder?: SortOrder
    page?: number
    limit?: number
  }): Promise<
    PaginatedResponse<{
      id: string
      name: string
      slug: string
      createdAt?: Date
    }>
  > {
    // Default params if not provided
    const queryParams = {
      page: params?.page || 1,
      limit: params?.limit || 100,
      ...params,
    }

    const searchParams = new URLSearchParams()
    if (queryParams.q) searchParams.set('q', queryParams.q)
    if (queryParams.sortBy) searchParams.set('sortBy', queryParams.sortBy)
    if (queryParams.sortOrder)
      searchParams.set('sortOrder', queryParams.sortOrder)
    searchParams.set('page', queryParams.page.toString())
    searchParams.set('limit', queryParams.limit.toString())

    const query = searchParams.toString()
    const endpoint = `/organizations?${query}`

    const response = await this.request<
      PaginatedResponse<{
        id: string
        name: string
        slug: string
        createdAt?: Date
        memberCount?: number
      }>
    >(endpoint)

    return response
  }

  async getOrganization(
    id: string,
  ): Promise<{ id: string; name: string; slug: string; createdAt?: Date }> {
    return this.request<{
      id: string
      name: string
      slug: string
      createdAt?: Date
    }>(`/organizations/${id}`)
  }

  async updateOrganization(
    id: string,
    data: { name?: string; slug?: string },
  ): Promise<{ id: string; name: string; slug: string; createdAt?: Date }> {
    return this.request<{
      id: string
      name: string
      slug: string
      createdAt?: Date
    }>(`/organizations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteOrganization(id: string): Promise<void> {
    return this.request<void>(`/organizations/${id}`, {
      method: 'DELETE',
    })
  }

  async createOrganization(data: {
    name: string
    slug: string
    members?: Array<{
      userId: string
      role: 'owner' | 'admin' | 'coach' | 'member' | 'player'
    }>
  }): Promise<any> {
    return this.request<any>('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // ========================================
  // Placement Tier methods
  // ========================================

  async getPlacementTiers(
    params?: {
      q?: string
      sortBy?: 'name' | 'rank' | 'createdAt' | 'updatedAt'
      sortOrder?: 'asc' | 'desc'
      page?: number
      limit?: number
    },
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<any>> {
    const query = new URLSearchParams(
      Object.entries(params || {})
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)]),
    ).toString()

    const endpoint = query ? `/placement-tiers?${query}` : '/placement-tiers'

    return this.request<PaginatedResponse<any>>(endpoint, { signal })
  }

  async getPlacementTier(id: string, signal?: AbortSignal): Promise<any> {
    return this.request<any>(`/placement-tiers/${id}`, { signal })
  }

  async createPlacementTier(data: {
    name: string
    displayName?: string | null
    description?: string | null
    rank: number
  }): Promise<any> {
    return this.request<any>('/placement-tiers', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updatePlacementTier(
    id: string,
    data: {
      name?: string
      displayName?: string | null
      description?: string | null
      rank?: number
    },
  ): Promise<any> {
    return this.request<any>(`/placement-tiers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deletePlacementTier(id: string): Promise<void> {
    return this.request<void>(`/placement-tiers/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Points Schema methods
  // ========================================

  async getPointsSchemas(params?: {
    q?: string
    sortBy?: 'name' | 'createdAt' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const query = new URLSearchParams(
      Object.entries(params || {})
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)]),
    ).toString()

    const endpoint = query ? `/points-schemas?${query}` : '/points-schemas'

    return this.request<PaginatedResponse<any>>(endpoint)
  }

  async getPointsSchema(id: string): Promise<any> {
    return this.request<any>(`/points-schemas/${id}`)
  }

  async createPointsSchema(data: {
    name: string
    description?: string | null
  }): Promise<any> {
    return this.request<any>('/points-schemas', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updatePointsSchema(
    id: string,
    data: {
      name?: string
      description?: string | null
    },
  ): Promise<any> {
    return this.request<any>(`/points-schemas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deletePointsSchema(id: string): Promise<void> {
    return this.request<void>(`/points-schemas/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Points Schema Entry methods
  // ========================================

  async getPointsSchemaEntries(params?: {
    pointsSchemaId?: string
    placementTierId?: string
    sortBy?: 'points' | 'createdAt' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const query = new URLSearchParams(
      Object.entries(params || {})
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)]),
    ).toString()

    const endpoint = query
      ? `/points-schema-entries?${query}`
      : '/points-schema-entries'

    return this.request<PaginatedResponse<any>>(endpoint)
  }

  async getPointsSchemaEntry(id: string): Promise<any> {
    return this.request<any>(`/points-schema-entries/${id}`)
  }

  async createPointsSchemaEntry(data: {
    pointsSchemaId: string
    placementTierId: string
    points: number
  }): Promise<any> {
    return this.request<any>('/points-schema-entries', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updatePointsSchemaEntry(
    id: string,
    data: {
      points?: number
    },
  ): Promise<any> {
    return this.request<any>(`/points-schema-entries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deletePointsSchemaEntry(id: string): Promise<void> {
    return this.request<void>(`/points-schema-entries/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Federation Club Request methods
  // ========================================

  async getFederationClubRequests(params?: {
    federationId?: string
    organizationId?: string
    status?: 'pending' | 'approved' | 'rejected' | 'all'
    sortBy?: 'requestedAt' | 'respondedAt' | 'createdAt' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.federationId)
      searchParams.set('federationId', params.federationId)
    if (params?.organizationId)
      searchParams.set('organizationId', params.organizationId)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/federation-club-requests${query ? `?${query}` : ''}`,
    )
  }

  async createFederationClubRequest(data: {
    federationId: string
  }): Promise<any> {
    return this.request<any>('/federation-club-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateFederationClubRequestStatus(
    id: string,
    data: {
      status: 'approved' | 'rejected'
      rejectionReason?: string
    },
  ): Promise<any> {
    return this.request<any>(`/federation-club-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteFederationClubRequest(id: string): Promise<void> {
    return this.request<void>(`/federation-club-requests/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Season methods
  // ========================================

  async getSeasons(params?: {
    federationId?: string
    status?: 'draft' | 'active' | 'closed' | 'archived'
    year?: number
    sortBy?:
      | 'name'
      | 'startYear'
      | 'seasonStartDate'
      | 'createdAt'
      | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<Season>> {
    const searchParams = new URLSearchParams()
    if (params?.federationId)
      searchParams.set('federationId', params.federationId)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.year) searchParams.set('year', params.year.toString())
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<Season>>(
      `/seasons${query ? `?${query}` : ''}`,
    )
  }

  async getSeason(id: string): Promise<any> {
    return this.request<any>(`/seasons/${id}`)
  }

  async createSeason(data: any): Promise<any> {
    return this.request<any>('/seasons', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateSeason(id: string, data: any): Promise<any> {
    return this.request<any>(`/seasons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteSeason(id: string): Promise<void> {
    return this.request<void>(`/seasons/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Season Age Group methods
  // ========================================

  async getSeasonAgeGroups(params?: {
    seasonId?: string
    sortBy?: 'displayOrder' | 'code' | 'name' | 'createdAt'
    sortOrder?: 'asc' | 'desc'
  }): Promise<{ data: any[] }> {
    const searchParams = new URLSearchParams()
    if (params?.seasonId) searchParams.set('seasonId', params.seasonId)
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)

    const query = searchParams.toString()
    return this.request<{ data: any[] }>(
      `/season-age-groups${query ? `?${query}` : ''}`,
    )
  }

  async getSeasonAgeGroup(id: string): Promise<any> {
    return this.request<any>(`/season-age-groups/${id}`)
  }

  async createSeasonAgeGroup(data: any): Promise<any> {
    return this.request<any>('/season-age-groups', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateSeasonAgeGroup(id: string, data: any): Promise<any> {
    return this.request<any>(`/season-age-groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteSeasonAgeGroup(id: string): Promise<void> {
    return this.request<void>(`/season-age-groups/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Season Player Registration methods
  // ========================================

  async getSeasonPlayerRegistrations(params?: {
    seasonId?: string
    playerId?: string
    seasonAgeGroupId?: string
    organizationId?: string
    status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
    paymentStatus?: 'unpaid' | 'paid' | 'refunded'
    sortBy?:
      | 'registrationDate'
      | 'approvedAt'
      | 'playerName'
      | 'createdAt'
      | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.seasonId) searchParams.set('seasonId', params.seasonId)
    if (params?.playerId) searchParams.set('playerId', params.playerId)
    if (params?.seasonAgeGroupId)
      searchParams.set('seasonAgeGroupId', params.seasonAgeGroupId)
    if (params?.organizationId)
      searchParams.set('organizationId', params.organizationId)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.paymentStatus)
      searchParams.set('paymentStatus', params.paymentStatus)
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/season-player-registrations${query ? `?${query}` : ''}`,
    )
  }

  async getSeasonPlayerRegistration(id: string): Promise<any> {
    return this.request<any>(`/season-player-registrations/${id}`)
  }

  async createSeasonPlayerRegistration(data: any): Promise<any> {
    return this.request<any>('/season-player-registrations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async bulkCreateSeasonPlayerRegistrations(data: {
    seasonId: string
    playerIds: string[]
    seasonAgeGroupIds: string[]
    organizationId: string
  }): Promise<{
    success: boolean
    count: number
    registrations: any[]
    errors?: any[]
  }> {
    return this.request<{
      success: boolean
      count: number
      registrations: any[]
      errors?: any[]
    }>('/season-player-registrations/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateSeasonPlayerRegistrationStatus(
    id: string,
    data: any,
  ): Promise<any> {
    return this.request<any>(`/season-player-registrations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async approveSeasonPlayerRegistration(
    id: string,
    data: { federationIdNumber?: string | null },
  ): Promise<any> {
    return this.request<any>(`/season-player-registrations/${id}/approve`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async rejectSeasonPlayerRegistration(
    id: string,
    data: { rejectionReason: string },
  ): Promise<any> {
    return this.request<any>(`/season-player-registrations/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteSeasonPlayerRegistration(id: string): Promise<void> {
    return this.request<void>(`/season-player-registrations/${id}`, {
      method: 'DELETE',
    })
  }

  // ========================================
  // Federation Member methods
  // ========================================

  async getFederationMembers(params?: {
    federationId?: string
    playerId?: string
    status?: 'active' | 'suspended' | 'revoked'
    search?: string
    sortBy?:
      | 'firstRegistrationDate'
      | 'federationIdNumber'
      | 'createdAt'
      | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<any>> {
    const searchParams = new URLSearchParams()
    if (params?.federationId)
      searchParams.set('federationId', params.federationId)
    if (params?.playerId) searchParams.set('playerId', params.playerId)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.search) searchParams.set('search', params.search)
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.limit) searchParams.set('limit', params.limit.toString())

    const query = searchParams.toString()
    return this.request<PaginatedResponse<any>>(
      `/federation-members${query ? `?${query}` : ''}`,
    )
  }

  async getFederationMember(id: string): Promise<any> {
    return this.request<any>(`/federation-members/${id}`)
  }

  async createFederationMember(data: any): Promise<any> {
    return this.request<any>('/federation-members', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateFederationMember(id: string, data: any): Promise<any> {
    return this.request<any>(`/federation-members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async deleteFederationMember(id: string): Promise<void> {
    return this.request<void>(`/federation-members/${id}`, {
      method: 'DELETE',
    })
  }
}

// Singleton instance - use relative path
export const apiClient = new ApiClient('/api/v1')
