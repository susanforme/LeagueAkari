import type { LcuOrSgpGameDetails, LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import { z } from 'zod'

import type { PoolMatch } from '../champion-pool'
import { playerSchema } from '../champion-pool'

export const REVIEW_NAMESPACE = 'pro-review-main'
export const REVIEW_ROUTE = 'pro-review'
export const REVIEW_VERSION = 1
export const reviewRequestSchema = playerSchema.extend({
  gameId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  refresh: z.boolean().default(false)
})
export type ReviewRequest = z.infer<typeof reviewRequestSchema>
export const reportIdSchema = z.string().uuid()
export const reviewListSchema = z.object({
  page: z.number().int().min(1).max(100_000).default(1)
})
export interface ReviewPoint {
  timestamp: number
  gold: number | null
  cs: number | null
  xp: number | null
  goldDiff: number | null
  csDiff: number | null
}
export interface ReviewEvent {
  id: string
  timestamp: number
  type: string
  killerId?: number
  victimId?: number
  participantId?: number
  itemId?: number
  teamId?: number
  killerTeamId?: number
  assistingParticipantIds?: number[]
  monsterType?: string
  monsterSubType?: string
  buildingType?: string
  laneType?: string
  position?: { x: number; y: number }
}
export interface ReviewAnalysis {
  version: number
  duration: number
  participantId: number
  opponentId: number | null
  participants: { id: number; championId: number; teamId: number }[]
  metrics: PoolMatch
  points: ReviewPoint[]
  checkpoints: { target: number; point: ReviewPoint | null }[]
  events: ReviewEvent[]
  limitations: ('timelineMissing' | 'opponentUnknown' | 'unsupportedMode')[]
}
export interface ReviewReport {
  id: string
  player: z.infer<typeof playerSchema>
  createdAt: number
  summary: LcuOrSgpGameSummary
  details: LcuOrSgpGameDetails | null
  analysis: ReviewAnalysis
}
export interface ReviewListItem {
  id: string
  serverId: string
  puuid: string
  gameId: number
  championId: number
  startedAt: number
  createdAt: number
}
export const formatGameTime = (milliseconds: number) =>
  `${Math.floor(milliseconds / 60_000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}`

export function pointAt(points: ReviewPoint[], timestamp: number, duration: number) {
  if (timestamp > duration) return null
  const point = points.findLast((p) => p.timestamp <= timestamp)
  return point && timestamp - point.timestamp <= 60_000 ? point : null
}

export function eventWindow(analysis: ReviewAnalysis, timestamp: number, radius = 60_000) {
  if (!Number.isFinite(radius) || radius < 15_000 || radius > 600_000)
    throw new Error('Invalid event window')
  const from = Math.max(0, timestamp - radius)
  const to = Math.min(analysis.duration, timestamp + radius)
  return {
    from,
    to,
    before: pointAt(analysis.points, from, analysis.duration),
    after: pointAt(analysis.points, to, analysis.duration),
    events: analysis.events.filter((event) => event.timestamp >= from && event.timestamp <= to)
  }
}
