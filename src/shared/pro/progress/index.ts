import { z } from 'zod'

import { playerSchema } from '../champion-pool'
import type { ReviewReport } from '../review'

export const PROGRESS_NAMESPACE = 'pro-progress-main'
export const PROGRESS_ROUTE = 'pro-progress'
export const metricIds = [
  'cs10',
  'cs15',
  'goldDiff10',
  'goldDiff15',
  'csPerMin',
  'deathsPer10',
  'goldDeficit10',
  'deathBeforeObjective'
] as const
export type MetricId = (typeof metricIds)[number]
export const insightSchema = z.object({
  reportId: z.string().uuid(),
  allChampions: z.boolean().default(false)
})
export interface MetricSample {
  reportId: string
  gameId: number
  startedAt: number
  value: number
  timestamp?: number
}
export interface BaselineMetric {
  id: MetricId
  current: number | null
  median: number | null
  q1: number | null
  q3: number | null
  samples: MetricSample[]
  excluded: number
}
export interface Insights {
  metrics: BaselineMetric[]
  scanned: number
  truncated: boolean
}
export const goalSchema = z.object({
  reportId: z.string().uuid(),
  allChampions: z.boolean().default(false),
  metric: z.enum(metricIds),
  title: z.string().trim().min(1).max(120),
  target: z.number().finite().min(-100000).max(100000),
  direction: z.enum(['increase', 'decrease'])
})
export type GoalRequest = z.infer<typeof goalSchema>
export const goalChangeSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  state: z.enum(['draft', 'active', 'paused', 'completed', 'abandoned'])
})
export interface TrainingGoal extends GoalRequest {
  id: string
  revision: number
  createdAt: number
  state: z.infer<typeof goalChangeSchema>['state']
  player: z.infer<typeof playerSchema>
  scope: {
    queueId: number
    position: string
    patch: string
    championId: number | null
    version: number
  }
  baseline: MetricSample[]
}
export interface GoalProgress {
  goal: TrainingGoal
  samples: MetricSample[]
  excluded: number
  truncated: boolean
}
export const batchSchema = playerSchema.extend({
  gameIds: z.array(z.number().int().positive()).min(1).max(200)
})
export interface ReviewBatch {
  id: string
  player: z.infer<typeof playerSchema>
  updatedAt: number
  state: 'preview' | 'running' | 'completed' | 'partial' | 'cancelled' | 'interrupted'
  items: { gameId: number; state: 'pending' | 'ready' | 'partial' | 'failed'; reportId?: string }[]
}
export type ReportScope = Pick<ReviewReport, 'player' | 'analysis'>
