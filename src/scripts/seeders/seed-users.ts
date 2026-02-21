import { scryptAsync } from '@noble/hashes/scrypt.js'
import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { user, account } from '@/db/schema'
import type { SeededUser } from './types'

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

// Admin users with predictable emails
const adminUsers = [
  { name: 'Admin One', email: 'admin1@rowad.com' },
  { name: 'Admin Two', email: 'admin2@rowad.com' },
  { name: 'Admin Three', email: 'admin3@rowad.com' },
]

// Regular users
const regularUsers = Array.from({ length: 22 }, (_, i) => ({
  name: `User ${i + 1}`,
  email: `user${i + 1}@example.com`,
}))

export const seedUsers = async (db: NodePgDatabase): Promise<SeededUser[]> => {
  console.log('🌱 Seeding users...')

  const hashedPassword = await hashPassword(PASSWORD)
  const seededUsers: SeededUser[] = []

  // Create admin users
  for (const adminData of adminUsers) {
    const [createdUser] = await db
      .insert(user)
      .values({
        name: adminData.name,
        email: adminData.email,
        emailVerified: true,
        role: 'admin',
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
      role: 'admin',
      password: PASSWORD,
      federationId: null,
    })
  }

  // Create regular users
  for (const userData of regularUsers) {
    const [createdUser] = await db
      .insert(user)
      .values({
        name: userData.name,
        email: userData.email,
        emailVerified: true,
        role: 'user',
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
      role: 'user',
      password: PASSWORD,
      federationId: null,
    })
  }

  console.log(`✅ Created ${seededUsers.length} users`)
  return seededUsers
}
