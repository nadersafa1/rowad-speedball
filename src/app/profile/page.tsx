import { SinglePageHeader } from '@/components/ui'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import * as schema from '@/db/schema'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { UserCircle } from 'lucide-react'
import { headers } from 'next/headers'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import ChangePasswordForm from './_components/change-password-form'
import CoachProfileForm from './_components/coach-profile-form'
import PlayerProfileForm from './_components/player-profile-form'
import SetPasswordButton from './_components/set-password-button'
import UserProfileForm from './_components/user-profile-form'

const getTabsGridClassName = (tabCount: number) => {
  if (tabCount <= 2) return 'grid-cols-2'
  if (tabCount === 3) return 'grid-cols-3'
  return 'grid-cols-4'
}

const ProfilePage = async () => {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })

  if (!session?.user) {
    return redirect('/auth/login')
  }

  const userId = session.user.id

  // Fetch user data
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
  })

  if (!user) {
    return redirect('/auth/login')
  }

  // Fetch linked player and coach data
  const [player, coach, accounts] = await Promise.all([
    db.query.players.findFirst({
      where: eq(schema.players.userId, userId),
    }),
    db.query.coaches.findFirst({
      where: eq(schema.coaches.userId, userId),
    }),
    auth.api.listUserAccounts({
      headers: requestHeaders,
    }),
  ])

  const hasPasswordAccount = accounts?.some(
    (account) => account.providerId === 'credential'
  )
  const hasPlayerProfile = Boolean(player)
  const hasCoachProfile = Boolean(coach)
  const availableTabs = [
    'account',
    'security',
    ...(hasPlayerProfile ? ['player'] : []),
    ...(hasCoachProfile ? ['coach'] : []),
  ]
  const defaultTab = availableTabs[0] ?? 'account'
  const tabsGridClassName = getTabsGridClassName(availableTabs.length)

  return (
    <div className='container mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-8'>
      <SinglePageHeader />
      <div className='mb-8'>
        <div className='flex items-center gap-4'>
          {user?.image ? (
            <Image
              alt={user.name || 'User'}
              height={64}
              src={user.image}
              width={64}
              className='rounded-full'
            />
          ) : (
            <UserCircle className='size-16 text-muted-foreground' />
          )}
          <div className='flex-1'>
            <h1 className='text-3xl font-bold'>
              {user.name || 'User Profile'}
            </h1>
            <p className='text-sm text-muted-foreground'>{user.email}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className='w-full'>
        <TabsList className={`grid w-full ${tabsGridClassName} mb-6`}>
          <TabsTrigger value='account'>Account</TabsTrigger>
          <TabsTrigger value='security'>Security</TabsTrigger>
          {hasPlayerProfile && <TabsTrigger value='player'>Player</TabsTrigger>}
          {hasCoachProfile && <TabsTrigger value='coach'>Coach</TabsTrigger>}
        </TabsList>

        <TabsContent value='account'>
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your name and email address
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserProfileForm user={user} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='security'>
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>
                {hasPasswordAccount
                  ? 'Change your password for improved security'
                  : 'Set a password for your account'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasPasswordAccount ? (
                <ChangePasswordForm />
              ) : (
                <SetPasswordButton email={user?.email || ''} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {player && (
          <TabsContent value='player'>
            <Card>
              <CardHeader>
                <CardTitle>Player Profile</CardTitle>
                <CardDescription>Update your player information</CardDescription>
              </CardHeader>
              <CardContent>
                <PlayerProfileForm player={player} />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {coach && (
          <TabsContent value='coach'>
            <Card>
              <CardHeader>
                <CardTitle>Coach Profile</CardTitle>
                <CardDescription>Update your coach information</CardDescription>
              </CardHeader>
              <CardContent>
                <CoachProfileForm coach={coach} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

export default ProfilePage
