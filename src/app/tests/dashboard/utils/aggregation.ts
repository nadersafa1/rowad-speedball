import type {
  PositionKey,
  AggregationMode,
  DashboardPlayer,
  DashboardPlayerResult,
} from '@/store/tests-dashboard-store'

// ========================================
// Shared constants & types
// ========================================

export type ScoreKey =
  | 'leftHandScore'
  | 'rightHandScore'
  | 'forehandScore'
  | 'backhandScore'

/** Maps short position keys to their score field names in result data */
export const POSITION_SCORE_MAP: Record<PositionKey, ScoreKey> = {
  leftHand: 'leftHandScore',
  rightHand: 'rightHandScore',
  forehand: 'forehandScore',
  backhand: 'backhandScore',
}

export const POSITION_LABELS: Record<PositionKey, string> = {
  leftHand: 'Left Hand',
  rightHand: 'Right Hand',
  forehand: 'Forehand',
  backhand: 'Backhand',
}

export const AGGREGATION_LABELS: Record<AggregationMode, string> = {
  average: 'Average',
  weighted: 'Weighted',
  max: 'Maximum',
  min: 'Minimum',
}

export const POSITION_COLORS: Record<PositionKey, string> = {
  leftHand: '#3b82f6',
  rightHand: '#22c55e',
  forehand: '#f59e0b',
  backhand: '#8b5cf6',
}

// ========================================
// Aggregation types
// ========================================

export interface PositionScores {
  leftHandScore: number
  rightHandScore: number
  forehandScore: number
  backhandScore: number
  totalScore: number
}

export interface AggregatedPlayerRow {
  playerId: string
  playerName: string
  ageGroup: string
  gender: string
  perTestScores: Record<string, PositionScores>
  aggregated: PositionScores
}

// ========================================
// Internal helpers
// ========================================

const ZERO_SCORES: PositionScores = {
  leftHandScore: 0,
  rightHandScore: 0,
  forehandScore: 0,
  backhandScore: 0,
  totalScore: 0,
}

/** Sums scores for only the selected positions */
function sumSelectedPositions(
  scores: Omit<PositionScores, 'totalScore'>,
  positions: PositionKey[]
): number {
  return positions.reduce(
    (sum, pos) => sum + scores[POSITION_SCORE_MAP[pos]],
    0
  )
}

/** Computes the position-filtered total for a single result row */
function getPositionTotal(
  result: DashboardPlayerResult,
  positions: PositionKey[]
): number {
  return positions.reduce(
    (sum, pos) => sum + result[POSITION_SCORE_MAP[pos]],
    0
  )
}

// ========================================
// Aggregation strategies
// ========================================

function aggregateAverage(
  results: DashboardPlayerResult[],
  positions: PositionKey[],
  totalTestCount: number
): PositionScores {
  if (totalTestCount === 0) return { ...ZERO_SCORES }

  const sums = { leftHandScore: 0, rightHandScore: 0, forehandScore: 0, backhandScore: 0 }

  for (const r of results) {
    sums.leftHandScore += r.leftHandScore
    sums.rightHandScore += r.rightHandScore
    sums.forehandScore += r.forehandScore
    sums.backhandScore += r.backhandScore
  }

  const avg = {
    leftHandScore: Math.round(sums.leftHandScore / totalTestCount),
    rightHandScore: Math.round(sums.rightHandScore / totalTestCount),
    forehandScore: Math.round(sums.forehandScore / totalTestCount),
    backhandScore: Math.round(sums.backhandScore / totalTestCount),
  }

  return { ...avg, totalScore: sumSelectedPositions(avg, positions) }
}

