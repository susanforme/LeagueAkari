import { toFrames } from '@shared/data-adapter/match-history/frames'
import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import { toParticipants } from '@shared/data-adapter/match-history/participants'
import type { LcuOrSgpGameDetails, LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import { REVIEW_VERSION, type ReviewAnalysis, pointAt } from '@shared/pro/review'
import { findOpponent } from '@shared/pro/review/opponent'
import { z } from 'zod'

import { normalizeMatch } from '../champion-pool/normalization'

const number = z.number().finite().nonnegative().nullish()
const frameSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  participantFrames: z.record(
    z.string(),
    z.object({
      totalGold: number,
      xp: number,
      minionsKilled: number,
      jungleMinionsKilled: number
    })
  ),
  events: z
    .array(
      z.object({
        type: z.string(),
        timestamp: z.number().int().nonnegative(),
        killerId: z.number().int().nonnegative().optional(),
        victimId: z.number().int().nonnegative().optional(),
        participantId: z.number().int().nonnegative().optional(),
        itemId: z.number().int().nonnegative().optional(),
        teamId: z.number().int().optional(),
        killerTeamId: z.number().int().optional(),
        assistingParticipantIds: z.array(z.number().int()).optional(),
        monsterType: z.string().optional(),
        monsterSubType: z.string().optional(),
        buildingType: z.string().optional(),
        laneType: z.string().optional(),
        position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional()
      })
    )
    .max(50_000)
})
const sum = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? null : a + b
const diff = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? null : a - b

export function analyzeMatch(
  summary: LcuOrSgpGameSummary,
  details: LcuOrSgpGameDetails | null,
  puuid: string
): ReviewAnalysis {
  const basic = toBasicInfo(summary)
  if (
    basic.gameId !== summary.gameId ||
    !Number.isFinite(basic.gameDuration) ||
    basic.gameDuration <= 0 ||
    basic.gameDuration > 43_200
  )
    throw new Error('Invalid match duration or identity')
  const participants = toParticipants(summary, basic)
  const players = participants.filter((p) => p.puuid === puuid)
  if (
    players.length !== 1 ||
    new Set(participants.map((p) => p.participantId)).size !== participants.length
  )
    throw new Error('Ambiguous match participants')
  const player = players[0]
  const supported = basic.mapId === 11 && basic.gameMode === 'CLASSIC'
  const opponent = findOpponent(basic, participants, puuid)
  if (details && (details.gameId !== summary.gameId || details.source !== summary.source))
    throw new Error('Timeline does not match summary')
  if (
    details?.source === 'sgp' &&
    (details.data.json.gameId !== basic.gameId ||
      !details.data.json.participants.some(
        (p) => p.puuid === puuid && p.participantId === player.participantId
      ))
  )
    throw new Error('Timeline participant identity mismatch')
  const frames = details
    ? z
        .array(frameSchema)
        .max(10_000)
        .parse(toFrames(details))
        .map((frame, index) => ({ ...frame, index }))
        .sort((a, b) => a.timestamp - b.timestamp)
    : []
  if (new Set(frames.map((f) => f.timestamp)).size !== frames.length)
    throw new Error('Duplicate timeline frames')
  const duration = basic.gameDuration * 1000
  const points = frames
    .filter((f) => f.timestamp <= duration)
    .map((frame) => {
      const own = frame.participantFrames[player.participantId]
      const enemy = opponent ? frame.participantFrames[opponent.participantId] : undefined
      const cs = sum(own?.minionsKilled, own?.jungleMinionsKilled)
      return {
        timestamp: frame.timestamp,
        gold: own?.totalGold ?? null,
        cs,
        xp: own?.xp ?? null,
        goldDiff: diff(own?.totalGold, enemy?.totalGold),
        csDiff: diff(cs, sum(enemy?.minionsKilled, enemy?.jungleMinionsKilled))
      }
    })
  return {
    version: REVIEW_VERSION,
    duration,
    participantId: player.participantId,
    opponentId: opponent?.participantId ?? null,
    participants: participants.map((p) => ({
      id: p.participantId,
      championId: p.championId,
      teamId: p.teamId
    })),
    metrics: normalizeMatch(summary, puuid),
    points,
    checkpoints: [600_000, 900_000].map((target) => ({
      target,
      point: pointAt(points, target, duration)
    })),
    events: frames
      .flatMap((frame) =>
        frame.events
          .map((event, ei) => ({ ...event, id: `${frame.index}:${ei}` }))
          .filter(
            (event) =>
              event.timestamp <= duration &&
              [
                'CHAMPION_KILL',
                'ELITE_MONSTER_KILL',
                'BUILDING_KILL',
                'ITEM_PURCHASED',
                'ITEM_SOLD',
                'ITEM_UNDO'
              ].includes(event.type)
          )
      )
      .sort((a, b) => a.timestamp - b.timestamp),
    limitations: [
      ...(!frames.length ? ['timelineMissing' as const] : []),
      ...(!opponent ? ['opponentUnknown' as const] : []),
      ...(!supported ? ['unsupportedMode' as const] : [])
    ]
  }
}
