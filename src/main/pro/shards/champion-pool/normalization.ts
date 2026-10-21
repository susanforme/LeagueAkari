import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import { computeWinResult } from '@shared/data-adapter/match-history/win-result'
import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import { type PoolMatch, positions } from '@shared/pro/champion-pool'

const numberOrNull = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null

export function normalizeMatch(summary: LcuOrSgpGameSummary, puuid: string): PoolMatch {
  const basic = toBasicInfo(summary)
  if (
    !Number.isSafeInteger(basic.gameId) ||
    basic.gameId <= 0 ||
    !Number.isFinite(basic.gameCreation) ||
    basic.gameCreation < 0
  ) {
    throw new Error('Invalid match identity')
  }
  const participants =
    summary.source === 'sgp'
      ? summary.data.json.participants.map((p) => ({
          puuid: p.puuid,
          championId: p.championId,
          teamId: p.teamId,
          position: p.teamPosition,
          stats: p
        }))
      : summary.data.participants.map((p) => ({
          puuid: summary.data.participantIdentities.find(
            (id) => id.participantId === p.participantId
          )?.player.puuid,
          championId: p.championId,
          teamId: p.teamId,
          position: 'UNKNOWN',
          stats: p.stats
        }))
  const player = participants.find((p) => p.puuid === puuid)
  if (!player) throw new Error('Match does not contain the requested player')
  const stats = player.stats
  const team = participants.filter((p) => p.teamId === player.teamId)
  const teamDamage = team.map((p) => numberOrNull(p.stats.totalDamageDealtToChampions))
  // RiftMind damage share requires all five teammates; incomplete LCU lists stay missing.
  const denominator =
    teamDamage.length === 5 && teamDamage.every((n) => n !== null)
      ? teamDamage.reduce<number>((sum, n) => sum + n!, 0)
      : null
  const teamKills = team.map((p) => numberOrNull(p.stats.kills))
  const totalKills =
    teamKills.length === 5 && teamKills.every((n) => n !== null)
      ? teamKills.reduce<number>((sum, n) => sum + n!, 0)
      : null
  const kills = numberOrNull(stats.kills),
    assists = numberOrNull(stats.assists)
  const vision = numberOrNull(stats.visionScore)
  const damage = numberOrNull(stats.totalDamageDealtToChampions)
  const laneCs = numberOrNull(stats.totalMinionsKilled)
  const jungleCs = numberOrNull(stats.neutralMinionsKilled)
  const result = computeWinResult(basic.endOfGameResult, stats).result
  return {
    gameId: basic.gameId,
    championId: numberOrNull(player.championId) || null,
    queueId: basic.queueId,
    startedAt: basic.gameCreation,
    position: positions.includes(player.position as (typeof positions)[number])
      ? (player.position as (typeof positions)[number])
      : 'UNKNOWN',
    patch: basic.gameVersion?.split('.').slice(0, 2).join('.') || '',
    outcome:
      result === 'abort' || result === 'remake'
        ? 'remake'
        : typeof stats.win === 'boolean'
          ? result
          : 'unknown',
    kills: numberOrNull(stats.kills),
    deaths: numberOrNull(stats.deaths),
    assists: numberOrNull(stats.assists),
    csPerMin:
      laneCs !== null && jungleCs !== null && basic.gameDuration > 0
        ? (laneCs + jungleCs) / (basic.gameDuration / 60)
        : null,
    killParticipation:
      kills !== null && assists !== null && totalKills !== null && totalKills > 0
        ? (kills + assists) / totalKills
        : null,
    visionPerMin:
      vision !== null && basic.gameDuration > 0 ? vision / (basic.gameDuration / 60) : null,
    damageShare:
      damage !== null && denominator !== null && denominator > 0 ? damage / denominator : null
  }
}
