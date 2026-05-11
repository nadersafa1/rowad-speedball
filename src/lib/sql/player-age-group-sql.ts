/**
 * SQL fragments mirroring {@link calculateAge} and {@link getAgeGroup} in `src/db/schema.ts`
 * (season July–June). Used for server-side filters and sorts on joined `players.date_of_birth`.
 */
import { sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

/** Seasonal age: same rules as `calculateAge(dateOfBirth)` using `CURRENT_DATE`. */
export function playerSeasonalAgeSql(dateOfBirth: AnyPgColumn): SQL {
  return sql`(
    EXTRACT(YEAR FROM CURRENT_DATE)::integer
    - EXTRACT(YEAR FROM ${dateOfBirth})::integer
    - CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 6 THEN 1 ELSE 0 END
  )`
}

/** Label string: same buckets as `getAgeGroup` (mini, U-09, …, Seniors). */
export function playerAgeGroupLabelSql(dateOfBirth: AnyPgColumn): SQL {
  const a = playerSeasonalAgeSql(dateOfBirth)
  return sql`(
    CASE
      WHEN (${a}) <= 7 THEN 'mini'
      WHEN (${a}) <= 9 THEN 'U-09'
      WHEN (${a}) <= 11 THEN 'U-11'
      WHEN (${a}) <= 13 THEN 'U-13'
      WHEN (${a}) <= 15 THEN 'U-15'
      WHEN (${a}) <= 17 THEN 'U-17'
      WHEN (${a}) <= 19 THEN 'U-19'
      WHEN (${a}) <= 21 THEN 'U-21'
      ELSE 'Seniors'
    END
  )`
}

/** Sum of the four hand scores on `test_results` (matches `resultsService.calculateTotalScore`). */
export function testResultTotalScoreSql(): SQL {
  return sql`(
    ${schema.testResults.leftHandScore}
    + ${schema.testResults.rightHandScore}
    + ${schema.testResults.forehandScore}
    + ${schema.testResults.backhandScore}
  )`
}
