/**
 * Database Schema for Rowad Speedball Management Platform
 *
 * This file defines the PostgreSQL database schema using Drizzle ORM.
 * It includes all tables, relationships, constraints, and helper functions
 * for managing Speedball tournaments, players, events, and championships.
 *
 * **Key Features**:
 * - Multi-tenant organization support
 * - Federation and championship management
 * - Tournament bracket generation (single/double elimination)
 * - Player skill testing and assessment
 * - Training session attendance tracking
 * - Points-based ranking system
 *
 * **Naming Conventions**:
 * - Tables: plural snake_case (players, events, training_sessions)
 * - Columns: camelCase (dateOfBirth, organizationId)
 * - Enums: camelCase with 'Enum' suffix (noteTypeEnum, attendanceStatusEnum)
 * - Indexes: idx_tablename_column
 * - Unique constraints: unique_descriptor
 * - Check constraints: chk_descriptor
 *
 * @see /docs/table-core-guide.md for table system documentation
 * @see /CLAUDE.md for project overview
 */

import {
  pgTable,
  varchar,
  date,
  timestamp,
  uuid,
  text,
  integer,
  boolean,
  pgEnum,
  unique,
  jsonb,
  index,
  check,
  decimal,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { PositionScores } from '@/types/position-scores'
import { parse, getYear, getMonth } from 'date-fns'

// ============================================================================
// AUTHENTICATION & AUTHORIZATION
// ============================================================================
// Tables managed by better-auth for user authentication, sessions, and OAuth

/**
 * User Table
 *
 * Central table for all authenticated users in the system.
 * Managed by better-auth with custom federation support.
 *
 * **Roles**:
 * - `super_admin`: System administrator (unrestricted access)
 * - `federation-admin`: Federation administrator (manages federation)
 * - `federation-editor`: Federation content editor (limited permissions)
 * - `owner`: Organization owner (full organization control)
 * - `admin`: Organization administrator (manages organization)
 * - `coach`: Coach (limited permissions)
 * - `player`: Player (read-only access)
 * - `member`: Basic member access
 *
 * **User Lifecycle**:
 * 1. User signs up via OAuth (Google) or email
 * 2. User is assigned to organizations via `member` table
 * 3. User can be linked to `players` or `coaches` via userId
 * 4. User's federation role is stored in `role` field
 * 5. Active organization stored in session
 *
 * **Important Notes**:
 * - Users can belong to multiple organizations (via `member` table)
 * - Users can have ONE federation role (federation-admin, federation-editor, or null)
 * - Organization roles are stored in `member.role` (owner, admin, coach, member)
 * - User deletion DOES NOT cascade delete players/coaches (set null instead)
 * - Banned users can't log in but data is preserved
 *
 * @see member - Organization memberships
 * @see players - Player profiles linked to users
 * @see coaches - Coach profiles linked to users
 */
export const user = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'), // Profile image URL (from OAuth or upload)
  role: text('role'), // Federation-level role: null | federation-admin | federation-editor
  banned: boolean('banned'), // If true, user cannot log in
  banReason: text('ban_reason'), // Reason for ban (shown to user)
  banExpires: timestamp('ban_expires'), // Optional expiration for temporary bans
  federationId: uuid('federation_id').references(() => federations.id, {
    onDelete: 'set null', // Removing federation doesn't delete users
  }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/**
 * Organization Table
 *
 * Represents clubs, teams, or academies that manage players and events.
 * Managed by better-auth organization plugin with custom federation support.
 *
 * **Multi-tenancy Design**:
 * - Each organization is isolated (players, events, training sessions scoped to org)
 * - Users can be members of multiple organizations
 * - Active organization determined by session.activeOrganizationId
 * - Organizations can belong to a federation for inter-club competitions
 *
 * **Organization Lifecycle**:
 * 1. Organization created by user (becomes owner)
 * 2. Owner invites members via email (invitation table)
 * 3. Members accept invitation and join organization
 * 4. Organization can be linked to federation for championships
 *
 * **Important Notes**:
 * - Slug must be unique and URL-safe (used in routes)
 * - Deleting organization cascades to most related data (players, events, etc.)
 * - Federation link is optional (set null if federation removed)
 *
 * @see member - User-organization relationships
 * @see invitation - Pending organization invitations
 * @see federationClubs - Federation membership
 */
export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(), // URL-safe identifier (e.g., 'rowad-club')
  logo: text('logo'), // Logo image URL
  createdAt: timestamp('created_at').notNull().defaultNow(),
  metadata: text('metadata'), // JSON metadata for future extensibility
  federationId: uuid('federation_id').references(() => federations.id, {
    onDelete: 'set null', // Removing federation doesn't delete organization
  }),
})

/**
 * Member Table
 *
 * Junction table linking users to organizations with role-based access control.
 * Enables multi-tenancy where users can belong to multiple organizations.
 *
 * **Organization Roles**:
 * - `owner`: Full organization control (creator of organization)
 * - `admin`: Organization administrator (can manage members and settings)
 * - `coach`: Coach (limited permissions for training and players)
 * - `member`: Basic member access (read-only for most features)
 *
 * **Important Notes**:
 * - Users can have different roles in different organizations
 * - A user's role in the ACTIVE organization determines their permissions
 * - Active organization is tracked in `session.activeOrganizationId`
 * - Deleting organization cascades to remove all memberships
 * - Deleting user cascades to remove all their memberships
 * - Organization role is SEPARATE from federation role (stored in `user.role`)
 *
 * @see organization - The organization being joined
 * @see user - The user joining the organization
 * @see session.activeOrganizationId - Tracks which org user is currently acting in
 */
