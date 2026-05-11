/**
 * Shared Form Validation Patterns
 *
 * This file contains reusable Zod validation schemas and helper functions
 * for consistent form validation across the application.
 */

import { z } from 'zod'

// ============================================================================
// Basic Field Schemas
// ============================================================================

/**
 * Standard name validation (2-255 characters)
 * Used for: players, coaches, events, organizations, etc.
 */
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .min(2, 'Name must be at least 2 characters')
  .max(255, 'Name must be less than 255 characters')
  .trim()

/**
 * RTL (Right-to-Left) name validation for Arabic text
 * Optional field with max length validation
 */
export const rtlNameSchema = z
  .string()
  .max(255, 'RTL Name must be less than 255 characters')
  .optional()
  .nullable()

/**
 * Email validation with proper format checking
 */
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .trim()
  .toLowerCase()

/**
 * Optional description field with character limit
 */
export const descriptionSchema = z
  .string()
  .max(1000, 'Description must be less than 1000 characters')
  .optional()
  .nullable()

/**
 * Long text field (for notes, etc.) with higher limit
 */
export const longTextSchema = (maxLength: number = 5000) =>
  z
    .string()
    .max(maxLength, `Text must be less than ${maxLength} characters`)
    .optional()
    .nullable()

// ============================================================================
// Password Validation
// ============================================================================

/**
 * Strong password validation with comprehensive requirements
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[@$!%*?&#]/, 'Password must contain at least one special character (@$!%*?&#)')

/**
 * Simple password validation (for sign-in)
 * Only checks minimum length
 */
export const passwordSignInSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')

// ============================================================================
// Date Validation
// ============================================================================

/**
 * Date of birth validation
 * - Must be at least 2 years old
 * - Cannot be in the future
 */
export const dateOfBirthSchema = z
  .date()
  .refine(
    (date) => date <= new Date(new Date().getFullYear() - 2, 0, 1),
    'Player must be at least 2 years old'
  )
  .refine(
    (date) => date <= new Date(),
    'Date of birth cannot be in the future'
  )

/**
 * Generic date validation (cannot be in the future)
 */
export const dateSchema = z
  .date()
  .refine((date) => date <= new Date(), 'Date cannot be in the future')

/**
 * Future date validation (for events, registrations)
 */
export const futureDateSchema = z.date()

/**
 * Optional date schema
 */
export const optionalDateSchema = z.date().optional().nullable()

// ============================================================================
// API Date String Schemas
// ============================================================================

/**
 * Date string validation for API (YYYY-MM-DD format)
 */
export const dateStringSchema = z
  .string()
  .refine((date) => !isNaN(Date.parse(date)), 'Invalid date format')
  .refine(
    (date) => new Date(date) <= new Date(),
    'Date cannot be in the future'
  )

/**
 * Optional date string for API
 */
export const optionalDateStringSchema = z
  .string()
  .refine((date) => !isNaN(Date.parse(date)), 'Invalid date format')
  .optional()

// ============================================================================
// ID Validation
// ============================================================================

/**
 * UUID validation
 */
export const uuidSchema = z.uuid('Invalid ID format')

/**
 * Optional UUID validation
 */
export const optionalUuidSchema = z.uuid('Invalid ID format').optional().nullable()

// ============================================================================
// Number Validation
// ============================================================================

/**
 * Positive integer validation
 */
export const positiveIntSchema = (fieldName: string = 'Value') =>
  z
    .number()
    .int(`${fieldName} must be a whole number`)
    .positive(`${fieldName} must be greater than 0`)

/**
 * Non-negative integer validation (allows 0)
 */
export const nonNegativeIntSchema = (fieldName: string = 'Value') =>
  z
    .number()
    .int(`${fieldName} must be a whole number`)
    .min(0, `${fieldName} cannot be negative`)

/**
 * Score validation (0 or positive integer)
 */
export const scoreSchema = z
  .number()
  .int('Score must be a whole number')
  .min(0, 'Score cannot be negative')
  .nullable()
  .optional()

