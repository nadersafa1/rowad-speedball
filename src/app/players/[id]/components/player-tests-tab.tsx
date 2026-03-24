'use client'

import { useState } from 'react'
import { Trophy, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { useResultPermissions } from '@/hooks/authorization/use-result-permissions'
import ResultsForm from '@/components/results/results-form'
import { formatDate } from '@/lib/utils'
import type { PlayerWithResults } from '@/types'
import { calculateTotalScore } from './player-performance-utils'

interface PlayerTestsTabProps {
  selectedPlayer: PlayerWithResults
  playerId: string
  onResultAdded: () => void
}

const PlayerTestsTab = ({
  selectedPlayer,
  playerId,
  onResultAdded,
}: PlayerTestsTabProps) => {
  const { canCreate } = useResultPermissions(null, null)
  const [resultFormOpen, setResultFormOpen] = useState(false)
  const testResults = selectedPlayer.testResults ?? []

  return (
    <Card>
      <CardHeader>
        <div className='flex justify-between items-start'>
          <div>
            <CardTitle>Test Results History</CardTitle>
            <CardDescription>
              Complete performance history for this player
            </CardDescription>
          </div>

          {canCreate && (
            <Dialog open={resultFormOpen} onOpenChange={setResultFormOpen}>
              <DialogTrigger asChild>
                <Button className='gap-2 bg-green-600 hover:bg-green-700'>
                  <Plus className='h-4 w-4' />
                  Add Result
                </Button>
              </DialogTrigger>
              <ResultsForm
                preselectedPlayerId={playerId}
                onSuccess={() => {
                  setResultFormOpen(false)
                  onResultAdded()
                }}
                onCancel={() => setResultFormOpen(false)}
              />
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {testResults.length > 0 ? (
          <div className='space-y-4'>
            {testResults.map((result, index) => (
              <div
                key={result.id}
                className='border rounded-lg p-4 hover:bg-muted/50 transition-colors'
              >
                <div className='flex justify-between items-start mb-3'>
                  <div>
                    <h3 className='font-semibold'>
                      {result.test?.name || `Test ${index + 1}`}
                    </h3>
                    <p className='text-sm text-muted-foreground'>
                      {result.test?.dateConducted &&
                        formatDate(result.test.dateConducted)}
                    </p>
                  </div>
                  <div className='text-right'>
                    <p className='text-lg font-bold text-rowad-600'>
                      {calculateTotalScore(result)}
                    </p>
                    <p className='text-sm text-muted-foreground'>
                      Total Score
                    </p>
                  </div>
                </div>

                <div className='grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm'>
                  <div className='text-center'>
                    <p className='font-medium'>{result.leftHandScore}</p>
                    <p className='text-muted-foreground'>Left Hand</p>
                  </div>
                  <div className='text-center'>
                    <p className='font-medium'>{result.rightHandScore}</p>
                    <p className='text-muted-foreground'>Right Hand</p>
                  </div>
                  <div className='text-center'>
                    <p className='font-medium'>{result.forehandScore}</p>
                    <p className='text-muted-foreground'>Forehand</p>
                  </div>
                  <div className='text-center'>
                    <p className='font-medium'>{result.backhandScore}</p>
                    <p className='text-muted-foreground'>Backhand</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className='text-center py-8'>
            <Trophy className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
            <h3 className='text-lg font-medium text-foreground mb-2'>
              No Test Results Yet
            </h3>
            <p className='text-muted-foreground'>
              This player hasn&apos;t participated in any tests yet.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default PlayerTestsTab
