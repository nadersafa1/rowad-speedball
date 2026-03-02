'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEventsStore } from '@/store/events-store'
import { toast } from 'sonner'
import { useGroupsStore } from '@/store/groups-store'
import { useRegistrationsStore } from '@/store/registrations-store'
import { useMatchesStore } from '@/store/matches-store'
import { useEventPermissions } from '@/hooks/authorization/use-event-permissions'
import { useOrganizationContext } from '@/hooks/authorization/use-organization-context'
import GroupManagement from '@/components/events/group-management'
import BracketSeeding from '@/components/events/bracket-seeding'
import HeatManagement from '@/components/events/heat-management'
import StandingsTable from '@/components/events/standings-table'
import MatchesView from '@/components/events/matches-view'
import EventTabs from '@/components/events/event-tabs'
import EventOverviewTab from '@/components/events/event-overview-tab'
import EventRegistrationsTab from '@/components/events/event-registrations-tab'
import TestEventRegistrationsView from '@/components/events/test-event-registrations-view'
import { isTestEventType } from '@/lib/utils/test-event-utils'
import { apiClient } from '@/lib/api-client'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import LoadingState from '@/components/shared/loading-state'
import { SinglePageHeader } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Edit, Trash2, CheckCircle2 } from 'lucide-react'
import { EVENT_FORMAT_LABELS } from '@/types'
import { useEventDialogs } from './_hooks/use-event-dialogs'
import EventDialogs from './_components/event-dialogs'
import TestEventStandingsView from '@/components/events/test-event-standings-view'

