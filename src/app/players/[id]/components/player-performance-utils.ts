type ScoreLike = {
  leftHandScore: number
  rightHandScore: number
  forehandScore: number
  backhandScore: number
}

export const calculateTotalScore = (result: ScoreLike): number =>
  result.leftHandScore +
  result.rightHandScore +
  result.forehandScore +
  result.backhandScore

export const calculatePlayerStats = (results: ScoreLike[]) => {
  if (results.length === 0) return null

  const totals = results.map(calculateTotalScore)
  const totalScoreSum = totals.reduce((sum, score) => sum + score, 0)

  return {
    bestScore: Math.max(...totals),
    avgScore: (totalScoreSum / totals.length).toFixed(1),
    testsCount: totals.length,
  }
}
