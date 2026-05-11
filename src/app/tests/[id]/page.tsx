'use client'

import { useEffect, useState } from 'react'
import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Trophy,
  Calendar,
  Users,
  Clock,
  Plus,
  Edit,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SinglePageHeader } from '@/components/ui'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useTestsStore } from '@/store/tests-store'
import { useTestPermissions } from '@/hooks/authorization/use-test-permissions'
import { toast } from 'sonner'
import ResultsForm from '@/components/results/results-form'
import TestForm from '@/components/tests/test-form'
import { Skeleton } from '@/components/ui/skeleton'
import ResultsTable from './components/results-table'
import { useResults } from '../hooks/use-results'

const TestDetailPage = () => {
  const params = useParams()
  const router = useRouter()
  const testId = params.id as string
  const {
    selectedTest,
    fetchTest,
    isLoading: isTestLoading,
    deleteTest,
  } = useTestsStore()
  const { canUpdate, canDelete } = useTestPermissions(selectedTest as any)
  const [resultFormOpen, setResultFormOpen] = useState(false)
  const [editTestFormOpen, setEditTestFormOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Combined filters state (matching players pattern)
  const [filters, setFilters] = useState({
    testId: testId,
    q: '',
    gender: 'all' as 'male' | 'female' | 'all',
    ageGroup: 'all',
    yearOfBirth: undefined as number | undefined,
    page: 1,
    limit: 25,
    sortBy: 'totalScore' as
      | 'totalScore'
      | 'leftHandScore'
      | 'rightHandScore'
      | 'forehandScore'
      | 'backhandScore'
      | 'playerName'
      | 'ageGroup'
      | 'age'
      | 'createdAt',
    sortOrder: 'desc' as 'asc' | 'desc',
  })

  // Update testId in filters when params change
  useEffect(() => {
    if (testId && testId !== filters.testId) {
      setFilters((prev) => ({ ...prev, testId, page: 1 }))
    }
  }, [testId, filters.testId])

  const {
    results,
    isLoading: isResultsLoading,
    error: resultsError,
    pagination,
    handlePageChange,
    refetch: refetchResults,
  } = useResults(filters)

  useEffect(() => {
    if (testId) {
      fetchTest(testId, false) // Don't need results, we fetch via API
    }
  }, [testId, fetchTest])

  if (isTestLoading || !selectedTest) {
    return (
      <div className='container mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-8'>
        <div className='space-y-6'>
          <Skeleton className='h-8 w-1/3' />
          <Skeleton className='h-32' />
          <Skeleton className='h-64' />
        </div>
      </div>
    )
  }

  const getTestTypeLabel = (playingTime: number, recoveryTime: number) => {
    if (playingTime === 60 && recoveryTime === 30) return 'Super Solo (60s/30s)'
    if (playingTime === 30 && recoveryTime === 30)
      return 'Juniors Solo (30s/30s)'
    if (playingTime === 30 && recoveryTime === 60) return 'Speed Solo (30s/60s)'
    return `Custom (${playingTime}s/${recoveryTime}s)`
  }

  const getTestTypeColor = (playingTime: number, recoveryTime: number) => {
    if (playingTime === 60 && recoveryTime === 30)
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    if (playingTime === 30 && recoveryTime === 30)
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    if (playingTime === 30 && recoveryTime === 60)
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }

  // For "Results by Age Group" section, we still need all results
  // We'll fetch them separately or use a different approach
  const allResultsForGrouping = results // This will be limited, but we can enhance later
  const groupBy = (results: any[], key: string): Record<string, any[]> => {
    return results.reduce((groups, result) => {
      const groupKey = result.player?.[key] || 'Unknown'
      if (!groups[groupKey]) groups[groupKey] = []
      groups[groupKey].push(result)
      return groups
    }, {} as Record<string, any[]>)
  }

  const resultsByAgeGroup = groupBy(allResultsForGrouping, 'ageGroup')

  const handleDelete = async () => {
    try {
      await deleteTest(testId)
      toast.success('Test deleted successfully')
      router.push('/tests')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete test'
      )
    }
  }

  return (
    <div className='container mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-8'>
      <SinglePageHeader
        backTo='/tests'
        actionDialogs={
          canUpdate
            ? [
                {
                  open: editTestFormOpen,
                  onOpenChange: setEditTestFormOpen,
                  trigger: (
                    <Button size='sm' className='gap-2' variant='outline'>
                      <Edit className='h-4 w-4' />
                      <span className='hidden sm:inline'>Edit Test</span>
                    </Button>
                  ),
                  content: (
                    <TestForm
                      test={selectedTest}
                      onSuccess={() => {
                        setEditTestFormOpen(false)
                        fetchTest(testId, true)
                      }}
                      onCancel={() => setEditTestFormOpen(false)}
                    />
                  ),
                },
              ]
            : undefined
        }
        alertDialogs={
          canDelete
            ? [
                {
                  open: deleteDialogOpen,
                  onOpenChange: setDeleteDialogOpen,
                  trigger: (
                    <Button size='sm' className='gap-2' variant='destructive'>
                      <Trash2 className='h-4 w-4' />
                      <span className='hidden sm:inline'>Delete Test</span>
                    </Button>
                  ),
                  content: (
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Test</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete{' '}
                          <strong>{selectedTest.name}</strong>? This action
                          cannot be undone and will permanently delete all
                          associated test results.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                          onClick={handleDelete}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  ),
                },
              ]
            : undefined
        }
      />

      {/* Test Header */}
      <div className='mb-6'>
        <Card>
          <CardContent>
            <div className='flex flex-col sm:flex-row items-start gap-4 sm:gap-6'>
              <div className='bg-blue-100 dark:bg-blue-900 rounded-full p-3 sm:p-4 shrink-0'>
                <Trophy className='h-8 w-8 sm:h-12 sm:w-12 text-blue-600 dark:text-blue-400' />
              </div>
              <div className='flex-1 w-full min-w-0'>
                <div className='mb-2'>
                  <div className='flex flex-wrap items-center gap-2 sm:gap-3'>
                    <h1 className='text-2xl sm:text-3xl font-bold text-foreground break-words'>
                      {selectedTest.name}
                    </h1>
                    <span
                      className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getTestTypeColor(
                        selectedTest.playingTime,
                        selectedTest.recoveryTime
                      )}`}
                    >
                      {getTestTypeLabel(
                        selectedTest.playingTime,
                        selectedTest.recoveryTime
                      )}
                    </span>
                  </div>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground mb-4'>
                  <div className='flex items-center gap-2'>
                    <Calendar className='h-4 w-4' />
                    <span>
                      Date:{' '}
                      {new Date(
                        selectedTest.dateConducted
                      ).toLocaleDateString()}
                    </span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Users className='h-4 w-4' />
                    <span>Participants: {pagination.totalItems}</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Clock className='h-4 w-4' />
                    <span>
                      Test Type:{' '}
                      {getTestTypeLabel(
                        selectedTest.playingTime,
                        selectedTest.recoveryTime
                      )}
                    </span>
                  </div>
                </div>
                {selectedTest.description && (
                  <p className='text-muted-foreground'>
                    {selectedTest.description}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Display */}
      <div className='space-y-8'>
        {/* All Results Table */}
        <Card>
          <CardHeader>
            <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4'>
              <div>
                <CardTitle>
                  Test Results ({pagination.totalItems} participants)
                </CardTitle>
                <CardDescription>
                  Individual results with server-side filtering, sorting, and
                  pagination
                </CardDescription>
              </div>

              {/* Add Result Button - uses update permission (adding results to a test) */}
              {canUpdate && (
                <Dialog open={resultFormOpen} onOpenChange={setResultFormOpen}>
                  <DialogTrigger asChild>
                    <Button className='gap-2 bg-green-600 hover:bg-green-700 w-full sm:w-auto'>
                      <Plus className='h-4 w-4' />
                      Add Result
                    </Button>
                  </DialogTrigger>
                  <ResultsForm
                    preselectedTestId={testId}
                    onSuccess={() => {
                      setResultFormOpen(false)
                      refetchResults()
                    }}
                    onCancel={() => setResultFormOpen(false)}
                  />
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedTest.visibility === 'coaches-only' &&
              !canUpdate &&
              !isResultsLoading &&
              pagination.totalItems === 0 && (
                <div className='mb-4 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground'>
                  Results for this test are visible to coaches/admins only.
                </div>
              )}
            <ResultsTable
              results={results}
              pagination={pagination}
              onPageChange={handlePageChange}
              onPageSizeChange={(pageSize) => {
                setFilters({ ...filters, limit: pageSize, page: 1 })
              }}
              onSearchChange={(search) => {
                setFilters({ ...filters, q: search, page: 1 })
              }}
              searchValue={filters.q}
              gender={filters.gender}
              ageGroup={filters.ageGroup}
              yearOfBirth={filters.yearOfBirth}
              onGenderChange={(gender) => {
                setFilters({ ...filters, gender, page: 1 })
              }}
              onAgeGroupChange={(ageGroup) => {
                setFilters({ ...filters, ageGroup, page: 1 })
              }}
              onYearOfBirthChange={(year) => {
                setFilters({ ...filters, yearOfBirth: year, page: 1 })
              }}
              sortBy={filters.sortBy}
              sortOrder={filters.sortOrder}
              onSortingChange={(sortBy, sortOrder) => {
                setFilters({
                  ...filters,
                  sortBy: sortBy as typeof filters.sortBy,
                  sortOrder: sortOrder || 'desc',
                  page: 1,
                })
              }}
              isLoading={isResultsLoading}
              onRefetch={refetchResults}
            />
          </CardContent>
        </Card>

        {/* Grouped by Age Group */}
        {Object.keys(resultsByAgeGroup).length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Results by Age Group</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-6'>
                {Object.entries(resultsByAgeGroup).map(
                  ([ageGroup, results]) => (
                    <div key={ageGroup}>
                      <h3 className='text-lg font-semibold mb-3 text-rowad-600'>
                        {ageGroup} ({results.length} participants)
                      </h3>
                      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                        {results
                          .sort((a, b) => {
                            const totalA =
                              a.leftHandScore +
                              a.rightHandScore +
                              a.forehandScore +
                              a.backhandScore
                            const totalB =
                              b.leftHandScore +
                              b.rightHandScore +
                              b.forehandScore +
                              b.backhandScore
                            return totalB - totalA
                          })
                          .map((result, index) => {
                            const totalScore =
                              result.leftHandScore +
                              result.rightHandScore +
                              result.forehandScore +
                              result.backhandScore
                            return (
                              <div
                                key={result.id}
                                className='border rounded-lg p-3 bg-muted/50'
                              >
                                <div className='flex justify-between items-center mb-2'>
                                  <Link
                                    href={`/players/${result.player?.id}`}
                                    className='font-medium text-rowad-600 hover:text-rowad-700'
                                  >
                                    {result.player?.name}
                                  </Link>
                                  <span className='font-bold text-blue-600'>
                                    {totalScore}
                                  </span>
                                </div>
                                <p className='text-xs text-muted-foreground'>
                                  {result.player?.gender === 'male'
                                    ? '👨'
                                    : '👩'}{' '}
                                  Age {result.player?.age}
                                </p>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default TestDetailPage
