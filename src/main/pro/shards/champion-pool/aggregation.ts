import {
  type ChampionStats,
  MAX_CACHED_ANALYSIS,
  type PoolMatch,
  type PoolQuery,
  type PoolResult,
  type SampleMetric
} from '@shared/pro/champion-pool'

function sample(
  matches: PoolMatch[],
  value: (match: PoolMatch) => number | null,
  reason: (match: PoolMatch) => keyof SampleMetric['excluded'] = () => 'missing'
): SampleMetric {
  const metric: SampleMetric = { value: null, samples: 0, excluded: {} }
  let sum = 0
  for (const match of matches) {
    const n = value(match)
    if (n !== null && Number.isFinite(n)) {
      sum += n
      metric.samples++
    } else {
      const key = reason(match)
      metric.excluded[key] = (metric.excluded[key] ?? 0) + 1
    }
  }
  metric.value = metric.samples ? sum / metric.samples : null
  return metric
}

export function aggregatePool(
  matches: PoolMatch[],
  query: PoolQuery,
  cachedMatches: number
): PoolResult {
  const scanned = matches
    .toSorted((a, b) => b.startedAt - a.startedAt || b.gameId - a.gameId)
    .slice(0, MAX_CACHED_ANALYSIS)
  const filtered = scanned.filter(
    (m) =>
      m.outcome !== 'remake' &&
      (!query.queueIds.length || query.queueIds.includes(m.queueId)) &&
      (query.championId === null || m.championId === query.championId) &&
      (query.position === null || m.position === query.position) &&
      (query.patch === null || m.patch === query.patch) &&
      (query.from === null || m.startedAt >= query.from) &&
      (query.to === null || m.startedAt <= query.to)
  )
  const groups = new Map<number | null, PoolMatch[]>()
  for (const match of filtered) {
    const group = groups.get(match.championId) ?? []
    group.push(match)
    groups.set(match.championId, group)
  }
  const champions: ChampionStats[] = Array.from(groups, ([championId, games]) => ({
    championId,
    games: games.length,
    winRate: sample(
      games,
      (m) => (m.outcome === 'win' ? 1 : m.outcome === 'loss' ? 0 : null),
      () => 'unknownOutcome'
    ),
    kda: sample(
      games,
      (m) =>
        m.kills !== null && m.assists !== null && m.deaths !== null && m.deaths > 0
          ? (m.kills + m.assists) / m.deaths
          : null,
      (m) => (m.deaths === 0 ? 'zeroDenominator' : 'missing')
    ),
    csPerMin: sample(games, (m) => m.csPerMin),
    damageShare: sample(games, (m) => m.damageShare)
  }))
  const topChampions = champions
    .toSorted((a, b) => b.games - a.games || (a.championId ?? 0) - (b.championId ?? 0))
    .slice(0, 6)
    .map(({ championId, games }) => ({ championId, games }))
  const value = (s: ChampionStats) => (query.sort === 'games' ? s.games : s[query.sort].value)
  champions.sort((a, b) => {
    const av = value(a),
      bv = value(b)
    if (av === null && bv !== null) return 1
    if (bv === null && av !== null) return -1
    const difference = (av ?? 0) - (bv ?? 0)
    return (
      (query.sortDirection === 'asc' ? difference : -difference) ||
      (a.championId ?? 0) - (b.championId ?? 0)
    )
  })
  return {
    items: champions.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
    championIds: [...new Set(scanned.flatMap((m) => (m.championId ? [m.championId] : [])))],
    topChampions,
    totalChampions: champions.length,
    cachedMatches,
    scannedMatches: scanned.length,
    filteredMatches: filtered.length,
    from: filtered.at(-1)?.startedAt ?? null,
    to: filtered[0]?.startedAt ?? null,
    truncated: cachedMatches > MAX_CACHED_ANALYSIS
  }
}
