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

export function rankPeriods(points: RankPoint[], period: 'record' | 'day' | 'week' | 'month') {
  const groups = new Map<number, RankPoint[]>()
  for (const [index, point] of [...points].sort((a, b) => a.observedAt - b.observedAt).entries()) {
    const date = new Date(point.observedAt)
    if (period !== 'record') date.setHours(0, 0, 0, 0)
    if (period === 'week') date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
    if (period === 'month') date.setDate(1)
    const key = period === 'record' ? index : date.getTime()
    const group = groups.get(key) ?? []
    group.push(point)
    groups.set(key, group)
  }
  return [...groups]
    .sort(([a], [b]) => a - b)
    .map(([at, values]) => {
      const valid = values.filter((p) => !p.isProvisional && rankIndex(p) !== null)
      const ranks = valid.map((p) => rankIndex(p)!),
        lp = valid.map((p) => p.leaguePoints)
      return {
        at: period === 'record' ? values[0].observedAt : at,
        point: values.at(-1)!,
        rank: ranks.length ? [Math.min(...ranks), Math.max(...ranks)] : null,
        lp: lp.length ? [Math.min(...lp), Math.max(...lp)] : null
      }
    })
}