function aggregateWeighted(
  results: DashboardPlayerResult[],
  positions: PositionKey[],
  weights: Record<string, number>,
  selectedTestIds: string[]
): PositionScores {
  const totalWeight = selectedTestIds.reduce(
    (sum, id) => sum + (weights[id] ?? 1),
    0
  )
  if (totalWeight === 0) {
    return aggregateAverage(results, positions, selectedTestIds.length)
  }

  const weighted = { leftHandScore: 0, rightHandScore: 0, forehandScore: 0, backhandScore: 0 }

  for (const r of results) {
    const w = weights[r.testId] ?? 1
    weighted.leftHandScore += r.leftHandScore * w
    weighted.rightHandScore += r.rightHandScore * w
    weighted.forehandScore += r.forehandScore * w
    weighted.backhandScore += r.backhandScore * w
  }

  const result = {
    leftHandScore: Number.parseFloat((weighted.leftHandScore / totalWeight).toFixed(2)),
    rightHandScore: Number.parseFloat((weighted.rightHandScore / totalWeight).toFixed(2)),
    forehandScore: Number.parseFloat((weighted.forehandScore / totalWeight).toFixed(2)),
    backhandScore: Number.parseFloat((weighted.backhandScore / totalWeight).toFixed(2)),
  }

  return {
    ...result,
    totalScore: Number.parseFloat(sumSelectedPositions(result, positions).toFixed(2)),
  }
}

function aggregateMax(
  results: DashboardPlayerResult[],
  positions: PositionKey[]
): PositionScores {
  if (results.length === 0) return { ...ZERO_SCORES }

  const max = {
    leftHandScore: Math.max(...results.map((r) => r.leftHandScore)),
    rightHandScore: Math.max(...results.map((r) => r.rightHandScore)),
    forehandScore: Math.max(...results.map((r) => r.forehandScore)),
    backhandScore: Math.max(...results.map((r) => r.backhandScore)),
  }

  return { ...max, totalScore: sumSelectedPositions(max, positions) }
}

function aggregateMin(
  results: DashboardPlayerResult[],
  positions: PositionKey[]
): PositionScores {
  if (results.length === 0) return { ...ZERO_SCORES }

  const min = {
    leftHandScore: Math.min(...results.map((r) => r.leftHandScore)),
    rightHandScore: Math.min(...results.map((r) => r.rightHandScore)),
    forehandScore: Math.min(...results.map((r) => r.forehandScore)),
    backhandScore: Math.min(...results.map((r) => r.backhandScore)),
  }

  return { ...min, totalScore: sumSelectedPositions(min, positions) }
}

// ========================================
// Aggregation dispatch
// ========================================

const AGGREGATION_FN: Record<
  AggregationMode,
  (
    results: DashboardPlayerResult[],
    positions: PositionKey[],
    weights: Record<string, number>,
    selectedTestIds: string[]
  ) => PositionScores
> = {
  average: (results, positions, _w, selectedTestIds) =>
    aggregateAverage(results, positions, selectedTestIds.length),
  weighted: aggregateWeighted,
  max: (results, positions) => aggregateMax(results, positions),
  min: (results, positions) => aggregateMin(results, positions),
}

// ========================================
// Main computation
// ========================================

/**
 * Transforms raw player data into aggregated rows for the dashboard table.
 * Applies client-side search filtering, maps per-test scores, and computes
 * aggregated scores using the selected strategy (average/weighted/max/min).
 */
export function computeAggregatedRows(
  players: DashboardPlayer[],
  selectedTestIds: string[],
  positions: PositionKey[],
  mode: AggregationMode,
  weights: Record<string, number>,
  searchQuery: string
): AggregatedPlayerRow[] {
  const q = searchQuery.trim().toLowerCase()
  const filtered = q
    ? players.filter((p) => p.name.toLowerCase().includes(q))
    : players

  const aggregate = AGGREGATION_FN[mode]

  return filtered.map((player) => {
    const relevantResults = player.results.filter((r) =>
      selectedTestIds.includes(r.testId)
    )

    const perTestScores: AggregatedPlayerRow['perTestScores'] = {}
    for (const r of relevantResults) {
      perTestScores[r.testId] = {
        leftHandScore: r.leftHandScore,
        rightHandScore: r.rightHandScore,
        forehandScore: r.forehandScore,
        backhandScore: r.backhandScore,
        totalScore: getPositionTotal(r, positions),
      }
    }

    return {
      playerId: player.id,
      playerName: player.name,
      ageGroup: player.ageGroup,
      gender: player.gender,
      perTestScores,
      aggregated: aggregate(relevantResults, positions, weights, selectedTestIds),
    }
  })
}
