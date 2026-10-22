import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import { toParticipants } from '@shared/data-adapter/match-history/participants'
import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import {
  MAX_LOCAL_MATCHES_ANALYZED,
  type PoolMatch,
  type SampleMetric
} from '@shared/pro/champion-pool'
import type { MatchupQuery, MatchupResult, MatchupStats } from '@shared/pro/champion-pool/matchups'
import { REVIEW_VERSION, type ReviewPoint } from '@shared/pro/review'
import { findOpponent } from '@shared/pro/review/opponent'
import type { DataSource } from 'typeorm'

export async function loadMatchups(
  database: DataSource,
  query: MatchupQuery
): Promise<MatchupResult> {
  const rows: {
    projection: string
    summary: string
    reportId: string | null
    opponentId: number | null
    checkpoints: string | null
  }[] = await database.query(
    `SELECT m.projection,m.summary,r.id reportId,
      json_extract(r.report,'$.analysis.opponentId') opponentId,
      json_extract(r.report,'$.analysis.checkpoints') checkpoints
     FROM PoolMatches m LEFT JOIN ReviewReports r ON r.id=(
       SELECT id FROM ReviewReports WHERE serverId=m.serverId AND puuid=m.puuid AND gameId=m.gameId
       AND json_extract(report,'$.analysis.version')=? ORDER BY createdAt DESC,rowid DESC LIMIT 1
     ) WHERE m.serverId=? AND m.puuid=? ORDER BY m.startedAt DESC,m.gameId DESC LIMIT ?`,
    [REVIEW_VERSION, query.serverId, query.puuid, MAX_LOCAL_MATCHES_ANALYZED + 1]
  )
  const missingTimelineGameIds: number[] = []
  const groups = new Map<number, MatchupStats>()
  const matches: MatchupResult['matches'] = []
  let excluded = 0
  const empty = (): SampleMetric => ({ value: null, samples: 0, excluded: {} })
  const add = (
    metric: SampleMetric,
    value: number | null,
    reason: 'missing' | 'unknownOutcome' = 'missing'
  ) => {
    if (value === null || !Number.isFinite(value))
      metric.excluded[reason] = (metric.excluded[reason] ?? 0) + 1
    else {
      metric.value = ((metric.value ?? 0) * metric.samples + value) / (metric.samples + 1)
      metric.samples++
    }
  }
  for (const row of rows.slice(0, MAX_LOCAL_MATCHES_ANALYZED)) {
    const match: PoolMatch = JSON.parse(row.projection)
    if (
      match.outcome === 'remake' ||
      match.championId !== query.championId ||
      (query.queueIds.length && !query.queueIds.includes(match.queueId)) ||
      (query.position !== null && query.position !== match.position) ||
      (query.patch !== null && query.patch !== match.patch) ||
      (query.from !== null && match.startedAt < query.from) ||
      (query.to !== null && match.startedAt > query.to)
    )
      continue
    const summary: LcuOrSgpGameSummary = JSON.parse(row.summary)
    const basic = toBasicInfo(summary)
    const opponent = findOpponent(basic, toParticipants(summary, basic), query.puuid)
    if (!opponent) {
      excluded++
      continue
    }
    let stats = groups.get(opponent.championId)
    if (!stats) {
      stats = {
        opponentId: opponent.championId,
        games: 0,
        winRate: empty(),
        goldDiff10: empty(),
        csDiff10: empty()
      }
      groups.set(opponent.championId, stats)
    }
    stats.games++
    add(
      stats.winRate,
      match.outcome === 'win' ? 1 : match.outcome === 'loss' ? 0 : null,
      'unknownOutcome'
    )
    const checkpoints: { target: number; point: ReviewPoint | null }[] = row.checkpoints
      ? JSON.parse(row.checkpoints)
      : []
    const point =
      row.opponentId === opponent.participantId
        ? checkpoints.find((p) => p.target === 600000)?.point
        : null
    if (basic.gameDuration >= 600 && (!point || point.goldDiff === null || point.csDiff === null)) {
      missingTimelineGameIds.push(match.gameId)
    }
    add(stats.goldDiff10, point?.goldDiff ?? null)
    add(stats.csDiff10, point?.csDiff ?? null)
    if (query.opponentId === opponent.championId)
      matches.push({
        gameId: match.gameId,
        startedAt: match.startedAt,
        outcome: match.outcome,
        reportId: row.reportId
      })
  }
  const items = [...groups.values()].sort(
    (a, b) => b.games - a.games || a.opponentId - b.opponentId
  )
  return {
    missingTimelineGameIds,
    items,
    total: items.reduce((sum, item) => sum + item.games, 0),
    excluded,
    truncated: rows.length > MAX_LOCAL_MATCHES_ANALYZED,
    matches: matches.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
    matchCount: matches.length
  }
}