export const member = pgTable('member', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').default('member').notNull(), // Organization role: owner | admin | coach | member
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

/**
 * Invitation Table
 *
 * Manages email invitations for users to join organizations.
 * Supports time-limited invitations with role assignment.
 *
 * **Invitation Flow**:
 * 1. Admin/owner invites user by email with assigned role
 * 2. Invitation created with `pending` status and expiration time
 * 3. Invitee receives email with invitation link
 * 4. User accepts → status becomes `accepted`, member record created
 * 5. User declines → status becomes `rejected`
 * 6. Invitation expires → status remains `pending` but unusable
 *
 * **Status Values**:
 * - `pending`: Invitation sent, awaiting response
 * - `accepted`: User accepted and joined organization
 * - `rejected`: User declined the invitation
 *
 * **Important Notes**:
 * - Invitations are time-limited (expires_at)
 * - Deleting organization cascades to remove all invitations
 * - Deleting inviter cascades to remove their sent invitations
 * - Email must match user's registered email to accept
 * - Role is assigned when invitation is created
 *
 * @see organization - The organization being joined
 * @see user.inviterId - The user who sent the invitation
 * @see member - Created when invitation is accepted
 */
export const invitation = pgTable('invitation', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(), // Email address of invitee
  role: text('role'), // Role to assign when accepted: owner | admin | coach | member
  status: text('status').default('pending').notNull(), // pending | accepted | rejected
  expiresAt: timestamp('expires_at').notNull(), // Invitation expiration time
  inviterId: uuid('inviter_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

/**
 * Session Table
 *
 * Manages user authentication sessions with organization context.
 * Managed by better-auth with custom multi-tenancy support.
 *
 * **Session Lifecycle**:
 * 1. User logs in → session created with unique token
 * 2. Session token stored in HTTP-only cookie
 * 3. User selects organization → `activeOrganizationId` updated
 * 4. Each request includes session token for authentication
 * 5. Session expires → user must re-authenticate
 *
 * **Active Organization Context**:
 * - `activeOrganizationId` determines which organization user is working in
 * - Permissions are calculated based on active organization role
 * - Users can switch between organizations they belong to
 * - Organization context cached in better-auth cookie cache (1 minute)
 *
 * **Security Features**:
 * - IP address tracking for security monitoring
 * - User agent tracking for device identification
 * - Impersonation support for admin debugging
 * - Automatic expiration for security
 *
 * **Important Notes**:
 * - Token must be unique and cryptographically secure
 * - Deleting user cascades to remove all their sessions (auto-logout)
 * - Deleting organization sets activeOrganizationId to null (not cascade)
 * - Session expiration is enforced on every request
 *
 * @see user - The authenticated user
 * @see organization - The active organization context
 * @see member - User's organization memberships
 */
export const session = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  expiresAt: timestamp('expires_at').notNull(), // Session expiration timestamp
  token: text('token').notNull().unique(), // Unique session token (stored in cookie)
  ipAddress: text('ip_address'), // IP address for security tracking
  userAgent: text('user_agent'), // Browser/device identifier
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  impersonatedBy: text('impersonated_by'), // Admin user ID if impersonating
  activeOrganizationId: uuid('active_organization_id').references(
    () => organization.id,
    { onDelete: 'set null' } // Nullify if organization deleted
  ),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/**
 * Account Table
 *
 * Stores OAuth provider accounts and credentials for users.
 * Managed by better-auth for social login (Google OAuth) and email/password authentication.
 *
 * **Supported Providers**:
 * - `google`: Google OAuth (primary authentication method)
 * - `credentials`: Email/password authentication
 *
 * **Account Types**:
 *
 * **OAuth Accounts (Google)**:
 * - `accountId`: Provider's user ID (e.g., Google user ID)
 * - `providerId`: "google"
 * - `accessToken`: OAuth access token (for API calls)
 * - `refreshToken`: OAuth refresh token (to renew access)
 * - `idToken`: JWT token from provider
 * - `scope`: OAuth permissions granted
 *
 * **Email/Password Accounts**:
 * - `accountId`: User's email
 * - `providerId`: "credentials"
 * - `password`: Hashed password (bcrypt)
 * - No tokens stored
 *
 * **Important Notes**:
 * - One user can have multiple accounts (Google + email/password)
 * - Deleting user cascades to remove all their accounts
 * - Tokens are automatically refreshed by better-auth
 * - Access tokens expire (tracked in accessTokenExpiresAt)
 * - Passwords are hashed before storage (never plain text)
 *
 * @see user - The user owning this account
 * @see session - Active user sessions
 */
export const account = pgTable('account', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id').notNull(), // Provider's user ID or email
  providerId: text('provider_id').notNull(), // google | credentials
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), // OAuth access token (Google)
  refreshToken: text('refresh_token'), // OAuth refresh token (Google)
  idToken: text('id_token'), // JWT token from provider (Google)
  accessTokenExpiresAt: timestamp('access_token_expires_at'), // Token expiration
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'), // Refresh expiration
  scope: text('scope'), // OAuth permissions (Google)
  password: text('password'), // Hashed password (credentials provider only)
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/**
 * Verification Table
 *
 * Stores verification tokens for email verification and password resets.
 * Managed by better-auth for secure token-based verification flows.
 *
 * **Verification Types**:
 *
 * **Email Verification**:
 * - `identifier`: User's email address
 * - `value`: Random verification token (sent via email)
 * - User clicks link with token to verify email
 * - Token consumed after verification (deleted)
 *
 * **Password Reset**:
 * - `identifier`: User's email address
 * - `value`: Random reset token (sent via email)
 * - User clicks link with token to reset password
 * - Token consumed after password change (deleted)
 *
 * **Security Features**:
 * - Tokens are time-limited (expiresAt)
 * - Tokens are cryptographically random
 * - Tokens are single-use (deleted after consumption)
 * - Expired tokens are automatically invalid
 *
 * **Important Notes**:
 * - One identifier can have multiple pending tokens (latest is used)
 * - Expired tokens should be cleaned up periodically
 * - Tokens are NOT linked to user table (pre-verification state)
 * - Never log or expose token values
 *
 * @see user.emailVerified - Set to true after verification
 * @see account.password - Updated during password reset
 */
export const verification = pgTable('verification', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(), // Email address
  value: text('value').notNull(), // Verification/reset token
  expiresAt: timestamp('expires_at').notNull(), // Token expiration
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/**
 * Players Table
 *
 * Central table for player profiles and information.
 * Players are the primary participants in events, training sessions, and tests.
 *
 * **Player Attributes**:
 * - Name in both LTR and RTL (Arabic) formats
 * - Date of birth (used for age group calculation)
 * - Gender (male/female - affects event eligibility)
 * - Preferred hand (left/right/both - tracked for skill development)
 * - Team level (team_a/team_b/team_c - skill grouping within organization)
 *
 * **User Linking**:
 * - Players can be linked to user accounts via `userId` (optional)
 * - Linked players can access their profile and results
 * - One user can only be linked to ONE player (unique constraint)
 * - Player deletion sets userId to null (preserves user account)
 *
 * **Age Groups**:
 * - Calculated dynamically using `getAgeGroup(dateOfBirth)`
 * - Season-based (July-June): Age groups change mid-year
 * - Groups: mini, U-09, U-11, U-13, U-15, U-17, U-19, U-21, Seniors
 *
 * **Multi-tenancy**:
 * - Players belong to ONE organization
 * - Organization deletion sets organizationId to null (orphaned players)
 * - Players can be registered in federation via season registrations
 *
 * **Important Notes**:
 * - Age is calculated dynamically (not stored)
 * - Team level is organization-specific (team_a in one org ≠ team_a in another)
 * - Players can participate in events matching their gender and age group
 * - Preferred hand used for position assignment in doubles/relay events
 *
 * @see federationMembers - Federation membership
 * @see seasonPlayerRegistrations - Season registrations
 * @see registrationPlayers - Event registrations
 * @see testResults - Test scores
 * @see trainingSessionAttendance - Training attendance
 */
export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    nameRtl: varchar('name_rtl', { length: 255 }),
    dateOfBirth: date('date_of_birth').notNull(),
    gender: text('gender', { enum: ['male', 'female'] }).notNull(),
    preferredHand: text('preferred_hand', {
      enum: ['left', 'right', 'both'],
    }).notNull(),
    teamLevel: text('team_level', {
      enum: ['team_a', 'team_b', 'team_c'],
    })
      .notNull()
      .default('team_c'),
    userId: uuid('user_id')
      .references(() => user.id, { onDelete: 'set null' })
      .unique(),
    organizationId: uuid('organization_id').references(() => organization.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_players_organization_id').on(table.organizationId),
    index('idx_players_gender').on(table.gender),
    index('idx_players_team_level').on(table.teamLevel),
    index('idx_players_org_gender_team').on(
      table.organizationId,
      table.gender,
      table.teamLevel
    ),
  ]
)

/**
 * Calculate a player's age using season-based logic
 *
 * **Season-Based Age Calculation**:
 * The sports season runs from July 1 to June 30 of the following year.
 * A player's age is determined by the year they turn that age during the current season.
 *
 * **Logic**:
 * - **July 1 - December 31** (months 7-12): New season starts
 *   → Age = currentYear - birthYear
 *   → Example: Born 2010, current date July 2024 → Age = 2024 - 2010 = 14
 *
 * - **January 1 - June 30** (months 1-6): Still in previous season
 *   → Age = currentYear - birthYear - 1
 *   → Example: Born 2010, current date March 2024 → Age = 2024 - 2010 - 1 = 13
 *
 * **Why This Matters**:
 * - Ensures fair competition by grouping players who turn the same age in the same season
 * - Prevents age advantage from birth month within a calendar year
 * - Aligns with how most youth sports leagues organize age groups
 *
 * **Examples**:
 * - Player born May 15, 2010:
 *   - On July 1, 2024: Age = 14 (new season, they will turn 14 this season)
 *   - On April 1, 2024: Age = 13 (previous season, they haven't turned 14 yet this season)
 *
 * - Player born October 20, 2010:
 *   - On July 1, 2024: Age = 14 (new season)
 *   - On November 1, 2024: Age = 14 (same season, already 14)
 *
 * @param dateOfBirth - Date of birth in 'yyyy-MM-dd' format
 * @returns Calculated age as integer
 */
export const calculateAge = (dateOfBirth: string): number => {
  const today = new Date()
  const currentYear = getYear(today)
  const currentMonth = getMonth(today) + 1 // getMonth is 0-indexed (0 = Jan)

  // Parse date safely as local (avoids UTC timezone issues)
  // Using 'yyyy-MM-dd' format ensures consistent parsing across timezones
  const birthDate = parse(dateOfBirth, 'yyyy-MM-dd', new Date())
  const birthYear = getYear(birthDate)

  // Season boundary check: July (month 7) starts the new season
  const isFirstHalf = currentMonth <= 6 // Jan-Jun (previous season)
  const isSecondHalf = !isFirstHalf // Jul-Dec (new season)

  // Calculate age based on season
  if (isSecondHalf) {
    // New season (Jul-Dec): Player's age is what they turn this year
    return currentYear - birthYear
  } else {
    // Previous season (Jan-Jun): Player's age is what they turned last year
    return currentYear - birthYear - 1
  }
}

/**
 * Determine a player's age group based on their calculated age
 *
 * **Age Group Categories**:
 * - **mini**: Ages 2-7 (introductory level)
 * - **U-09**: Ages 8-9 (Under 9)
 * - **U-11**: Ages 10-11 (Under 11)
 * - **U-13**: Ages 12-13 (Under 13)
 * - **U-15**: Ages 14-15 (Under 15)
 * - **U-17**: Ages 16-17 (Under 17)
 * - **U-19**: Ages 18-19 (Under 19)
 * - **U-21**: Ages 20-21 (Under 21)
 * - **Seniors**: Ages 22+ (adult level)
 *
 * **Important Notes**:
 * - Age groups use the season-based age from calculateAge()
 * - "U-XX" means "Under XX" (player will be XX or younger during the season)
 * - Age group boundaries are inclusive (U-09 includes both 8 and 9 year olds)
 *
 * **Examples**:
 * - Age 7 → "mini"
 * - Age 9 → "U-09"
 * - Age 13 → "U-13"
 * - Age 22 → "Seniors"
 *
 * @param dateOfBirth - Date of birth in 'yyyy-MM-dd' format
 * @returns Age group string (e.g., "U-13", "Seniors")
 */
export const getAgeGroup = (dateOfBirth: string): string => {
  const age = calculateAge(dateOfBirth)

  // Age group boundaries (inclusive upper bounds)
  if (age <= 7) return 'mini' // Ages 2-7
  if (age <= 9) return 'U-09' // Ages 8-9
  if (age <= 11) return 'U-11' // Ages 10-11
  if (age <= 13) return 'U-13' // Ages 12-13
  if (age <= 15) return 'U-15' // Ages 14-15
  if (age <= 17) return 'U-17' // Ages 16-17
  if (age <= 19) return 'U-19' // Ages 18-19
  if (age <= 21) return 'U-21' // Ages 20-21
  return 'Seniors' // Ages 22+
}

// Note Type Enum
export const noteTypeEnum = pgEnum('note_type', [
  'performance',
  'medical',
  'behavioral',
  'general',
])

// Player Notes Table
export const playerNotes = pgTable(
  'player_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    noteType: noteTypeEnum('note_type').notNull().default('general'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    updatedBy: uuid('updated_by').references(() => user.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_player_notes_player_id').on(table.playerId),
    index('idx_player_notes_note_type').on(table.noteType),
    index('idx_player_notes_organization_id').on(table.organizationId),
  ]
)

export type PlayerNote = typeof playerNotes.$inferSelect

// Tests Table
export const tests = pgTable(
  'tests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    playingTime: integer('playing_time').notNull(),
    recoveryTime: integer('recovery_time').notNull(),
    dateConducted: date('date_conducted').notNull(),
    description: text('description'),
    visibility: text('visibility', { enum: ['public', 'private', 'coaches-only'] })
      .notNull()
      .default('public'),
    organizationId: uuid('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_tests_organization_id').on(table.organizationId),
    index('idx_tests_visibility').on(table.visibility),
    index('idx_tests_date_conducted').on(table.dateConducted),
  ]
)

