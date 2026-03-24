'use client'

import PlayerForm from '@/components/players/player-form'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { SinglePageHeader } from '@/components/ui'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlayerNotesPermissions } from '@/hooks/authorization/use-player-notes-permissions'
import { usePlayerPermissions } from '@/hooks/authorization/use-player-permissions'
import { apiClient } from '@/lib/api-client'
import { usePlayersStore } from '@/store/players-store'
import { Edit, Trash2 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import PlayerNotesTab from './components/player-notes-tab'
import PlayerProfileCard from './components/player-profile-card'
import PlayerStatsTab from './components/player-stats-tab'
import PlayerTestsTab from './components/player-tests-tab'
import RecentMatchesCard from './components/recent-matches-card'

const PlayerDetailPage = () => {
  const params = useParams()
  const router = useRouter()
  const playerId = params.id as string
  const { selectedPlayer, fetchPlayer, isLoading, deletePlayer } =
    usePlayersStore()
  const { canUpdate, canDelete } = usePlayerPermissions(selectedPlayer)
  const { canReadNotes } = usePlayerNotesPermissions(selectedPlayer)
  const [editPlayerFormOpen, setEditPlayerFormOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [userImage, setUserImage] = useState<string | null>(null)

  useEffect(() => {
    if (playerId) {
      fetchPlayer(playerId)
    }
  }, [playerId, fetchPlayer])

  useEffect(() => {
    let isMounted = true

    const fetchUserImage = async () => {
      if (selectedPlayer?.userId) {
        setUserImage(null)
        try {
          const user = await apiClient.getUser(selectedPlayer.userId)
          if (isMounted && user?.image) {
            setUserImage(user.image)
          }
        } catch (error) {
          if (!isMounted) return
          console.error('Failed to fetch user image:', error)
        }
      } else {
        setUserImage(null)
      }
    }

    if (selectedPlayer) {
      fetchUserImage()
    }

    return () => {
      isMounted = false
    }
  }, [selectedPlayer])

  if (isLoading || !selectedPlayer) {
    return (
      <div className='container mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-8'>
        <div className='space-y-6'>
          <Skeleton className='h-8 w-1/3' />
          <Skeleton className='h-32' />
          <Skeleton className='h-64' />
        </div>
      </div>
    )
  }

  const handleDelete = async () => {
    try {
      await deletePlayer(playerId)
      toast.success('Player deleted successfully')
      router.push('/players')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete player'
      )
    }
  }

  return (
    <div className='container mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-8'>
      <SinglePageHeader
        backTo='/players'
        actionDialogs={[
          ...(canUpdate
            ? [
                {
                  open: editPlayerFormOpen,
                  onOpenChange: setEditPlayerFormOpen,
                  trigger: (
                    <Button size='sm' className='gap-2' variant='outline'>
                      <Edit className='h-4 w-4' />
                      <span className='hidden sm:inline'>Edit Player</span>
                    </Button>
                  ),
                  content: (
                    <PlayerForm
                      player={selectedPlayer}
                      onSuccess={() => {
                        setEditPlayerFormOpen(false)
                        fetchPlayer(playerId)
                      }}
                      onCancel={() => setEditPlayerFormOpen(false)}
                    />
                  ),
                },
              ]
            : []),
        ]}
        alertDialogs={
          canDelete
            ? [
                {
                  open: deleteDialogOpen,
                  onOpenChange: setDeleteDialogOpen,
                  trigger: (
                    <Button size='sm' className='gap-2' variant='destructive'>
                      <Trash2 className='h-4 w-4' />
                      <span className='hidden sm:inline'>Delete Player</span>
                    </Button>
                  ),
                  content: (
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Player</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete {selectedPlayer.name}?
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                          onClick={handleDelete}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  ),
                },
              ]
            : undefined
        }
      />

      <PlayerProfileCard
        selectedPlayer={selectedPlayer}
        userImage={userImage}
      />

      <Tabs defaultValue='stats' className='w-full mt-6'>
        <TabsList
          className={cn(
            'grid w-full mb-6',
            canReadNotes ? 'grid-cols-4' : 'grid-cols-3'
          )}
        >
          <TabsTrigger value='stats'>Stats</TabsTrigger>
          <TabsTrigger value='matches'>Matches</TabsTrigger>
          <TabsTrigger value='tests'>Tests</TabsTrigger>
          {canReadNotes && <TabsTrigger value='notes'>Notes</TabsTrigger>}
        </TabsList>

        <TabsContent value='stats'>
          <PlayerStatsTab selectedPlayer={selectedPlayer} />
        </TabsContent>

        <TabsContent value='matches'>
          <RecentMatchesCard playerId={playerId} />
        </TabsContent>

        <TabsContent value='tests'>
          <PlayerTestsTab
            selectedPlayer={selectedPlayer}
            playerId={playerId}
            onResultAdded={() => fetchPlayer(playerId)}
          />
        </TabsContent>

        {canReadNotes && (
          <TabsContent value='notes'>
            <PlayerNotesTab
              playerId={playerId}
              playerOrganizationId={selectedPlayer?.organizationId}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

export default PlayerDetailPage
