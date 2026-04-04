import type { Test } from '@/types'

/** List picker: show most recently conducted tests first */
export function sortTestsNewestFirst(tests: readonly Test[]): Test[] {
  return [...tests].sort(
    (a, b) =>
      new Date(b.dateConducted).getTime() -
      new Date(a.dateConducted).getTime()
  )
}

/** Weight inputs / charts: stable oldest-first order matching selected test IDs */
export function orderSelectedTestsOldestFirst(
  selectedIds: readonly string[],
  availableTests: readonly Test[]
): Test[] {
  return selectedIds
    .map((id) => availableTests.find((t) => t.id === id))
    .filter((t): t is Test => t != null)
    .sort(
      (a, b) =>
        new Date(a.dateConducted).getTime() -
        new Date(b.dateConducted).getTime()
    )
}
