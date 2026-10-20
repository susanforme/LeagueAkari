import type { RankPoint } from '@shared/pro/profile'

const tiers = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND']
export const rankSteps = [
  ...tiers.flatMap((tier) => ['IV', 'III', 'II', 'I'].map((division) => ({ tier, division }))),
  ...['MASTER', 'GRANDMASTER', 'CHALLENGER'].map((tier) => ({ tier, division: '' }))
]

export function rankIndex(point: Pick<RankPoint, 'tier' | 'division'>) {
  const index = rankSteps.findIndex(
    (rank) => rank.tier === point.tier && (!rank.division || rank.division === point.division)
  )
  return index < 0 ? null : index
}

export function previousRankPoint(points: RankPoint[], index: number, season: number | null) {
  const current = points[index],
    previous = points[index - 1]
  // Unknown seasons and placement transitions must not imply a comparable LP gain.
  return season !== null &&
    previous &&
    current &&
    !previous.isProvisional &&
    !current.isProvisional &&
    rankIndex(previous) !== null &&
    rankIndex(current) !== null
    ? previous
    : null
}