// Test Results Table
export const testResults = pgTable(
  'test_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .references(() => players.id, { onDelete: 'cascade' })
      .notNull(),
    testId: uuid('test_id')
      .references(() => tests.id, { onDelete: 'cascade' })
      .notNull(),
    leftHandScore: integer('left_hand_score').notNull(),
    rightHandScore: integer('right_hand_score').notNull(),
    forehandScore: integer('forehand_score').notNull(),
    backhandScore: integer('backhand_score').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Unique constraint: one result per player per test
    unique('unique_player_test').on(table.playerId, table.testId),
    // Constraints: scores must be non-negative
    check('chk_left_hand_score_non_negative', sql`${table.leftHandScore} >= 0`),
    check(
      'chk_right_hand_score_non_negative',
      sql`${table.rightHandScore} >= 0`
    ),
    check('chk_forehand_score_non_negative', sql`${table.forehandScore} >= 0`),
    check('chk_backhand_score_non_negative', sql`${table.backhandScore} >= 0`),
    // Indexes for performance
    index('idx_test_results_player_id').on(table.playerId),
    index('idx_test_results_test_id').on(table.testId),
    index('idx_test_results_player_test').on(table.playerId, table.testId),
  ]
)

export const calculateTotalScore = (
  result: Pick<
    typeof testResults.$inferSelect,
    'leftHandScore' | 'rightHandScore' | 'forehandScore' | 'backhandScore'
  >
): number => {
  return (
    result.leftHandScore +
    result.rightHandScore +
    result.forehandScore +
    result.backhandScore
  )
}

// Events Table
// NOTE: eventType enum values must match EVENT_TYPES in src/types/event-types.ts
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    eventType: text('event_type', {
      enum: [
        'super-solo',
        'speed-solo',
        'juniors-solo',
        'singles',
        'solo-teams',
        'speed-solo-teams',
        'singles-teams',
        'doubles',
        'relay',
      ],
    }).notNull(),
    gender: text('gender', { enum: ['male', 'female', 'mixed'] }).notNull(),
    format: text('format', {
      enum: [
        'groups',
        'single-elimination',
        'groups-knockout',
        'double-elimination',
        'tests',
      ],
    })
      .notNull()
      .default('groups'),
    hasThirdPlaceMatch: boolean('has_third_place_match').default(false),
    visibility: text('visibility', { enum: ['public', 'private'] })
      .notNull()
      .default('public'),
    minPlayers: integer('min_players').notNull().default(1),
    maxPlayers: integer('max_players').notNull().default(2),
    registrationStartDate: date('registration_start_date'),
    registrationEndDate: date('registration_end_date'),
    eventDates: text('event_dates').array(), // Array of date strings
    bestOf: integer('best_of').notNull(), // Must be odd: 1, 3, 5, 7, etc.
    pointsPerWin: integer('points_per_win').notNull().default(3),
    pointsPerLoss: integer('points_per_loss').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    // For double-elimination: how many rounds before finals the losers bracket starts
    // null = full double elimination, 2 = starts at QF (for 16 players), 1 = starts at SF
    losersStartRoundsBeforeFinal: integer('losers_start_rounds_before_final'),
    // For test events: number of players per heat (default 8)
    playersPerHeat: integer('players_per_heat'),
    championshipEditionId: uuid('championship_edition_id').references(
      () => championshipEditions.id,
      {
        onDelete: 'cascade',
      }
    ),
    // Championship-specific metadata (only set when event is part of a championship)
    // format field already determines placement calculation:
    // - 'groups' → round_robin resolver
    // - 'single-elimination' → single_elim resolver
    // - 'double-elimination' → double_elim resolver
    // - 'groups-knockout' → mixed resolver (groups then knockout)
    pointsSchemaId: uuid('points_schema_id')
      .notNull()
      .references(() => pointsSchemas.id, {
        onDelete: 'restrict',
      }), // Points schema for championship events
    organizationId: uuid('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    trainingSessionId: uuid('training_session_id').references(
      () => trainingSessions.id,
      {
        onDelete: 'cascade',
      }
    ),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Data integrity constraints
    check(
      'chk_max_gte_min_players',
      sql`${table.maxPlayers} >= ${table.minPlayers}`
    ),
    // Ensure bestOf is odd (1, 3, 5, 7, etc.) for proper match scoring
    check('chk_best_of_odd', sql`${table.bestOf} % 2 = 1`),
    check('chk_best_of_positive', sql`${table.bestOf} > 0`),
    // Ensure playersPerHeat is at least 2 when specified
    check(
      'chk_players_per_heat_min',
      sql`${table.playersPerHeat} IS NULL OR ${table.playersPerHeat} >= 2`
    ),
    // Indexes for frequently queried columns
    index('idx_events_organization_id').on(table.organizationId),
    index('idx_events_event_type').on(table.eventType),
    index('idx_events_visibility').on(table.visibility),
    index('idx_events_completed').on(table.completed),
    index('idx_events_championship_edition_id').on(table.championshipEditionId),
    index('idx_events_points_schema_id').on(table.pointsSchemaId),
  ]
)

