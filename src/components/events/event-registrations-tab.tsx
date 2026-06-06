'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Loader2, Users } from 'lucide-react'
import EmptyState from '@/components/shared/empty-state'
import type { Event, Registration } from '@/types'
import RegistrationItem from '@/app/events/[id]/_components/registration-item'
import BulkEventRegistrationDialog from './bulk-event-registration-dialog'
import { isSinglePlayerEventType } from '@/types/event-types'

interface EventRegistrationsTabProps {
  event: Event
  registrations: Registration[]
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  organizationId?: string | null
  onAddRegistration: () => void
  onEditRegistration: (id: string) => void
  onDeleteRegistration: (id: string) => void
  onRefresh?: () => void
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  totalItems?: number
}

const isWithinRegistrationWindow = (event: Event): boolean => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (event.registrationStartDate) {
    const startDate = new Date(event.registrationStartDate)
    startDate.setHours(0, 0, 0, 0)
    if (today < startDate) return false
  }

  if (event.registrationEndDate) {
    const endDate = new Date(event.registrationEndDate)
    endDate.setHours(23, 59, 59, 999)
    if (today > endDate) return false
  }

  return true
}

const EventRegistrationsTab = ({
  event,
  registrations,
  canCreate,
  canUpdate,
  canDelete,
  organizationId,
  onAddRegistration,
  onEditRegistration,
  onDeleteRegistration,
  onRefresh,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  totalItems,
}: EventRegistrationsTabProps) => {
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const isSinglePlayer = isSinglePlayerEventType(event.eventType)
  const canAddRegistration = canCreate && isWithinRegistrationWindow(event)

  const displayCount = totalItems ?? registrations.length

  return (
    <>
      <Card>
        <CardHeader>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
            <CardTitle>
              Registrations ({displayCount}
              {totalItems && totalItems > registrations.length
                ? ` of ${totalItems}`
                : ''}
              )
            </CardTitle>
            {canAddRegistration && (
              <Button
                onClick={() =>
                  isSinglePlayer && organizationId
                    ? setBulkDialogOpen(true)
                    : onAddRegistration()
                }
                className='w-full sm:w-auto'
              >
                {isSinglePlayer ? (
                  <>
                    <Users className='mr-2 h-4 w-4' />
                    Register Players
                  </>
                ) : (
                  <>
                    <Plus className='mr-2 h-4 w-4' />
                    Add Registration
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <EmptyState
              title='No registrations yet'
              description='Add registrations to start organizing the event.'
            />
          ) : (
            <div className='space-y-4'>
              <div className='space-y-2'>
                {registrations.map((reg) => (
                  <RegistrationItem
                    key={reg.id}
                    registration={reg}
                    event={event}
                    canUpdate={canUpdate}
                    canDelete={canDelete}
                    onEditRegistration={onEditRegistration}
                    onDeleteRegistration={onDeleteRegistration}
                  />
                ))}
              </div>
              {hasMore && onLoadMore && (
                <div className='flex justify-center pt-4'>
                  <Button
                    onClick={onLoadMore}
                    disabled={isLoadingMore}
                    variant='outline'
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        Loading...
                      </>
                    ) : (
                      `Load More (${totalItems && totalItems > registrations.length ? totalItems - registrations.length : ''} remaining)`
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isSinglePlayer && organizationId && (
        <BulkEventRegistrationDialog
          event={event}
          organizationId={organizationId}
          open={bulkDialogOpen}
          onOpenChange={setBulkDialogOpen}
          onSuccess={onRefresh}
        />
      )}
    </>
  )
}

export default EventRegistrationsTab
