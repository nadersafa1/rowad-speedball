'use client'

import { useEffect, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Search, Info, User, AlertCircle, CheckCircle2 } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import type { Event } from '@/types'

export interface PlayerEligibility {
  playerId: string
  playerName: string
  playerGender: string
  isEligible: boolean
  isRegistered: boolean
  genderMatch: boolean
  isClubMember: boolean
  blockReason?: string
}

interface EventRegistrationPlayerTableProps {
  event: Event
  organizationId: string
  onSelectionChange: (playerIds: string[]) => void
}

const EventRegistrationPlayerTable = ({
  event,
  organizationId,
  onSelectionChange,
}: EventRegistrationPlayerTableProps) => {
  const [eligibilityData, setEligibilityData] = useState<PlayerEligibility[]>(
    []
  )
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])

  useEffect(() => {
    const fetchEligibility = async () => {
      if (!organizationId || !event.id) {
        setEligibilityData([])
        return
      }

      setIsLoading(true)
      try {
        const response = await apiClient.checkRegistrationEligibility({
          eventId: event.id,
        })
        setEligibilityData(response.data || [])
      } catch (error) {
        console.error('Failed to fetch eligibility:', error)
        setEligibilityData([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchEligibility()
  }, [event.id, organizationId])

  useEffect(() => {
    onSelectionChange(selectedPlayerIds)
  }, [selectedPlayerIds, onSelectionChange])

  const filteredPlayers = eligibilityData.filter((player) => {
    const query = searchQuery.toLowerCase()
    return player.playerName.toLowerCase().includes(query)
  })

  const handlePlayerSelection = (playerId: string, checked: boolean) => {
    setSelectedPlayerIds((prev) => {
      if (checked) {
        return [...prev, playerId]
      }
      return prev.filter((id) => id !== playerId)
    })
  }

  const getStatusBadge = (player: PlayerEligibility) => {
    if (player.isEligible) {
      return (
        <Badge variant='default' className='gap-1'>
          <CheckCircle2 className='h-3 w-3' />
          Eligible
        </Badge>
      )
    }

    if (player.isRegistered) {
      return (
        <Badge variant='secondary' className='gap-1'>
          <AlertCircle className='h-3 w-3' />
          Already registered
        </Badge>
      )
    }

    if (!player.genderMatch) {
      return (
        <Badge variant='outline' className='gap-1 text-destructive'>
          <AlertCircle className='h-3 w-3' />
          Gender mismatch
        </Badge>
      )
    }

    return (
      <Badge variant='outline' className='gap-1'>
        <AlertCircle className='h-3 w-3' />
        {player.blockReason || 'Ineligible'}
      </Badge>
    )
  }

  if (isLoading) {
    return (
      <div className='rounded-md border p-8 text-center text-muted-foreground'>
        Loading players and checking eligibility...
      </div>
    )
  }

  if (eligibilityData.length === 0) {
    return (
      <Alert>
        <User className='h-4 w-4' />
        <AlertDescription>
          No players found in your club. Please add players first.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='relative'>
        <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          placeholder='Search players...'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className='pl-9'
        />
      </div>

      <Alert>
        <Info className='h-4 w-4' />
        <AlertDescription className='text-sm'>
          Only club players matching this event&apos;s gender requirements can
          be registered. Players already registered are disabled.
        </AlertDescription>
      </Alert>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-[50px]'>Select</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className='w-[100px]'>Gender</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPlayers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className='h-24 text-center'>
                  No players found matching your search
                </TableCell>
              </TableRow>
            ) : (
              filteredPlayers.map((player) => (
                <TableRow key={player.playerId}>
                  <TableCell>
                    <Checkbox
                      checked={selectedPlayerIds.includes(player.playerId)}
                      onCheckedChange={(checked) =>
                        handlePlayerSelection(player.playerId, !!checked)
                      }
                      disabled={!player.isEligible}
                    />
                  </TableCell>
                  <TableCell className='font-medium'>
                    {player.playerName}
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline' className='capitalize'>
                      {player.playerGender}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(player)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className='flex items-center justify-between text-sm text-muted-foreground'>
        <span>{selectedPlayerIds.length} player(s) selected</span>
        <span>{filteredPlayers.length} total players</span>
      </div>
    </div>
  )
}

export default EventRegistrationPlayerTable
