import { ChevronDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Table } from '@tanstack/react-table'
import { dashboardAgeGroupValues } from '@/types/api/results.schemas'
import { ResultWithPlayer } from './results-table-types'

/** Matches `getAgeGroup` / GET /api/v1/results SQL filter (not derived from the current page). */
const RESULTS_AGE_GROUP_OPTIONS = [...dashboardAgeGroupValues]

/** Birth years allowed by `resultsQuerySchema` (1900–2100), newest first. */
const RESULTS_BIRTH_YEAR_OPTIONS = (() => {
  const max = Math.min(new Date().getFullYear(), 2100)
  const years: number[] = []
  for (let y = max; y >= 1900; y -= 1) {
    years.push(y)
  }
  return years
})()

interface ResultsTableControlsProps {
  table: Table<ResultWithPlayer>
  searchValue: string
  onSearchChange?: (value: string) => void
  gender?: 'male' | 'female' | 'all'
  ageGroup?: string
  yearOfBirth?: number
  onGenderChange?: (gender: 'male' | 'female' | 'all') => void
  onAgeGroupChange?: (ageGroup: string) => void
  onYearOfBirthChange?: (year: number | undefined) => void
}

export const ResultsTableControls = ({
  table,
  searchValue,
  onSearchChange,
  gender,
  ageGroup,
  yearOfBirth,
  onGenderChange,
  onAgeGroupChange,
  onYearOfBirthChange,
}: ResultsTableControlsProps) => {
  const getColumnLabel = (columnId: string) => {
    const labels: Record<string, string> = {
      age: 'Age',
      createdAt: 'Created',
    }
    return labels[columnId] || columnId
  }

  return (
    <div className='space-y-4'>
      {/* Row 1: Search input */}
      <div className='flex flex-col md:flex-row gap-4'>
        <div className='w-full relative'>
          <Search className='w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground' />
          <Input
            placeholder="Search by player's name..."
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            className='w-full md:max-w-md pl-10'
          />
        </div>
        {/* Column Visibility */}
        <div className='w-full md:w-auto md:ml-auto'>
          <Label className='block mb-2 md:invisible md:h-0 md:mb-0'>
            Columns
          </Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' className='w-full md:w-auto'>
                Columns <ChevronDown className='ml-2 h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className='capitalize'
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {getColumnLabel(column.id)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Row 2: Gender, Age Group, Year of Birth */}
      <div className='flex flex-col md:flex-row gap-4'>
        {/* Gender Filter */}
        <div className='flex-1 w-full md:w-auto'>
          <Label htmlFor='gender' className='block mb-2'>
            Gender
          </Label>
          <Select
            name='gender'
            value={gender || 'all'}
            onValueChange={(value: 'male' | 'female' | 'all') =>
              onGenderChange?.(value)
            }
          >
            <SelectTrigger className='w-full'>
              <SelectValue placeholder='Select a Gender' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='male'>Male</SelectItem>
              <SelectItem value='female'>Female</SelectItem>
              <SelectItem value='all'>All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Age Group Filter */}
        <div className='flex-1 w-full md:w-auto'>
          <Label htmlFor='ageGroup' className='block mb-2'>
            Age Group
          </Label>
          <Select
            name='ageGroup'
            value={ageGroup || 'all'}
            onValueChange={(value: string) => onAgeGroupChange?.(value)}
          >
            <SelectTrigger className='w-full'>
              <SelectValue placeholder='Select an Age Group' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Age Groups</SelectItem>
              {RESULTS_AGE_GROUP_OPTIONS.map((group) => (
                <SelectItem key={group} value={group}>
                  {group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Year of Birth Filter */}
        <div className='flex-1 w-full md:w-auto'>
          <Label htmlFor='yearOfBirth' className='block mb-2'>
            Birth Year
          </Label>
          <Select
            name='yearOfBirth'
            value={yearOfBirth?.toString() || 'all'}
            onValueChange={(value: string) =>
              onYearOfBirthChange?.(
                value === 'all' ? undefined : Number.parseInt(value, 10)
              )
            }
          >
            <SelectTrigger className='w-full'>
              <SelectValue placeholder='Select a Year' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Years</SelectItem>
              {RESULTS_BIRTH_YEAR_OPTIONS.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
