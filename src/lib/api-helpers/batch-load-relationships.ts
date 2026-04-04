import { db } from '@/lib/db'
import { inArray } from 'drizzle-orm'

/**
 * Kept out of `query-builders.ts` so that file stays importable from client bundles: it only
 * exports Zod helpers and pure utilities, while this module pulls in `@/lib/db` → `pg` (Node-only).
 * Use only from server-side code.
 *
 * Batch load relationships for multiple entities to avoid N+1 queries.
 *
 * @example
 * const coachesMap = await batchLoadRelationships(
 *   sessions,
 *   (session) => session.id,
 *   schema.trainingSessionCoaches,
 *   schema.trainingSessionCoaches.trainingSessionId,
 *   {
 *     sessionId: schema.trainingSessionCoaches.trainingSessionId,
 *     coach: schema.coaches,
 *   }
 * )
 */
export async function batchLoadRelationships<T, K extends string | number, R>(
  items: T[],
  getKey: (item: T) => K,
  table: any,
  keyField: any,
  selector: any
): Promise<Map<K, R[]>> {
  const keys = items
    .map(getKey)
    .filter((key) => key !== null && key !== undefined)

  if (keys.length === 0) {
    return new Map()
  }

  const results = await db
    .select(selector)
    .from(table)
    .where(inArray(keyField, keys as any[]))

  const grouped = new Map<K, R[]>()
  for (const result of results) {
    const key = result[keyField.name] as K
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    const bucket = grouped.get(key)
    if (bucket) {
      bucket.push(result)
    }
  }

  return grouped
}
