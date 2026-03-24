import Image from 'next/image'
import {
  User,
  Calendar,
  BadgeCheck,
  UserCircle,
  Hand,
  Building2,
  Cake,
  Users,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { PlayerWithResults } from '@/types'

interface PlayerProfileCardProps {
  selectedPlayer: PlayerWithResults
  userImage: string | null
}

const PlayerProfileCard = ({
  selectedPlayer,
  userImage,
}: PlayerProfileCardProps) => {
  return (
    <Card className='overflow-hidden'>
      <div className='bg-gradient-to-r from-rowad-600 to-rowad-700 h-24 sm:h-32' />
      <CardContent className='-mt-12 sm:-mt-16'>
        <div className='flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6'>
          <div className='relative shrink-0'>
            {userImage ? (
              <Image
                src={userImage}
                alt={selectedPlayer.name}
                width={96}
                height={96}
                className='rounded-full object-cover border-4 border-background shadow-lg w-24 h-24 sm:w-28 sm:h-28'
              />
            ) : (
              <div className='bg-rowad-100 rounded-full p-4 sm:p-5 border-4 border-background shadow-lg'>
                <UserCircle className='h-14 w-14 sm:h-16 sm:w-16 text-rowad-600' />
              </div>
            )}
            {selectedPlayer.userId && (
              <div className='absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1 border-2 border-background'>
                <BadgeCheck className='h-4 w-4 text-white' />
              </div>
            )}
          </div>

          <div className='flex-1 text-center sm:text-left pb-2'>
            <h1 className='text-2xl sm:text-3xl font-bold text-foreground'>
              {selectedPlayer.name}
            </h1>
            {selectedPlayer.nameRtl && (
              <p className='text-lg text-muted-foreground mt-1' dir='rtl'>
                {selectedPlayer.nameRtl}
              </p>
            )}
            <div className='flex flex-wrap justify-center sm:justify-start gap-2 mt-3'>
              <Badge variant='secondary' className='gap-1'>
                <Users className='h-3 w-3' />
                {selectedPlayer.ageGroup}
              </Badge>
              <Badge
                variant='outline'
                className={
                  selectedPlayer.gender === 'male'
                    ? 'border-blue-300 text-blue-700 bg-blue-50'
                    : 'border-pink-300 text-pink-700 bg-pink-50'
                }
              >
                {selectedPlayer.gender === 'male' ? 'Male' : 'Female'}
              </Badge>
              {selectedPlayer.organizationName && (
                <Badge variant='outline' className='gap-1'>
                  <Building2 className='h-3 w-3' />
                  {selectedPlayer.organizationName}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className='grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t'>
          <div className='flex flex-col items-center p-3 rounded-lg bg-muted/50'>
            <Cake className='h-5 w-5 text-muted-foreground mb-1' />
            <span className='text-sm text-muted-foreground'>Age</span>
            <span className='font-semibold'>{selectedPlayer.age} years</span>
          </div>
          <div className='flex flex-col items-center p-3 rounded-lg bg-muted/50'>
            <Calendar className='h-5 w-5 text-muted-foreground mb-1' />
            <span className='text-sm text-muted-foreground'>Birth Date</span>
            <span className='font-semibold'>
              {formatDate(selectedPlayer.dateOfBirth)}
            </span>
          </div>
          <div className='flex flex-col items-center p-3 rounded-lg bg-muted/50'>
            <Hand className='h-5 w-5 text-muted-foreground mb-1' />
            <span className='text-sm text-muted-foreground'>
              Preferred Hand
            </span>
            <span className='font-semibold capitalize'>
              {selectedPlayer.preferredHand}
            </span>
          </div>
          <div className='flex flex-col items-center p-3 rounded-lg bg-muted/50'>
            <User className='h-5 w-5 text-muted-foreground mb-1' />
            <span className='text-sm text-muted-foreground'>Account</span>
            <span className='font-semibold'>
              {selectedPlayer.userId ? 'Linked' : 'Not Linked'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default PlayerProfileCard
