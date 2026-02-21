import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { seedUsers } from './seed-users'
import { seedFederations } from './seed-federations'
import { seedFederationUsers } from './seed-federation-users'
import { seedChampionships } from './seed-championships'
import { seedChampionshipEditions } from './seed-championship-editions'
import { seedOrganizations } from './seed-organizations'
import { seedPlayers } from './seed-players'
import { seedCoaches } from './seed-coaches'
import { seedTrainingSessions } from './seed-sessions'
import { seedTests } from './seed-tests'
import { seedEvents } from './seed-events'
import type {
  SeederContext,
  SeedDataOutput,
  OrganizationSummary,
} from './types'

export const runAllSeeders = async (
  db: NodePgDatabase,
): Promise<SeederContext> => {
  console.log('\n🚀 Starting database seeding...\n')

  // 1. Seed regular users first (independent)
  const regularUsers = await seedUsers(db)

  // 2. Seed federations (independent, but needed before orgs)
  const { federations } = await seedFederations(db, [])

  // 3. Seed federation users (depends on federations)
  const federationUsers = await seedFederationUsers(db, federations)

  // 4. Seed championships (depends on federations)
  const championships = await seedChampionships(db, federations)

  // 5. Seed championship editions (depends on championships)
  const championshipEditions = await seedChampionshipEditions(db, championships)

  // 6. Combine all users
  const users = [...regularUsers, ...federationUsers]

  // 7. Seed organizations and members (depends on users and federations)
  const { organizations, members } = await seedOrganizations(
    db,
    users,
    federations,
  )

  // 8. Update federation clubs links now that we have organizations
  const { federationClubs } = await seedFederations(db, organizations)

  // 9. Seed players (depends on users, organizations, members)
  const players = await seedPlayers(db, users, organizations, members)

  // 10. Seed coaches (depends on users, organizations, members)
  const coaches = await seedCoaches(db, users, organizations, members)

  // 11. Seed training sessions (depends on organizations, players, coaches)
  const trainingSessions = await seedTrainingSessions(
    db,
    organizations,
    players,
    coaches,
  )

  // 12. Seed tests and results (depends on organizations, players)
  const { tests, testResults } = await seedTests(db, organizations, players)

  // 13. Seed events and registrations (groups, matches, sets are created manually)
  const { events, registrations } = await seedEvents(db, organizations, players)

  console.log('\n✅ Database seeding completed!\n')

  return {
    users,
    federations,
    federationClubs,
    championships,
    championshipEditions,
    organizations,
    members,
    players,
    coaches,
    trainingSessions,
    tests,
    testResults,
    events,
    registrations,
  }
}

export const generateSeedDataOutput = (
  context: SeederContext,
): SeedDataOutput => {
  const {
    users,
    federations,
    championships,
    organizations,
    members,
    players,
    coaches,
  } = context

  // Build federation summaries with their championships
  const federationSummaries = federations.map((fed) => {
    const fedChampionships = championships
      .filter((c) => c.federationId === fed.id)
      .map((c) => ({
        id: c.id,
        name: c.name,
        competitionScope: c.competitionScope,
      }))

    return {
      id: fed.id,
      name: fed.name,
      description: fed.description,
      championships: fedChampionships,
    }
  })

  // Build organization summaries (without events as requested)
  const organizationSummaries: OrganizationSummary[] = organizations.map(
    (org) => {
      const orgMembers = members.filter((m) => m.organizationId === org.id)
      const orgPlayers = players.filter((p) => p.organizationId === org.id)
      const orgCoaches = coaches.filter((c) => c.organizationId === org.id)

      // Get user details for members
      const getUserDetails = (userId: string) => {
        const user = users.find((u) => u.id === userId)
        return user
          ? { id: user.id, name: user.name, email: user.email }
          : { id: userId, name: 'Unknown', email: 'unknown@example.com' }
      }

      // Get player details with email if linked to user
      const getPlayerDetails = (player: (typeof players)[0]) => {
        const linkedUser = player.userId
          ? users.find((u) => u.id === player.userId)
          : null
        return {
          id: player.id,
          name: player.name,
          email: linkedUser?.email || null,
        }
      }

      // Get coach details with email if linked to user
      const getCoachDetails = (coach: (typeof coaches)[0]) => {
        const linkedUser = coach.userId
          ? users.find((u) => u.id === coach.userId)
          : null
        return {
          id: coach.id,
          name: coach.name,
          email: linkedUser?.email || null,
        }
      }

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        players: orgPlayers.map(getPlayerDetails),
        coaches: orgCoaches.map(getCoachDetails),
        admins: orgMembers
          .filter((m) => m.role === 'admin')
          .map((m) => getUserDetails(m.userId)),
        owners: orgMembers
          .filter((m) => m.role === 'owner')
          .map((m) => getUserDetails(m.userId)),
        members: orgMembers.map((m) => ({
          ...getUserDetails(m.userId),
          role: m.role,
        })),
      }
    },
  )

  return {
    generatedAt: new Date().toISOString(),
    password: process.env.SEEDER_PASSWORD!,
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      federationId: u.federationId,
    })),
    federations: federationSummaries,
    organizations: organizationSummaries,
  }
}