// Groups Table
export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 10 }).notNull(), // Auto-generated: A, B, C...
    completed: boolean('completed').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_groups_event_id').on(table.eventId)]
)

// Registrations Table
export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => groups.id, {
      onDelete: 'set null',
    }),
    seed: integer('seed'), // Seeding rank for SE events (1 = top seed)
    matchesWon: integer('matches_won').notNull().default(0),
    matchesLost: integer('matches_lost').notNull().default(0),
    setsWon: integer('sets_won').notNull().default(0),
    setsLost: integer('sets_lost').notNull().default(0),
    points: integer('points').notNull().default(0),
    qualified: boolean('qualified').notNull().default(false),
    teamName: varchar('team_name', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_registrations_event_id').on(table.eventId),
    index('idx_registrations_group_id').on(table.groupId),
  ]
)

// Registration Players Junction Table (many-to-many)
export const registrationPlayers = pgTable(
  'registration_players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    // Position scores: { R?: number | null, L?: number | null, F?: number | null, B?: number | null }
    // Keys represent positions (R=Right, L=Left, F=Forehand, B=Backhand)
    // Values: null = position assigned but score pending, number = score entered
    // Nullable: null means no positions assigned yet
    positionScores: jsonb('position_scores').$type<PositionScores>(),
    // Order for play sequence and display (1, 2, 3...)
    order: integer('order').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('unique_registration_player').on(
      table.registrationId,
      table.playerId
    ),
    // GIN index for efficient JSONB queries on position_scores
    index('idx_registration_players_position_scores').using(
      'gin',
      table.positionScores
    ),
  ]
)

// Matches Table
export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => groups.id, {
      onDelete: 'cascade',
    }),
    round: integer('round').notNull(),
    matchNumber: integer('match_number').notNull(),
    // Nullable for BYE matches in single elimination
    registration1Id: uuid('registration1_id').references(
      () => registrations.id,
      {
        onDelete: 'cascade',
      }
    ),
    registration2Id: uuid('registration2_id').references(
      () => registrations.id,
      {
        onDelete: 'cascade',
      }
    ),
    matchDate: date('match_date'),
    played: boolean('played').notNull().default(false),
    winnerId: uuid('winner_id').references(() => registrations.id, {
      onDelete: 'set null',
    }),
    // Bracket columns
    bracketPosition: integer('bracket_position'), // Unique position in bracket for rendering
    winnerTo: uuid('winner_to'), // Self-reference to next match (winner advances here)
    winnerToSlot: integer('winner_to_slot'), // Which slot (1 or 2) winner occupies in next match
    loserTo: uuid('loser_to'), // Self-reference for loser routing (double elimination)
    loserToSlot: integer('loser_to_slot'),
    bracketType: text('bracket_type', { enum: ['winners', 'losers'] }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Constraints for data integrity
    // Round and matchNumber must be positive
    check('chk_round_positive', sql`${table.round} > 0`),
    check('chk_match_number_positive', sql`${table.matchNumber} > 0`),
    // Registrations should be different when both are present
    check(
      'chk_different_registrations',
      sql`${table.registration1Id} IS NULL OR ${table.registration2Id} IS NULL OR ${table.registration1Id} != ${table.registration2Id}`
    ),
    // Winner must be one of the registrations when match is played
    check(
      'chk_winner_valid',
      sql`${table.played} = false OR ${table.winnerId} IS NULL OR ${table.winnerId} = ${table.registration1Id} OR ${table.winnerId} = ${table.registration2Id}`
    ),
    // Indexes for performance
    index('idx_matches_event_id').on(table.eventId),
    index('idx_matches_group_id').on(table.groupId),
    index('idx_matches_played').on(table.played),
    index('idx_matches_winner_id').on(table.winnerId),
    index('idx_matches_registration1_id').on(table.registration1Id),
    index('idx_matches_registration2_id').on(table.registration2Id),
    index('idx_matches_event_round').on(table.eventId, table.round),
  ]
)

// Sets Table
export const sets = pgTable(
  'sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    setNumber: integer('set_number').notNull(),
    registration1Score: integer('registration1_score').notNull(),
    registration2Score: integer('registration2_score').notNull(),
    played: boolean('played').notNull().default(false), // Sequential validation required
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Unique constraint: one set number per match
    unique('unique_match_set_number').on(table.matchId, table.setNumber),
    // Constraints: scores must be non-negative, set number must be positive
    check('chk_set_number_positive', sql`${table.setNumber} > 0`),
    check('chk_reg1_score_non_negative', sql`${table.registration1Score} >= 0`),
    check('chk_reg2_score_non_negative', sql`${table.registration2Score} >= 0`),
    // Indexes for performance
    index('idx_sets_match_id').on(table.matchId),
    index('idx_sets_match_set_number').on(table.matchId, table.setNumber),
  ]
)

// Coaches Table
export const coaches = pgTable(
  'coaches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    nameRtl: varchar('name_rtl', { length: 255 }),
    gender: text('gender', { enum: ['male', 'female'] }).notNull(),
    userId: uuid('user_id')
      .references(() => user.id, { onDelete: 'set null' })
      .unique(),
    organizationId: uuid('organization_id').references(() => organization.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_coaches_organization_id').on(table.organizationId),
    index('idx_coaches_gender').on(table.gender),
  ]
)

// Training Sessions Table
export const trainingSessions = pgTable(
  'training_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    intensity: text('intensity', {
      enum: ['high', 'normal', 'low'],
    })
      .notNull()
      .default('normal'),
    type: text('type').array().notNull(),
    date: date('date').notNull(),
    description: text('description'),
    ageGroups: text('age_groups').array().notNull(),
    organizationId: uuid('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_training_sessions_organization_id').on(table.organizationId),
    index('idx_training_sessions_date').on(table.date),
    index('idx_training_sessions_org_date').on(
      table.organizationId,
      table.date
    ),
  ]
)

// Training Session Coaches Junction Table
export const trainingSessionCoaches = pgTable(
  'training_session_coaches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trainingSessionId: uuid('training_session_id')
      .notNull()
      .references(() => trainingSessions.id, { onDelete: 'cascade' }),
    coachId: uuid('coach_id')
      .notNull()
      .references(() => coaches.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('unique_session_coach').on(table.trainingSessionId, table.coachId),
  ]
)

// Attendance Status Enum
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'pending',
  'present',
  'late',
  'absent_excused',
  'absent_unexcused',
  'suspended',
])

// Training Session Attendance Table
export const trainingSessionAttendance = pgTable(
  'training_session_attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    trainingSessionId: uuid('training_session_id')
      .notNull()
      .references(() => trainingSessions.id, { onDelete: 'cascade' }),
    status: attendanceStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('unique_player_session').on(table.playerId, table.trainingSessionId),
    index('idx_attendance_player_id').on(table.playerId),
    index('idx_attendance_session_id').on(table.trainingSessionId),
    index('idx_attendance_status').on(table.status),
    index('idx_attendance_player_status').on(table.playerId, table.status),
  ]
)

