import type { RankedStats } from '@shared/types/league-client/ranked'
import type { SummonerInfo } from '@shared/types/league-client/summoner'
import { z } from 'zod'

import { type PlayerIdentity, playerSchema } from '../champion-pool'

export const PROFILE_NAMESPACE = 'pro-profile-main'
export const PROFILE_ROUTE = 'pro-profile'
export const profileHistorySchema = playerSchema.extend({
  page: z.number().int().min(1).max(100_000).default(1)
})
export const rankedQueues = ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR'] as const
export const profileTrendSchema = playerSchema.extend({
  queue: z.enum(rankedQueues),
  season: z.number().int().nullable().optional()
})
export type ProfileTrendQuery = z.infer<typeof profileTrendSchema>
export interface RankPoint {
  id: string
  observedAt: number
  reason: ProfileSnapshot['reason']
  tier: string
  division: string
  leaguePoints: number
  isProvisional: boolean
  wins: number
  losses: number
}
export interface ProfileTrend {
  seasons: (number | null)[]
  season: number | null
  points: RankPoint[]
}
export interface ActivityPeriod {
  games: number
  activeDays: number
  wins: number
  losses: number
  durationSeconds: number
  durationSamples: number
}
export interface ProfileActivity {
  from: number
  to: number
  truncated: boolean
  month: ActivityPeriod
  recentWeek: ActivityPeriod
  previousWeek: ActivityPeriod
  days: (ActivityPeriod & { date: number })[]
}
export interface ProfileSnapshot extends PlayerIdentity {
  id: string
  observedAt: number
  reason: 'connected' | 'rankedUpdate' | 'endGame' | 'manual'
  summoner: SummonerInfo
  ranked: RankedStats
}
export interface ProfileStatus {
  current: PlayerIdentity | null
  error: boolean
  capturing: boolean
}

// Validate the fields used for history, retaining the API's season summary fields.
export const rankedSnapshotSchema = z
  .object({
    queues: z
      .array(
        z
          .object({
            queueType: z.string().min(1),
            tier: z.string(),
            division: z.string(),
            leaguePoints: z.number().finite().nonnegative(),
            wins: z.number().int().nonnegative(),
            losses: z.number().int().nonnegative(),
            isProvisional: z.boolean()
          })
          .passthrough()
      )
      .max(50),
    seasons: z
      .record(
        z.string(),
        z
          .object({
            currentSeasonId: z.number().int(),
            currentSeasonEnd: z.number().finite(),
            nextSeasonStart: z.number().finite()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough()