const EventDetailPage = () => {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = params.id as string

  // Extract activeTab value to avoid enumeration issues
  const activeTabFromUrl = useMemo(
    () => searchParams.get('activeTab') || 'overview',
    [searchParams]
  )
  const [activeTab, setActiveTab] = useState<string>(activeTabFromUrl)
  const [isGeneratingHeats, setIsGeneratingHeats] = useState(false)

  const dialogs = useEventDialogs()

  const {
    selectedEvent,
    fetchEvent,
    deleteEvent,
    isLoading: eventLoading,
  } = useEventsStore()

  const { groups, fetchGroups } = useGroupsStore()
  const {
    registrations,
    fetchRegistrations,
    loadMoreRegistrations,
    deleteRegistration,
    pagination: registrationsPagination,
    isLoadingMore: isLoadingMoreRegistrations,
  } = useRegistrationsStore()
  const { matches, fetchMatches } = useMatchesStore()
  const { canUpdate, canDelete, canCreate } = useEventPermissions(selectedEvent)
  const { context } = useOrganizationContext()

  // Coaches can only delete registrations for session-child events
  const canDeleteRegistration = useMemo(() => {
    if (!selectedEvent) return false
    if (context.isSystemAdmin || context.isAdmin || context.isOwner) return canDelete
    if (context.isCoach && selectedEvent.trainingSessionId) return canDelete
    return false
  }, [selectedEvent, canDelete, context])

  // Update activeTab when URL changes
  useEffect(() => {
    setActiveTab(activeTabFromUrl)
  }, [activeTabFromUrl])

  // Handle activeTab change - update URL
  const handleTabChange = (value: string) => {
    setActiveTab(value)

    router.push(`/events/${eventId}?activeTab=${value}`, { scroll: false })
  }

  useEffect(() => {
    if (eventId) {
      fetchEvent(eventId)
      fetchRegistrations(eventId)
    }
  }, [eventId, fetchEvent, fetchRegistrations])

  useEffect(() => {
    if (!selectedEvent) return
    if (['groups', 'tests'].includes(selectedEvent.format)) {
      fetchGroups(selectedEvent.id)
    }
    if (
      ['single-elimination', 'double-elimination', 'groups'].includes(
        selectedEvent.format
      )
    ) {
      fetchMatches(selectedEvent.id)
    }
  }, [selectedEvent, fetchGroups, fetchMatches])

  const handleRefresh = useCallback(async () => {
    await Promise.all([fetchEvent(eventId), fetchRegistrations(eventId)])
  }, [eventId, fetchEvent, fetchRegistrations])

  const handleDeleteRegistration = async () => {
    if (!dialogs.deleteRegistrationId) return
    try {
      await deleteRegistration(dialogs.deleteRegistrationId)
      dialogs.closeDeleteRegistration()
      handleRefresh()
    } catch (error) {
      console.error('Error deleting registration:', error)
    }
  }

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return
    try {
      await deleteEvent(selectedEvent.id)
      toast.success('Event deleted successfully')
      router.push('/events')
    } catch (error: any) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete event'
      )
    }
  }

  // Handle score update for test events (supports single or batch updates)
  const handleUpdateScores = async (
    registrationId: string,
    payload:
      | { playerId: string; positionScores: Record<string, number | null> }
      | { playerId: string; positionScores: Record<string, number | null> }[]
  ) => {
    try {
      // Support both single and batch payloads
      const updates = Array.isArray(payload) ? payload : [payload]
      await apiClient.updatePlayerPositionScoresBatch(registrationId, updates)
      toast.success('Scores updated successfully')
      handleRefresh()
    } catch (error: any) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update scores'
      )
    }
  }

  // Handle heat generation for test events
  const handleGenerateHeats = useCallback(async () => {
    if (!selectedEvent) return
    setIsGeneratingHeats(true)
    try {
      await apiClient.generateHeats(eventId, {})
      toast.success('Heats generated successfully')
      handleRefresh()
    } catch (error: any) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to generate heats'
      )
    } finally {
      setIsGeneratingHeats(false)
    }
  }, [selectedEvent, eventId, handleRefresh])

  const isTestEvent = isTestEventType(selectedEvent?.eventType || '')

  if (eventLoading || !selectedEvent) {
    return (
      <div className='container mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-8'>
        <LoadingState message='Loading event...' />
      </div>
    )
  }

  return (
    <div className='container mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-8'>
      <SinglePageHeader
        backTo='/events'
        actionButtons={[
          ...(canUpdate
            ? [
              {
                label: 'Edit Event',
                icon: Edit,
                buttonClassName: 'gap-2',
                onClick: dialogs.openEventForm,
              },
            ]
            : []),
          ...(canDelete
            ? [
              {
                label: 'Delete Event',
                icon: Trash2,
                buttonClassName:
                  'gap-2 text-destructive hover:text-destructive',
                onClick: dialogs.openDeleteEvent,
              },
            ]
            : []),
        ]}
      />

      {/* Event Header */}
      <div className='mb-6'>
        <h1 className='text-2xl sm:text-3xl font-bold'>{selectedEvent.name}</h1>
        {(selectedEvent as any).championshipName && (
          <p className='text-sm text-muted-foreground mt-1'>
            {(selectedEvent as any).championshipName}
            {(selectedEvent as any).championshipEditionYear &&
              ` (${(selectedEvent as any).championshipEditionYear})`}
          </p>
        )}
        <div className='flex flex-wrap gap-2 mt-2'>
          <Badge variant='outline'>{selectedEvent.eventType}</Badge>
          <Badge variant='outline'>{selectedEvent.gender}</Badge>
          <Badge variant='outline'>
            {EVENT_FORMAT_LABELS[selectedEvent.format]}
          </Badge>
          {selectedEvent.visibility === 'private' && (
            <Badge variant='secondary'>Private</Badge>
          )}
          {selectedEvent.completed && (
            <Badge variant='default' className='bg-green-600'>
              <CheckCircle2 className='h-3 w-3 mr-1' />
              Completed
            </Badge>
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className='space-y-4'
      >
        <EventTabs eventFormat={selectedEvent.format} />

        <TabsContent value='overview' className='space-y-4'>
          <EventOverviewTab event={selectedEvent} />
        </TabsContent>

        <TabsContent value='registrations' className='space-y-4'>
          <EventRegistrationsTab
            event={selectedEvent}
            registrations={registrations}
            canCreate={canCreate}
            canUpdate={canUpdate}
            canDelete={canDeleteRegistration}
            onAddRegistration={() => dialogs.openRegistrationForm()}
            onEditRegistration={(id) => dialogs.openRegistrationForm(id)}
            onDeleteRegistration={dialogs.openDeleteRegistration}
            hasMore={
              registrationsPagination.page < registrationsPagination.totalPages
            }
            isLoadingMore={isLoadingMoreRegistrations}
            onLoadMore={() => loadMoreRegistrations(eventId)}
            totalItems={registrationsPagination.totalItems}
          />
        </TabsContent>

        <TabsContent value='groups' className='space-y-4'>
          <GroupManagement
            eventId={eventId}
            groups={groups}
            registrations={registrations}
            onGroupCreated={handleRefresh}
            canManage={canCreate}
            hasMore={
              registrationsPagination.page < registrationsPagination.totalPages
            }
            isLoadingMore={isLoadingMoreRegistrations}
            onLoadMore={() => loadMoreRegistrations(eventId)}
            totalItems={registrationsPagination.totalItems}
          />
        </TabsContent>

        <TabsContent value='seeds' className='space-y-4'>
          {isTestEvent ? (
            <HeatManagement
              eventId={eventId}
              registrations={registrations}
              groups={groups}
              defaultPlayersPerHeat={selectedEvent.playersPerHeat}
              canManage={canUpdate}
              onHeatsGenerated={handleRefresh}
              hasMore={
                registrationsPagination.page <
                registrationsPagination.totalPages
              }
              isLoadingMore={isLoadingMoreRegistrations}
              onLoadMore={() => loadMoreRegistrations(eventId)}
              totalItems={registrationsPagination.totalItems}
            />
          ) : (
            <BracketSeeding
              eventId={eventId}
              registrations={registrations}
              hasExistingMatches={matches.length > 0}
              canManage={canCreate}
              onBracketGenerated={handleRefresh}
            />
          )}
        </TabsContent>

        <TabsContent value='matches' className='space-y-4'>
          <MatchesView
            matches={matches}
            groups={groups}
            canUpdate={canUpdate}
            onMatchUpdate={handleRefresh}
            eventFormat={selectedEvent.format}
          />
        </TabsContent>

        <TabsContent value='heats' className='space-y-4'>
          <TestEventRegistrationsView
            event={selectedEvent}
            registrations={registrations}
            groups={groups}
            canUpdate={canUpdate}
            canDelete={canDeleteRegistration}
            onUpdateScores={handleUpdateScores}
            onDeleteRegistration={dialogs.openDeleteRegistration}
            onGenerateHeats={handleGenerateHeats}
            isGeneratingHeats={isGeneratingHeats}
            hasMore={
              registrationsPagination.page < registrationsPagination.totalPages
            }
            isLoadingMore={isLoadingMoreRegistrations}
            onLoadMore={() => loadMoreRegistrations(eventId)}
            totalItems={registrationsPagination.totalItems}
          />
        </TabsContent>

        {(selectedEvent.format === 'groups' || isTestEvent) && (
          <TabsContent value='standings' className='space-y-4'>
            {isTestEvent ? (
              <TestEventStandingsView
                eventId={eventId}
                registrations={registrations}
                groups={groups}
              />
            ) : (
              <StandingsTable registrations={registrations} groups={groups} />
            )}
          </TabsContent>
        )}
      </Tabs>

      <EventDialogs
        event={selectedEvent}
        registrations={registrations || []}
        matches={matches || []}
        eventFormOpen={dialogs.eventFormOpen}
        registrationFormOpen={dialogs.registrationFormOpen}
        editingRegistration={dialogs.editingRegistration}
        deleteRegistrationId={dialogs.deleteRegistrationId}
        deleteEventDialogOpen={dialogs.deleteEventDialogOpen}
        onCloseEventForm={dialogs.closeEventForm}
        onCloseRegistrationForm={dialogs.closeRegistrationForm}
        onCloseDeleteRegistration={dialogs.closeDeleteRegistration}
        onCloseDeleteEvent={dialogs.closeDeleteEvent}
        onDeleteRegistration={handleDeleteRegistration}
        onDeleteEvent={handleDeleteEvent}
        onRefresh={handleRefresh}
      />
    </div>
  )
}

export default EventDetailPage