/**
 * Federations Table
 *
 * Top-level organizations that manage multiple clubs and run championships.
 * Federations are the highest level in the organizational hierarchy.
 *
 * **Organizational Hierarchy**:
 * - Federation (top level) → Championships → Organizations (clubs)
 * - Federations organize inter-club competitions and championships
 * - Organizations (clubs) belong to federations for competitive play
 *
 * **Federation Roles**:
 * - Users can have federation-level roles (`user.role`):
 *   - `federation-admin`: Full federation management access
 *   - `federation-editor`: Content editing permissions (events, editions)
 *
 * **Important Notes**:
 * - Federations are created by system admins only
 * - Deleting federation cascades to championships, but NOT to organizations (set null)
 * - Federation membership tracked in `federationClubs` junction table
 * - Federation player membership tracked in `federationMembers` table
 *
 * @see federationClubs - Club memberships in federation
 * @see federationMembers - Player memberships in federation
 * @see championships - Competitions organized by federation
 * @see user.role - Federation-level user roles
 * @see organization.federationId - Organizations linked to federation
 */
export const federations = pgTable('federations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(), // Federation name (e.g., "Egyptian Speedball Federation")
  description: text('description'), // Optional description of federation's purpose
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/**
 * Federation Clubs Junction Table
 *
 * Many-to-many relationship between federations and organizations (clubs).
 * Tracks which clubs are members of which federations for competitive play.
 *
 * **Membership Model**:
 * - Organizations (clubs) can belong to ONE federation
 * - Federations can have MANY member organizations
 * - Membership enables clubs to participate in federation championships
 *
 * **Important Notes**:
 * - One organization can only be linked to one federation (unique constraint)
 * - Deleting federation cascades to remove all club memberships
 * - Deleting organization cascades to remove its federation membership
 * - Federation membership is required for "clubs" scope championships
 *
 * @see federations - The parent federation
 * @see organization - The member club
 * @see championships.competitionScope - Clubs vs Open competition types
 */
export const federationClubs = pgTable(
  'federation_clubs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    federationId: uuid('federation_id')
      .notNull()
      .references(() => federations.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // Unique constraint to prevent duplicate federation-organization links
    unique('unique_federation_organization').on(
      table.federationId,
      table.organizationId
    ),
    // Indexes for efficient lookups
    index('idx_federation_clubs_federation_id').on(table.federationId),
    index('idx_federation_clubs_organization_id').on(table.organizationId),
  ]
)

/**
 * Federation Club Requests Table
 *
 * Tracks club requests to join federations with approval workflow.
 * Enables clubs to apply for federation membership and federation admins to review.
 *
 * **Request Workflow**:
 * 1. Club admin initiates request to join federation
 * 2. Request created with status 'pending'
 * 3. Federation admin reviews and approves/rejects
 * 4. On approval: Record created in `federationClubs` table
 * 5. On rejection: Status updated to 'rejected'
 *
 * **Status Flow**:
 * - `pending`: Awaiting federation admin review
 * - `approved`: Accepted and club added to federation
 * - `rejected`: Declined by federation admin
 *
 * **Authorization**:
 * - Create: Club admins/owners (for their organization)
 * - Update (Approve/Reject): Federation admins/editors
 * - Read: Federation admins (all requests), Club admins (their own requests)
 * - Delete: System admins only (cleanup)
 *
 * **Important Notes**:
 * - One pending request per organization (constraint enforced)
 * - Approved requests create entry in `federationClubs`
 * - Deleting federation cascades to delete all pending requests
 * - Deleting organization cascades to delete its pending requests
 * - After approval, request status updated but record kept for audit trail
 *
 * @see federations - The target federation
 * @see organization - The requesting club
 * @see federationClubs - Created after approval
 * @see user - Federation admin who responded to request
 */
export const federationClubRequests = pgTable(
  'federation_club_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    federationId: uuid('federation_id')
      .notNull()
      .references(() => federations.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    requestedAt: timestamp('requested_at').notNull().defaultNow(),
    respondedAt: timestamp('responded_at'), // When admin approved/rejected
    respondedBy: uuid('responded_by').references(() => user.id, {
      onDelete: 'set null',
    }), // Federation admin who processed the request
    rejectionReason: text('rejection_reason'), // Optional reason for rejection
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Ensure one pending request per organization-federation pair
    unique('unique_pending_federation_request').on(
      table.organizationId,
      table.federationId,
      table.status
    ),
    // Indexes for efficient lookups
    index('idx_federation_requests_federation_id').on(table.federationId),
    index('idx_federation_requests_organization_id').on(table.organizationId),
    index('idx_federation_requests_status').on(table.status),
  ]
)

/**
 * Championships Table
 *
 * Defines championship competitions organized by federations.
 * Championships are multi-year/recurring competitions (e.g., "National Championship").
 * Each championship has multiple editions (yearly instances).
 *
 * **Championship Structure**:
 * - Championship (this table): The recurring competition definition
 * - Championship Edition: Yearly instance with specific dates and events
 * - Events: Individual competitions within an edition (U-13 Singles, U-15 Doubles, etc.)
 *
 * **Competition Scopes**:
 * - **`clubs`**: Only federation member clubs can participate
 *   - Players must be registered with a club in the federation
 *   - Enforced via `federationClubs` membership
 * - **`open`**: Anyone can participate
 *   - No club membership required
 *   - Open to all eligible players
 *
 * **Authorization**:
 * - Create: System admins or federation admins
 * - Update: System admins, federation admins/editors (for their federation)
 * - Delete: System admins or federation admins (for their federation)
 * - Read: Any authenticated user
 *
 * **Important Notes**:
 * - Championships belong to ONE federation (required)
 * - Deleting federation cascades to delete all its championships
 * - Deleting championship cascades to delete all its editions and events
 * - Competition scope cannot be changed after creation (affects registration rules)
 *
 * @see federations - The federation organizing this championship
 * @see championshipEditions - Yearly instances of this championship
 * @see events.championshipEditionId - Events linked to edition
 * @see federationClubs - Club memberships for "clubs" scope
 */
export const championships = pgTable(
  'championships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    federationId: uuid('federation_id')
      .notNull()
      .references(() => federations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(), // Championship name (e.g., "National Speedball Championship")
    description: text('description'), // Optional description of championship purpose and history
    competitionScope: text('competition_scope', { enum: ['clubs', 'open'] })
      .notNull()
      .default('clubs'), // Clubs: federation members only, Open: anyone
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_championships_federation_id').on(table.federationId)]
)

/**
 * Championship Editions Table
 *
 * Yearly instances of championships with specific dates and events.
 * Each edition represents a single year's iteration of a recurring championship.
 *
 * **Edition Lifecycle**:
 * 1. **Draft**: Edition created, events being planned, not visible to public
 * 2. **Published**: Edition is live, registration open, events visible
 * 3. **Archived**: Edition completed, results finalized, read-only
 *
 * **Edition Structure**:
 * - One championship can have multiple editions (2024, 2025, 2026, etc.)
 * - Each edition has its own events (U-13 Singles, U-15 Doubles, etc.)
 * - Each edition has its own registration period
 * - Events within an edition share the same points schema
 *
 * **Status Transitions**:
 * - Draft → Published: When ready to accept registrations
 * - Published → Archived: When all events completed
 * - Cannot transition back to draft once published
 *
 * **Registration Dates**:
 * - `registrationStartDate`: When players can start registering
 * - `registrationEndDate`: Last day for registration
 * - Both optional (can use edition-level or event-level dates)
 * - Event-specific dates override edition dates
 *
 * **Authorization**:
 * - Create: System admins, federation admins/editors (for their federation)
 * - Update: System admins, federation admins/editors (for their federation)
 * - Delete: System admins, federation admins (for their federation, editors cannot delete)
 * - Read: Any authenticated user
 *
 * **Important Notes**:
 * - One edition per year per championship (unique constraint on championshipId + year)
 * - Deleting championship cascades to delete all its editions
 * - Deleting edition cascades to delete all its events
 * - Cannot delete edition if it has events (enforced in API)
 * - Year must be between 2000-2100 (database constraint)
 *
 * @see championships - The parent championship
 * @see events.championshipEditionId - Events in this edition
 * @see eventResults - Results from edition events
 */
export const championshipEditions = pgTable(
  'championship_editions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    championshipId: uuid('championship_id')
      .notNull()
      .references(() => championships.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['draft', 'published', 'archived'] })
      .notNull()
      .default('draft'), // Draft: planning, Published: active, Archived: completed
    registrationStartDate: date('registration_start_date'), // Optional: when registration opens
    registrationEndDate: date('registration_end_date'), // Optional: when registration closes

    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, {
        onDelete: 'restrict',
      }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_editions_status').on(table.status),
    index('idx_editions_season_id').on(table.seasonId),
  ]
)

