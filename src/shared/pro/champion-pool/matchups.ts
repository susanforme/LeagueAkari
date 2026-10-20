import { z } from 'zod'

import { type SampleMetric, matchQuerySchema } from './index'

export const matchupQuerySchema = matchQuerySchema.safeExtend({
  opponentId: z.number().int().positive().nullable().default(null)
})
export type MatchupQuery = z.infer<typeof matchupQuerySchema>
export interface MatchupStats {
  opponentId: number
  games: number
  winRate: SampleMetric
  goldDiff10: SampleMetric
  csDiff10: SampleMetric
}
export interface MatchupResult {
  items: MatchupStats[]
  total: number
  excluded: number
  truncated: boolean
  matches: { gameId: number; startedAt: number; outcome: string; reportId: string | null }[]
  matchCount: number
}
