import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { admin, organization } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { sendPasswordResetEmail } from '@/actions/emails/send-password-reset-email'
import { sendVerificationEmail } from '@/actions/emails/send-verification-email'
import { sendOrganizationInvitationEmail } from '@/actions/emails/send-organization-invitation-email'
import { sendOrganizationWelcomeEmail } from '@/actions/emails/send-organization-welcome-email'
import { sendOrganizationRemovalEmail } from '@/actions/emails/send-organization-removal-email'
import { db } from '@/lib/db'
import * as schema from '@/db/schema'
import {
  ac,
  admin as adminRole,
  coach,
  member,
  owner,
  player,
  superAdmin,
} from '@/components/auth/permissions'
import {
  getAllAppAdmins,
  addUserToAllOrganizations,
} from '@/lib/organization-helpers'

export const auth = betterAuth({
  appName: 'Rowad Speedball',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  baseURL:
    process.env.NODE_ENV === 'production'
      ? process.env.BETTER_AUTH_URL
      : 'http://localhost:3000',
  trustedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  user: {
    additionalFields: {
      federationId: {
        type: 'string',
        required: false,
        input: true,
      },
    },
  },
  socialProviders: {
    google: {
      enabled: true,
      prompt: 'select_account',
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: true,
    sendResetPassword: sendPasswordResetEmail,
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 1 day
    sendOnSignUp: true,
    sendVerificationEmail: sendVerificationEmail,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60, // 1 minute
    },
  },
  advanced: {
    database: {
      generateId: false,
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (userSession) => {
          // Automatically set active organization if user is member of exactly one organization
          const memberships = await db.query.member.findMany({
            where: eq(schema.member.userId, userSession.userId),
            columns: { organizationId: true },
          })

          // Only set active organization if user has exactly one membership
          const activeOrganizationId =
            memberships.length === 1 ? memberships[0].organizationId : null

          return {
            data: {
              ...userSession,
              activeOrganizationId,
            },
          }
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          // If a new user is created with admin role, add them to all organizations
          if (user.role === 'admin') {
            try {
              await addUserToAllOrganizations(user.id)
            } catch (error) {
              // Log error but don't fail user creation
              console.error(
                'Error adding new admin to all organizations:',
                error,
              )
            }
          }
        },
      },
      update: {
        after: async (user) => {
          // If a user's role is updated to admin, add them to all organizations
          // The addUserToAllOrganizations function will skip organizations where
          // the user is already a member, so it's safe to call even if they're
          // already in some organizations
          if (user.role === 'admin') {
            try {
              await addUserToAllOrganizations(user.id)
            } catch (error) {
              // Log error but don't fail user update
              console.error(
                'Error adding updated admin to all organizations:',
                error,
              )
            }
          }
        },
      },
    },
  },
  plugins: [
    nextCookies(),
    admin({ defaultRole: 'user' }),
    organization({
      schema: {
        organization: {
          additionalFields: {
            federationId: {
              type: 'string',
              required: false,
              input: true,
            },
          },
        },
      },
      ac,
      roles: {
        owner,
        admin: adminRole,
        coach,
        player,
        member,
        superAdmin,
      },
      allowUserToCreateOrganization: (user) => user.role === 'admin',
      creatorRole: 'owner',
      cancelPendingInvitationsOnReInvite: true,
      disableOrganizationDeletion: true,
      membershipLimit: 500,
      // organizationLimit: 1,
      sendInvitationEmail: async ({
        email,
        organization,
        inviter,
        invitation,
      }) => {
        await sendOrganizationInvitationEmail({
          email,
          organization,
          inviter: inviter.user,
          invitation,
        })
      },
      organizationHooks: {
        afterCreateOrganization: async ({ organization, member, user }) => {
          // Automatically add all app admins as organization admins
          try {
            const appAdminIds = await getAllAppAdmins()

            // Filter out the creator (already added) and any admins already in the org
            const existingMemberIds = new Set([member.userId])
            const adminsToAdd = appAdminIds.filter(
              (adminId) => !existingMemberIds.has(adminId),
            )

            if (adminsToAdd.length > 0) {
              const memberValues = adminsToAdd.map((adminId) => ({
                organizationId: organization.id,
                userId: adminId,
                role: 'super_admin' as const,
                createdAt: new Date(),
              }))

              await db.insert(schema.member).values(memberValues)
            }
          } catch (error) {
            // Log error but don't fail organization creation
            console.error('Error adding app admins to organization:', error)
          }
        },
        afterAddMember: async ({ member, user, organization }) => {
          // Send welcome email when a member is added to an organization
          // This hook is triggered for all member additions including:
          // - Manual addition via API
          // - Invitation acceptance
          // - Organization creation (creator)
          try {
            await sendOrganizationWelcomeEmail({
              user,
              organization,
              role: member.role,
            })
          } catch (error) {
            // Log error but don't fail member creation
            console.error('Error sending welcome email:', error)
          }
        },
        afterRemoveMember: async ({ member, user, organization }) => {
          // Send removal email when a member is removed from an organization
          // This hook is triggered when members are removed via better-auth API
          try {
            await sendOrganizationRemovalEmail({
              user,
              organization,
              role: member.role,
            })
          } catch (error) {
            // Log error but don't fail member removal
            console.error('Error sending removal email:', error)
          }
        },
      },
    }),
  ],
})