/**
 * Placement Tiers Table
 *
 * **Purpose**: Standardized placement categories that work across all event types.
 * Placement tiers group participants by their achievement level, regardless of
 * the event format (elimination, time-based, round-robin, etc.).
 *
 * **Tier Categories by Event Type**:
 *
 * **Elimination Events** (single-elimination, double-elimination):
 * - **WINNER** (rank: 1) - Champion of the event
 * - **FINALIST** (rank: 2) - Runner-up, lost in the final
 * - **THIRD_PLACE** (rank: 3) - Winner of 3rd place match (only if hasThirdPlaceMatch = true)
 * - **FOURTH_PLACE** (rank: 4) - Loser of 3rd place match (only if hasThirdPlaceMatch = true)
 * - **SF** (rank: 3-4) - Semi-final losers (when no 3rd place match exists)
 * - **QF** (rank: 5-8) - Quarter-final losers (4 players share this tier)
 * - **R16** (rank: 9-16) - Round of 16 losers (8 players share this tier)
 * - **R32** (rank: 17-32) - Round of 32 losers (16 players share this tier)
 *
 * **Time-Based Events** (format='tests' - super-solo, speed-solo, etc.):
 * - **POS_1** (rank: 1) - 1st place finisher
 * - **POS_2** (rank: 2) - 2nd place finisher
 * - **POS_3** (rank: 3) - 3rd place finisher
 * - **POS_N** (rank: N) - Nth place finisher (position-specific tiers)
 * Each position gets its own tier, allowing different points per position.
 *
 * **Important Notes**:
 * - Tiers are event-agnostic: same tier names work for all event formats
 * - Multiple players can share the same tier (e.g., 4 QF losers all get QF tier)
 * - The `rank` field indicates the general ranking order (1 = best, higher = lower rank)
 * - Tiers are used to look up points from Points Schema Entries
 * - Actual final position is stored in `eventResults.finalPosition` (can have duplicates)
 *
 * **Examples**:
 * - Elimination event: Winner gets WINNER tier, Runner-up gets FINALIST tier
 * - Time-based event: 1st place gets POS_1 tier, 2nd place gets POS_2 tier
 * - QF losers: All 4 players get QF tier, but may have different finalPosition values
 *
 * @see eventResults - Where tiers are assigned to participants
 * @see pointsSchemaEntry - Maps tiers to points values
 */
