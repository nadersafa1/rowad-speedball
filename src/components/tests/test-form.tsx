'use client'

import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useTestsStore } from '@/store/tests-store'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, Table2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { parseDateFromAPI } from '@/lib/date-utils'
import { TestDatePicker } from './test-date-picker'
import ClubCombobox from '@/components/organizations/club-combobox'
import { useOrganizationContext } from '@/hooks/authorization/use-organization-context'
import { DIALOG_CLASSES } from '@/lib/ui-constants'
import { FormError } from '@/components/forms/form-error'
import { LoadingButton } from '@/components/forms/loading-button'

// Validation schema
const testSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
  playingTime: z
    .number()
    .int('Playing time must be an integer')
    .min(1, 'Playing time must be at least 1')
    .max(300, 'Playing time cannot exceed 300'),
  recoveryTime: z
    .number()
    .int('Recovery time must be an integer')
    .min(0, 'Recovery time cannot be negative')
    .max(300, 'Recovery time cannot exceed 300'),
  dateConducted: z.date(),
  visibility: z.enum(['public', 'private', 'coaches-only']),
  description: z
    .string()
    .max(1000, 'Description cannot exceed 1000 characters')
    .optional(),
  organizationId: z.uuid().nullable().optional(),
})

type TestFormData = z.infer<typeof testSchema>

interface TestFormProps {
  test?: any // For editing existing tests
  onSuccess?: () => void
  onCancel?: () => void
}

const TestForm = ({ test, onSuccess, onCancel }: TestFormProps) => {
  const { createTest, updateTest, error, clearError } = useTestsStore()
  const { context } = useOrganizationContext()
  const { isSystemAdmin } = context
  const isEditing = !!test

  const form = useForm<TestFormData>({
    resolver: zodResolver(testSchema),
    defaultValues: {
      name: test?.name || '',
      playingTime: test?.playingTime || 30,
      recoveryTime: test?.recoveryTime || 30,
      dateConducted: test?.dateConducted
        ? parseDateFromAPI(test.dateConducted)
        : new Date(),
      description: test?.description || '',
      visibility: test?.visibility ?? 'public',
      organizationId: test?.organizationId || null,
    },
  })

  const { isSubmitting } = form.formState
  const playingTime = form.watch('playingTime')
  const recoveryTime = form.watch('recoveryTime')

  const onSubmit = async (data: TestFormData) => {
    clearError()
    try {
      if (isEditing) {
        await updateTest(test.id, data)
      } else {
        await createTest(data)
      }
      form.reset()
      onSuccess?.()
    } catch (error) {
      // Error is handled by the store
    }
  }

  return (
    <DialogContent className={DIALOG_CLASSES.form}>
      <DialogHeader>
        <DialogTitle className='flex items-center gap-2 text-lg sm:text-xl'>
          <Table2 className='h-5 w-5 text-blue-600' />
          {isEditing ? 'Edit Test' : 'Create New Test'}
        </DialogTitle>
        <DialogDescription className='text-sm'>
          {isEditing
            ? 'Update test information for Rowad speedball team'
            : 'Set up a new speedball test for Rowad team'}
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          {/* Test Name Field */}
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Test Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Enter test name (e.g., 'Spring Championship 2024')"
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Playing Time Field */}
          <FormField
            control={form.control}
            name='playingTime'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Playing Time (seconds)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    min='1'
                    max='300'
                    placeholder='Enter playing time in seconds'
                    disabled={isSubmitting}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value) || 0)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Recovery Time Field */}
          <FormField
            control={form.control}
            name='recoveryTime'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Recovery Time (seconds)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    min='0'
                    max='300'
                    placeholder='Enter recovery time in seconds'
                    disabled={isSubmitting}
                    onChange={(e) =>
                      field.onChange(parseInt(e.target.value) || 0)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Quick Presets */}
          <div className='space-y-2'>
            <FormLabel>Quick Presets</FormLabel>
            <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
              <Button
                type='button'
                variant={
                  playingTime === 60 && recoveryTime === 30
                    ? 'default'
                    : 'outline'
                }
                size='sm'
                onClick={() => {
                  form.setValue('playingTime', 60)
                  form.setValue('recoveryTime', 30)
                }}
                disabled={isSubmitting}
              >
                Super Solo (60s/30s)
              </Button>
              <Button
                type='button'
                variant={
                  playingTime === 30 && recoveryTime === 30
                    ? 'default'
                    : 'outline'
                }
                size='sm'
                onClick={() => {
                  form.setValue('playingTime', 30)
                  form.setValue('recoveryTime', 30)
                }}
                disabled={isSubmitting}
              >
                Juniors Solo (30s/30s)
              </Button>
              <Button
                type='button'
                variant={
                  playingTime === 30 && recoveryTime === 60
                    ? 'default'
                    : 'outline'
                }
                size='sm'
                onClick={() => {
                  form.setValue('playingTime', 30)
                  form.setValue('recoveryTime', 60)
                }}
                disabled={isSubmitting}
              >
                Speed Solo (30s/60s)
              </Button>
            </div>
          </div>

          {/* Date Conducted Field */}
          <FormField
            control={form.control}
            name='dateConducted'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Test Day</FormLabel>
                <FormControl>
                  <TestDatePicker
                    date={field.value}
                    onDateChange={field.onChange}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Visibility Field */}
          <FormField
            control={form.control}
            name='visibility'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Visibility</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isSubmitting}
                    className='flex flex-col sm:flex-row gap-4 sm:gap-6'
                  >
                    <div className='flex items-center space-x-2'>
                      <RadioGroupItem value='public' id='public' />
                      <label htmlFor='public'>Public</label>
                    </div>
                    <div className='flex items-center space-x-2'>
                      <RadioGroupItem value='private' id='private' />
                      <label htmlFor='private'>Private</label>
                    </div>
                    <div className='flex items-center space-x-2'>
                      <RadioGroupItem value='coaches-only' id='coaches-only' />
                      <label htmlFor='coaches-only'>Coaches only</label>
                    </div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description Field */}
          <FormField
            control={form.control}
            name='description'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder='Add any additional details about this test...'
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Club Field - Only for System Admins */}
          {isSystemAdmin && (
            <FormField
              control={form.control}
              name='organizationId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Club</FormLabel>
                  <FormControl>
                    <ClubCombobox
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                      placeholder='Select a club (optional)'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormError error={error} />

          <DialogFooter className='flex-col sm:flex-row gap-2 sm:gap-3 mt-4'>
            {onCancel && (
              <Button
                type='button'
                variant='outline'
                onClick={onCancel}
                disabled={isSubmitting}
                className='w-full sm:w-auto min-w-[44px] min-h-[44px]'
              >
                Cancel
              </Button>
            )}
            <LoadingButton
              type='submit'
              isLoading={isSubmitting}
              loadingText={isEditing ? 'Updating...' : 'Creating...'}
              className='w-full sm:w-auto min-w-[44px] min-h-[44px] bg-blue-600 hover:bg-blue-700'
              icon={<Save className='h-4 w-4' />}
            >
              {isEditing ? 'Update Test' : 'Create Test'}
            </LoadingButton>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  )
}

export default TestForm
