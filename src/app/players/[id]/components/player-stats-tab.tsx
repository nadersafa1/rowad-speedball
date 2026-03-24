import { Trophy, BarChart3, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { PlayerWithResults } from '@/types'
import { calculatePlayerStats } from './player-performance-utils'

interface PlayerStatsTabProps {
  selectedPlayer: PlayerWithResults
}

const PlayerStatsTab = ({ selectedPlayer }: PlayerStatsTabProps) => {
  const stats = calculatePlayerStats(selectedPlayer.testResults ?? [])

  if (!stats) {
    return (
      <div className='text-center py-12'>
        <BarChart3 className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
        <h3 className='text-lg font-medium text-foreground mb-2'>
          No Statistics Yet
        </h3>
        <p className='text-muted-foreground'>
          Statistics will appear here once the player has test results.
        </p>
      </div>
    )
  }

  return (
    <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
      <Card>
        <CardContent className='text-center'>
          <Trophy className='h-8 w-8 text-yellow-500 mx-auto mb-2' />
          <p className='text-2xl font-bold text-yellow-600'>
            {stats.bestScore}
          </p>
          <p className='text-sm text-muted-foreground'>Best Score</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className='text-center'>
          <BarChart3 className='h-8 w-8 text-blue-500 mx-auto mb-2' />
          <p className='text-2xl font-bold text-blue-600'>
            {stats.avgScore}
          </p>
          <p className='text-sm text-muted-foreground'>Average Score</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className='text-center'>
          <User className='h-8 w-8 text-green-500 mx-auto mb-2' />
          <p className='text-2xl font-bold text-green-600'>
            {stats.testsCount}
          </p>
          <p className='text-sm text-muted-foreground'>Tests Taken</p>
        </CardContent>
      </Card>
    </div>
  )
}

export default PlayerStatsTab