export const placementTiers = pgTable('placement_tiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull().unique(), // WINNER, FINALIST, SF, QF, R16, etc.
  displayName: varchar('display_name', { length: 100 }), // "Winner", "Finalist", "Semi-Final", etc.
  description: text('description'),
  rank: integer('rank').notNull(), // 1: Champion, 2: Runner-up, 3: Third Place, 4: Fourth Place, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/**
 * Points Schemas Table
 *
 * **Purpose**: Named point systems that define how points are awarded for different
 * placement tiers. A points schema is a collection of point rules that can be
 * reused across multiple events (e.g., "National Championship 2024 Points System").
 *
 * **How It Works**:
 * - A points schema is a container/grouping mechanism
 * - It contains multiple Points Schema Entries that map placement tiers to point values
 * - Events reference a points schema via `events.pointsSchemaId`
 * - Different schemas can award different points for the same tier
 *
 * **Use Cases**:
 * - **Championship Events**: Use a championship-specific schema with higher point values
 * - **Regular Events**: Use a standard schema with lower point values
 * - **Time-Based Events**: Use a schema with position-specific tiers (POS_1, POS_2, etc.)
 * - **Elimination Events**: Use a schema with match-based tiers (WINNER, FINALIST, QF, etc.)
 *
 * **Examples**:
 * - "National Championship 2024" - High-value points for championship events
 * - "Regional League 2024" - Standard points for regular competitions
 * - "Time-Based Standard" - Points for time-based events (POS_1 = 100, POS_2 = 80, etc.)
 *
 * **Important Notes**:
 * - Schemas are metadata only (name, description)
 * - Actual point values are defined in Points Schema Entries
 * - One schema can be used by multiple events
 * - Changing a schema affects all events using it (points are looked up dynamically)
 *
 * @see pointsSchemaEntry - Contains the actual tier-to-points mappings
 * @see events.pointsSchemaId - Links events to their point system
 */
export const pointsSchemas = pgTable('points_schemas', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/**
 * Points Schema Entries Table
 *
 * **Purpose**: Maps placement tiers to point values within a specific points schema.
 * This is the junction table that connects Points Schemas to Placement Tiers and
 * defines how many points each tier awards.
 *
 * **How It Works**:
 * - Each entry links one placement tier to one points schema
 * - Defines the points awarded for that tier in that schema
 * - Multiple schemas can have different point values for the same tier
 * - When an event completes, points are looked up from the event's schema entries
 *
 * **Point Calculation Flow**:
 * 1. Event completes → Each participant gets assigned a `placementTierId`
 * 2. Look up event's `pointsSchemaId` from `events.pointsSchemaId`
 * 3. Find matching `pointsSchemaEntry` for (schemaId, tierId)
 * 4. Use the `points` value from that entry
 * 5. Store in `eventResults.pointsAwarded`
 *
 * **Examples**:
 *
 * **Elimination Event Schema**:
 * - WINNER → 100 points
 * - FINALIST → 75 points
 * - THIRD_PLACE → 50 points
 * - FOURTH_PLACE → 40 points
 * - SF → 30 points
 * - QF → 20 points
 *
 * **Time-Based Event Schema**:
 * - POS_1 → 100 points
 * - POS_2 → 80 points
 * - POS_3 → 60 points
 * - POS_4 → 50 points
 * - POS_5 → 40 points
 * - ... (position-specific points)
 *
 * **Important Notes**:
 * - Schema entries are "dumb and stable" - they don't care about event format
 * - Same tier can have different points in different schemas
 * - Points are looked up dynamically when events complete
 * - One tier can only appear once per schema (unique constraint)
 * - If a tier is missing from a schema, it defaults to 0 points
 *
 * **Why Separate from Placement Tiers**:
 * - Allows different point systems for the same tier
 * - Championship events can award more points than regular events
 * - Points can be updated without changing tier definitions
 * - Supports multiple concurrent point systems
 *
 * @see placementTiers - The tiers being mapped
 * @see pointsSchemas - The schema containing this entry
 * @see eventResults - Where calculated points are stored
 */
export const pointsSchemaEntry = pgTable(
  'points_schema_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pointsSchemaId: uuid('points_schema_id')
      .notNull()
      .references(() => pointsSchemas.id, { onDelete: 'cascade' }),
    placementTierId: uuid('placement_tier_id')
      .notNull()
      .references(() => placementTiers.id, { onDelete: 'cascade' }),
    points: integer('points').notNull().default(0), // Points awarded for this tier
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('unique_schema_tier').on(
      table.pointsSchemaId,
      table.placementTierId
    ),
    index('idx_points_schema_entries_schema_id').on(table.pointsSchemaId),
  ]
)

/**
 * Event Results Table
 *
 * **Purpose**: Stores the final ranking and points for each participant in an event.
 * This table represents the outcome of an event, not the match-by-match history.
 * Every participant gets exactly one result record when the event completes.
 *
 * **Ranking System Overview**:
 *
 * The ranking system uses two complementary fields:
 * - **`finalPosition`**: Exact numerical rank (1, 2, 3, 4, 5...)
 * - **`placementTierId`**: Grouping tier for points calculation (WINNER, FINALIST, QF, etc.)
 *
 * **Key Design Principles**:
 * 1. **`finalPosition` is NOT unique** - Multiple players can share the same position
 *    (e.g., 4 QF losers all at position 5)
 * 2. **`placementTierId` groups players** - All players in same tier get same points
 * 3. **Tiers vary by event type** - Elimination uses match-based tiers, time-based uses position tiers
 *
 * **Handling Different Event Types**:
 *
 * **Elimination Events** (single-elimination, double-elimination):
 * - Winner: `finalPosition = 1`, `placementTierId = WINNER`
 * - Runner-up: `finalPosition = 2`, `placementTierId = FINALIST`
 * - 3rd place match winner: `finalPosition = 3`, `placementTierId = THIRD_PLACE`
 * - 3rd place match loser: `finalPosition = 4`, `placementTierId = FOURTH_PLACE`
 * - QF losers (no 3rd place match): `finalPosition = 5`, `placementTierId = QF` (all 4 players)
 * - SF losers (no 3rd place match): `finalPosition = 3 or 4`, `placementTierId = SF`
 *
 * **Time-Based Events** (format='tests' - super-solo, speed-solo, etc.):
 * - 1st place: `finalPosition = 1`, `placementTierId = POS_1`
 * - 2nd place: `finalPosition = 2`, `placementTierId = POS_2`
 * - 3rd place: `finalPosition = 3`, `placementTierId = POS_3`
 * - Each position gets its own tier (position-specific points)
 * - Every participant has a unique finalPosition (no duplicates in time-based events)
 *
 * **Multiple Players at Same Position**:
 *
 * When multiple players share the same `finalPosition` (common in elimination events):
 * - All players get the same `placementTierId` (e.g., all QF losers get QF tier)
 * - All players get the same `pointsAwarded` (from the tier's points schema entry)
 * - Display order can be determined by other criteria (name, registration order, etc.)
 *
 * **Example: 4 QF Losers**:
 * ```
 * Player A: finalPosition = 5, placementTierId = QF, pointsAwarded = 20
 * Player B: finalPosition = 5, placementTierId = QF, pointsAwarded = 20
 * Player C: finalPosition = 5, placementTierId = QF, pointsAwarded = 20
 * Player D: finalPosition = 5, placementTierId = QF, pointsAwarded = 20
 * ```
 * All four players share position 5, tier QF, and receive the same points.
 *
 * **Points Calculation**:
 *
 * When an event completes:
 * 1. Each participant is assigned a `placementTierId` based on their result
 * 2. System looks up the event's `pointsSchemaId` from `events.pointsSchemaId`
 * 3. Finds the `pointsSchemaEntry` matching (schemaId, tierId)
 * 4. Sets `pointsAwarded` to the entry's `points` value
 * 5. Points are stored here (denormalized for performance and historical accuracy)
 *
 * **Important Notes**:
 * - One result per registration per event (unique constraint)
 * - `finalPosition` can be NULL (rare, but possible for incomplete events)
 * - `placementTierId` is required (everyone must have a tier)
 * - `pointsAwarded` is stored here (denormalized) for performance and historical accuracy
 * - Points are calculated once when event completes, then stored
 * - Changing points schema doesn't retroactively update stored points
 *
 * **Querying Rankings**:
 *
 * To get event rankings:
 * ```sql
 * SELECT * FROM event_results
 * WHERE event_id = ?
 * ORDER BY final_position ASC NULLS LAST
 * ```
 * Note: When multiple players share the same finalPosition, you can add additional
 * sorting criteria (e.g., player name, registration order) for consistent display.
 *
 * To get player's total points across all events:
 * ```sql
 * SELECT SUM(points_awarded) FROM event_results
 * WHERE registration_id IN (SELECT id FROM registrations WHERE player_id = ?)
 * ```
 *
 * @see placementTiers - The tiers assigned to participants
 * @see pointsSchemas - The point system used by the event
 * @see pointsSchemaEntry - Maps tiers to point values
 * @see events - The event this result belongs to
 * @see registrations - The participant registration
 */
export const eventResults = pgTable(
  'event_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    /**
     * Final numerical position in the event (1, 2, 3, 4, 5...)
     *
     * **Important**: This field is NOT unique - multiple players can share the same position.
     * For example, 4 quarter-final losers all have finalPosition = 5.
     *
     * **Usage**:
     * - Time-based events: Every participant has a unique position (1, 2, 3, 4...)
     * - Elimination events: Multiple players can share positions (e.g., 4 QF losers at position 5)
     * - Used for display, sorting, and tiebreak transparency
     * - Can be NULL for incomplete events or special cases
     */
    finalPosition: integer('final_position'),
    /**
     * The placement tier assigned to this participant (WINNER, FINALIST, QF, POS_1, etc.)
     *
     * **Required**: Every participant must have a tier
     * **Purpose**: Used to look up points from the points schema
     * **Grouping**: Multiple players can share the same tier (e.g., all QF losers get QF tier)
     *
     * @see placementTiers - The tier definition
     */
    placementTierId: uuid('placement_tier_id')
      .notNull()
      .references(() => placementTiers.id, { onDelete: 'restrict' }),
    /**
     * Points awarded to this participant for this event
     *
     * **Calculation**: Looked up from pointsSchemaEntry when event completes
     * **Storage**: Denormalized here for performance and historical accuracy
     * **Note**: Changing points schema doesn't retroactively update this value
     */
    pointsAwarded: integer('points_awarded').notNull().default(0),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('unique_event_registration').on(table.eventId, table.registrationId),
    index('idx_event_results_event_id').on(table.eventId),
    index('idx_event_results_registration_id').on(table.registrationId),
    index('idx_event_results_placement_tier_id').on(table.placementTierId),
    index('idx_event_results_final_position').on(table.finalPosition),
  ]
)

// ============================================================================
// FEDERATION SEASONS & REGISTRATIONS
// ============================================================================

/**
 * Seasons Table
 *
 * Federation-level seasons that define time periods for competitions and player registrations.
 * Each season has specific start/end dates, registration windows, and age group configurations.
 *
 * **Season Format**: "2023-2024" (year range, not single year)
 * **Purpose**: Enable season-based player registration with federation-specific age groups
 *
 * **Key Features**:
 * - Multiple registration periods (up to 2 per season)
 * - Configurable max age groups per player
 * - Season status workflow (draft → active → closed → archived)
 * - Championship editions link to seasons
 *
 * @see season_age_groups - Age groups defined for this season
 * @see season_player_registrations - Player registrations for this season
 * @see championship_editions - Championships within this season
 */
export const seasons = pgTable(
  'seasons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    federationId: uuid('federation_id')
      .notNull()
      .references(() => federations.id, { onDelete: 'cascade' }),

    // Season identification
    name: varchar('name', { length: 100 }).notNull(), // e.g., "2023-2024 Season"
    startYear: integer('start_year').notNull(), // 2023
    endYear: integer('end_year').notNull(), // 2024
    seasonStartDate: date('season_start_date').notNull(), // 2023-07-01
    seasonEndDate: date('season_end_date').notNull(), // 2024-06-30

    // Registration periods
    firstRegistrationStartDate: date('first_registration_start_date'),
    firstRegistrationEndDate: date('first_registration_end_date'),
    secondRegistrationStartDate: date('second_registration_start_date'),
    secondRegistrationEndDate: date('second_registration_end_date'),

    // Season configuration
    maxAgeGroupsPerPlayer: integer('max_age_groups_per_player')
      .notNull()
      .default(1), // Minimum 1, can be set to 9999 for unlimited

    // Status
    status: text('status', { enum: ['draft', 'active', 'closed', 'archived'] })
      .notNull()
      .default('draft'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    check('chk_year_range', sql`${table.endYear} = ${table.startYear} + 1`),
    check(
      'chk_season_dates',
      sql`${table.seasonEndDate} > ${table.seasonStartDate}`
    ),
    check('chk_max_age_groups', sql`${table.maxAgeGroupsPerPlayer} >= 1`),
    unique('unique_federation_season').on(
      table.federationId,
      table.startYear,
      table.endYear
    ),
    index('idx_seasons_federation_id').on(table.federationId),
    index('idx_seasons_status').on(table.status),
    index('idx_seasons_dates').on(table.seasonStartDate, table.seasonEndDate),
  ]
)

