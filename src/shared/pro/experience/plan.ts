import { z } from 'zod'

import { toBasicInfo } from '../../data-adapter/match-history/match-basic'
import { type PlayerIdentity, playerSchema } from '../champion-pool'
import type { LocalGame } from './index'

const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const focusSchema = z.object({
  reportId: z.string().uuid(),
  timestamp: time,
  text: z.string().trim().min(1).max(300),
  championId: z.number().int().positive()
})
export const playPlanSchema = z.object({
  revision: z.number().int().nonnegative(),
  focus: focusSchema.nullable(),
  session: z
    .object({
      id: z.string().uuid(),
      startedAt: time,
      endedAt: time.nullable(),
      games: z.number().int().min(1).max(20),
      minutes: z.number().int().min(15).max(720),
      breakUntil: time.nullable()
    })
    .nullable()
})
export type PlayPlan = z.infer<typeof playPlanSchema>
export interface FocusPage {
  items: { player: PlayerIdentity; plan: PlayPlan }[]
  total: number
}
export const planChangeSchema = z.object({
  player: playerSchema,
  revision: z.number().int().nonnegative(),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('focus'), value: focusSchema }),
    z.object({ kind: z.literal('clearFocus') }),
    z.object({
      kind: z.literal('start'),
      games: z.number().int().min(1).max(20),
      minutes: z.number().int().min(15).max(720)
    }),
    z.object({ kind: z.literal('end') }),
    z.object({ kind: z.literal('rest'), minutes: z.number().int().min(1).max(120) })
  ])
})
export type PlanChange = z.infer<typeof planChangeSchema>
export interface PlanStatus {
  plan: PlayPlan
  progress: {
    games: number
    minutes: number
    wins: number
    losses: number
    missingDurations: number
    reached: boolean
  }
}
export function planProgress(plan: PlayPlan, matches: LocalGame[]) {
  const session = plan.session
  const selected = session
    ? matches.filter(
        ({ match: m }) =>
          m.startedAt >= session.startedAt &&
          (session.endedAt === null || m.startedAt <= session.endedAt)
      )
    : []
  const games = selected.filter((m) => m.match.outcome !== 'remake').length
  const durations = selected.map((m) => toBasicInfo(m.summary).gameDuration)
  const valid = durations.filter((d) => Number.isFinite(d) && d > 0)
  const minutes = Math.floor(valid.reduce((total, d) => total + d, 0) / 60)
  return {
    games,
    minutes,
    wins: selected.filter((m) => m.match.outcome === 'win').length,
    losses: selected.filter((m) => m.match.outcome === 'loss').length,
    missingDurations: durations.length - valid.length,
    reached: !!session && (games >= session.games || minutes >= session.minutes)
  }
}