// ============================================================================
// Transform Helpers
// ============================================================================

/**
 * Convert Date object to ISO date string (YYYY-MM-DD)
 * Used when submitting forms to API
 */
export const dateToISOString = (date: Date | null | undefined): string | null => {
  if (!date) return null
  return date.toISOString().split('T')[0]
}

/**
 * Convert ISO date string to Date object
 * Used when loading data from API
 */
export const isoStringToDate = (dateString: string | null | undefined): Date | null => {
  if (!dateString) return null
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? null : date
}

/**
 * Transform form data dates to API format
 * Automatically converts Date objects to ISO strings
 */
export const transformDatesForAPI = <T extends Record<string, any>>(
  data: T,
  dateFields: (keyof T)[]
): T => {
  const transformed = { ...data }

  dateFields.forEach((field) => {
    if (transformed[field] && typeof transformed[field] === 'object' && 'getTime' in transformed[field]) {
      transformed[field] = dateToISOString(transformed[field] as Date) as any
    }
  })

  return transformed
}

// ============================================================================
// Range Validation
// ============================================================================

/**
 * Create a min/max range validation
 * Ensures min <= max
 */
export const createRangeValidation = <T extends { min?: number; max?: number }>(
  minField: keyof T = 'min' as keyof T,
  maxField: keyof T = 'max' as keyof T
) => {
  return (data: T) => {
    const min = data[minField] as number | undefined
    const max = data[maxField] as number | undefined

    if (min !== undefined && max !== undefined) {
      return min <= max
    }
    return true
  }
}

// ============================================================================
// Array Validation Helpers
// ============================================================================

/**
 * Non-empty array validation
 */
export const nonEmptyArraySchema = <T>(
  itemSchema: z.ZodType<T>,
  message: string = 'At least one item is required'
) => z.array(itemSchema).min(1, message)

/**
 * Array with min/max length
 */
export const boundedArraySchema = <T>(
  itemSchema: z.ZodType<T>,
  min: number,
  max: number,
  fieldName: string = 'items'
) =>
  z
    .array(itemSchema)
    .min(min, `At least ${min} ${fieldName} required`)
    .max(max, `Maximum ${max} ${fieldName} allowed`)

// ============================================================================
// Conditional Field Helpers
// ============================================================================

/**
 * Make field required based on condition
 */
export const conditionalRequired = <T>(
  schema: z.ZodType<T>,
  condition: boolean,
  message: string = 'This field is required'
) => {
  return condition ? schema : schema.optional()
}

// ============================================================================
// Enum Helpers
// ============================================================================

/**
 * Create enum schema with custom error message
 */
export const createEnumSchema = <T extends readonly [string, ...string[]]>(
  values: T,
  fieldName: string
) =>
  z.enum(values, {
    message: `Please select a valid ${fieldName}`,
  })

// ============================================================================
// Common Sport-Specific Schemas
// ============================================================================

/**
 * Preferred hand validation
 */
export const preferredHandSchema = z.enum(['left', 'right', 'both'], {
  message: 'Please select preferred hand',
})

/**
 * Gender validation
 */
export const genderSchema = z.enum(['male', 'female'], {
  message: 'Please select gender',
})

/**
 * Event gender validation (includes mixed)
 */
export const eventGenderSchema = z.enum(['male', 'female', 'mixed'], {
  message: 'Please select event gender',
})

/**
 * Visibility validation
 */
export const visibilitySchema = z.enum(['public', 'private'], {
  message: 'Please select visibility',
})

/**
 * Test visibility validation (includes coaches-only)
 */
export const testVisibilitySchema = z.enum(['public', 'private', 'coaches-only'], {
  message: 'Please select visibility',
})

// ============================================================================
// Validation Result Helpers
// ============================================================================

/**
 * Type for validation result
 */
export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Create validation result object
 */
export const createValidationResult = (
  valid: boolean,
  error?: string
): ValidationResult => ({
  valid,
  error,
})