/**
 * Season Age Groups Table
 *
 * Federation-specific age groups defined for each season.
 * Age restrictions are OPTIONAL - federations have full flexibility.
 *
 * **Examples**:
 * - Seniors: min_age=NULL, max_age=NULL (anyone can play)
 * - U-21 flexible: min_age=NULL, max_age=21 (anyone ≤21)
 * - U-18 with minimum: min_age=15, max_age=18 (only 15-18)
 *
 * **Age Validation**: System shows warnings but does NOT block registration
 * Federation admin has final authority to approve/reject
 *
 * @see seasons - Parent season
 * @see season_player_registrations - Player registrations in this age group
 */
export const seasonAgeGroups = pgTable(
  'season_age_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),

    // Age group definition
    code: varchar('code', { length: 20 }).notNull(), // 'U-16', 'U-18', 'Seniors'
    name: varchar('name', { length: 100 }).notNull(), // 'Under 16', 'Seniors'

    // OPTIONAL age restrictions (both nullable)
    minAge: integer('min_age'), // NULL = no minimum
    maxAge: integer('max_age'), // NULL = no maximum

    displayOrder: integer('display_order').notNull().default(0),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('unique_season_age_group').on(table.seasonId, table.code),
    check(
      'chk_age_range',
      sql`${table.minAge} IS NULL OR ${table.maxAge} IS NULL OR ${table.maxAge} >= ${table.minAge}`
    ),
    index('idx_season_age_groups_season_id').on(table.seasonId),
  ]
)

/**
 * Federation Members Table
 *
 * Permanent federation membership (doesn't expire).
 * Created when player's first season registration is approved.
 *
 * **Federation ID**: Manually entered by federation admin (NOT auto-generated)
 * **Lifecycle**: Created on first season approval, persists forever
 *
 * @see seasons - Season when player first joined
 * @see season_player_registrations - Season registrations for this member
 */
export const federationMembers = pgTable(
  'federation_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    federationId: uuid('federation_id')
      .notNull()
      .references(() => federations.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    // MANUALLY ENTERED federation ID (not auto-generated)
    federationIdNumber: varchar('federation_id_number', {
      length: 50,
    }).notNull(),

    // Created during first season registration
    firstRegistrationSeasonId: uuid('first_registration_season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'restrict' }),
    firstRegistrationDate: timestamp('first_registration_date')
      .notNull()
      .defaultNow(),

    // Membership status
    status: text('status', { enum: ['active', 'suspended', 'revoked'] })
      .notNull()
      .default('active'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('unique_federation_member').on(table.federationId, table.playerId),
    unique('unique_federation_id_number').on(
      table.federationId,
      table.federationIdNumber
    ),
    index('idx_federation_members_federation_id').on(table.federationId),
    index('idx_federation_members_player_id').on(table.playerId),
    index('idx_federation_members_id_number').on(table.federationIdNumber),
  ]
)

/**
 * Season Player Registrations Table
 *
 * Player registrations for specific seasons and age groups.
 * Player can register for multiple age groups per season (subject to season limit).
 *
 * **Registration Flow**:
 * 1. Club admin registers player for season + age group
 * 2. System checks: federation membership, age warning, max registrations
 * 3. If new member: admin enters federation ID
 * 4. Registration created with status='pending'
 * 5. Federation admin approves/rejects
 * 6. On approval: federation membership created (if first time)
 *
 * **Age Validation**: Warnings only, not blocking
 * **Payment**: Stub fields for future implementation
 *
 * @see seasons - Season being registered for
 * @see season_age_groups - Age group selected
 * @see players - Player being registered
 * @see organization - Club registering the player
 */
export const seasonPlayerRegistrations = pgTable(
  'season_player_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    seasonAgeGroupId: uuid('season_age_group_id')
      .notNull()
      .references(() => seasonAgeGroups.id, { onDelete: 'restrict' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

    // Registration details
    playerAgeAtRegistration: integer('player_age_at_registration').notNull(),
    registrationDate: timestamp('registration_date').notNull().defaultNow(),

    // Age warning flags (informational only, not blocking)
    ageWarningShown: boolean('age_warning_shown').default(false),
    ageWarningType: text('age_warning_type', {
      enum: ['too_young', 'too_old', 'outside_range'],
    }),

    // Status workflow
    status: text('status', {
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    approvedAt: timestamp('approved_at'),
    approvedBy: uuid('approved_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    rejectionReason: text('rejection_reason'),

    // Payment (future implementation)
    paymentStatus: text('payment_status', {
      enum: ['unpaid', 'paid', 'refunded'],
    }).default('unpaid'),
    paymentAmount: decimal('payment_amount', { precision: 10, scale: 2 }),
    paymentDate: timestamp('payment_date'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('unique_player_season_age_group').on(
      table.seasonId,
      table.playerId,
      table.seasonAgeGroupId
    ),
    index('idx_season_registrations_season_id').on(table.seasonId),
    index('idx_season_registrations_player_id').on(table.playerId),
    index('idx_season_registrations_age_group').on(table.seasonAgeGroupId),
    index('idx_season_registrations_status').on(table.status),
    index('idx_season_registrations_organization').on(table.organizationId),
  ]
)

// Note: Old federationPlayers and federationPlayerRequests tables have been removed
// and replaced with the new season-based system above

// Helper function to format date as "Nov 22, 2025"
export const formatDateForSessionName = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Type exports
export type Player = typeof players.$inferSelect
export type Test = typeof tests.$inferSelect
export type TestResult = typeof testResults.$inferSelect
export type Event = typeof events.$inferSelect
export type Group = typeof groups.$inferSelect
export type Registration = typeof registrations.$inferSelect
export type RegistrationPlayer = typeof registrationPlayers.$inferSelect
export type Match = typeof matches.$inferSelect
export type Set = typeof sets.$inferSelect
export type Coach = typeof coaches.$inferSelect
export type TrainingSession = typeof trainingSessions.$inferSelect
export type TrainingSessionCoach = typeof trainingSessionCoaches.$inferSelect
export type TrainingSessionAttendance =
  typeof trainingSessionAttendance.$inferSelect
export type Federation = typeof federations.$inferSelect
export type Championship = typeof championships.$inferSelect
export type ChampionshipEdition = typeof championshipEditions.$inferSelect
export type FederationClub = typeof federationClubs.$inferSelect
export type FederationClubRequest = typeof federationClubRequests.$inferSelect
export type Season = typeof seasons.$inferSelect
export type SeasonAgeGroup = typeof seasonAgeGroups.$inferSelect
export type FederationMember = typeof federationMembers.$inferSelect
export type SeasonPlayerRegistration =
  typeof seasonPlayerRegistrations.$inferSelect
export type Organization = typeof organization.$inferSelect
export type Member = typeof member.$inferSelect
export type Invitation = typeof invitation.$inferSelect
export type User = typeof user.$inferSelect
export type PlacementTier = typeof placementTiers.$inferSelect
export type PointsSchema = typeof pointsSchemas.$inferSelect
export type PointsSchemaEntry = typeof pointsSchemaEntry.$inferSelect
export type EventResult = typeof eventResults.$inferSelect
