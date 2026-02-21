import { scryptAsync } from '@noble/hashes/scrypt.js'
import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { user, account } from '@/db/schema'
import type { SeededUser, SeededFederation } from './types'

const PASSWORD = process.env.SEEDER_PASSWORD!

// Scrypt config matching better-auth's implementation
const scryptConfig = {
  N: 16384,
  r: 16,
  p: 1,
  dkLen: 64,
}

// Hash password using scrypt (exactly matching better-auth's implementation)
const hashPassword = async (password: string): Promise<string> => {
  const salt = bytesToHex(randomBytes(16))
  const key = await scryptAsync(password.normalize('NFKC'), salt, {
    N: scryptConfig.N,
    r: scryptConfig.r,
    p: scryptConfig.p,
    dkLen: scryptConfig.dkLen,
    maxmem: 128 * scryptConfig.N * scryptConfig.r * 2,
  })
  return `${salt}:${bytesToHex(key)}`
}

export const seedFederationUsers = async (
  db: NodePgDatabase,
  federations: SeededFederation[],
): Promise<SeededUser[]> => {
  console.log('🌱 Seeding federation users...')

  const hashedPassword = await hashPassword(PASSWORD)
  const seededUsers: SeededUser[] = []

  // Create 2 federation admins per federation
  for (let i = 0; i < federations.length; i++) {
    const federation = federations[i]

    for (let j = 1; j <= 2; j++) {
      const userNumber = i * 2 + j
      const userName = `Federation Admin ${userNumber}`
      const userEmail = `fed-admin${userNumber}@rowad.com`

      const [createdUser] = await db
        .insert(user)
        .values({
          name: userName,
          email: userEmail,
          emailVerified: true,
          role: 'federation-admin',
          federationId: federation.id,
        })
        .returning()

      // Create credential account for user
      await db.insert(account).values({
        userId: createdUser.id,
        accountId: createdUser.id,
        providerId: 'credential',
        password: hashedPassword,
      })

      seededUsers.push({
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        role: 'federation-admin',
        password: PASSWORD,
        federationId: federation.id,
      })
    }
  }

  // Create 2 federation editors per federation
  for (let i = 0; i < federations.length; i++) {
    const federation = federations[i]

    for (let j = 1; j <= 2; j++) {
      const userNumber = i * 2 + j
      const userName = `Federation Editor ${userNumber}`
      const userEmail = `fed-editor${userNumber}@rowad.com`

      const [createdUser] = await db
        .insert(user)
        .values({
          name: userName,
          email: userEmail,
          emailVerified: true,
          role: 'federation-editor',
          federationId: federation.id,
        })
        .returning()

      // Create credential account for user
      await db.insert(account).values({
        userId: createdUser.id,
        accountId: createdUser.id,
        providerId: 'credential',
        password: hashedPassword,
      })

      seededUsers.push({
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        role: 'federation-editor',
        password: PASSWORD,
        federationId: federation.id,
      })
    }
  }

  console.log(`✅ Created ${seededUsers.length} federation users`)
  console.log(
    `   - ${seededUsers.filter((u) => u.role === 'federation-admin').length} federation admins`,
  )
  console.log(
    `   - ${seededUsers.filter((u) => u.role === 'federation-editor').length} federation editors`,
  )

  return seededUsers
}
