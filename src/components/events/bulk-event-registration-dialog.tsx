'use client'

import { useState, useCallback } from 'react'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import EventRegistrationPlayerTable from './event-registration-player-table'
import { useRegistrationsStore } from '@/store/registrations-store'
import { toast } from 'sonner'
import type { Event } from '@/types'
import { DIALOG_CLASSES } from '@/lib/ui-constants'

interface BulkEventRegistrationDialogProps {
  event: Event
  organizationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const BulkEventRegistrationDialog = ({
  event,
  organizationId,
  open,
  onOpenChange,
  onSuccess,
}: BulkEventRegistrationDialogProps) => {
  const { bulkCreateRegistrations, isLoading, clearError } =
    useRegistrationsStore()
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])

  const handleSelectionChange = useCallback((playerIds: string[]) => {
    setSelectedPlayerIds(playerIds)
  }, [])

  const handleSubmit = async () => {
    if (selectedPlayerIds.length === 0) {
      toast.error('Please select at least one player to register')
      return
    }

    try {
      clearError()
      const result = await bulkCreateRegistrations({
        eventId: event.id,
        playerIds: selectedPlayerIds,
      })

      toast.success(
        `Successfully registered ${result.count} player${result.count !== 1 ? 's' : ''}`
      )

      if (result.errors.length > 0) {
        result.errors.forEach((err) => {
          toast.warning(`${err.playerName}: ${err.error}`)
        })
      }

      setSelectedPlayerIds([])
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to register players'
      )
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedPlayerIds([])
      clearError()
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={`${DIALOG_CLASSES.simpleForm} max-h-[90vh] overflow-y-auto sm:max-w-2xl`}
      >
        <DialogHeader>
          <DialogTitle>Register Players</DialogTitle>
          <DialogDescription>
            Select club players to register for {event.name}. Each selected
            player will receive their own registration.
          </DialogDescription>
        </DialogHeader>

        <EventRegistrationPlayerTable
          event={event}
          organizationId={organizationId}
          onSelectionChange={handleSelectionChange}
        />

        <DialogFooter className='flex-col sm:flex-row gap-2 sm:gap-0'>
          <Button
            type='button'
            variant='outline'
            onClick={() => handleOpenChange(false)}
            className='w-full sm:w-auto'
          >
            Cancel
          </Button>
          <Button
            type='button'
            onClick={handleSubmit}
            disabled={isLoading || selectedPlayerIds.length === 0}
            className='w-full sm:w-auto'
          >
            <UserPlus className='mr-2 h-4 w-4' />
            {isLoading
              ? 'Registering...'
              : `Register ${selectedPlayerIds.length || ''} Player${selectedPlayerIds.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default BulkEventRegistrationDialog
