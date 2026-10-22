import { z } from 'zod'

import type { LcuOrSgpGameSummary } from '../../data-adapter/wrapper'
import { type PoolMatch, playerSchema } from '../champion-pool'
import type { PlanStatus } from './plan'

export const EXPERIENCE_NAMESPACE = 'pro-experience-main'
export const pageNames = [
  'pro-champion-pool',
  'pro-profile',
  'pro-notebook',
  'pro-review',
  'pro-progress'
] as const
export const workspaceSchema = z
  .object({
    route: z.enum(pageNames),
    query: z
      .record(
        z.string().max(80),
        z.union([z.string().max(500), z.array(z.string().max(500)).max(32), z.null()])
      )
      .default({}),
    pages: z.partialRecord(z.enum(pageNames), z.record(z.string().max(80), z.json())).default({})
  })
  .refine((value) => JSON.stringify(value).length <= 32_000)
export type Workspace = z.infer<typeof workspaceSchema>
export const reminderSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  games: z.number().int().min(0).max(100).default(5),
  minutes: z.number().int().min(0).max(1440).default(120),
  losses: z.number().int().min(0).max(100).default(3)
})
export const preferencesSchema = z.object({
  restore: z.boolean(),
  archive: z.boolean(),
  reminder: reminderSettingsSchema.prefault({})
})
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>
export interface PlayReminder {
  id: string
  games: number
  minutes: number
  losses: number
  reasons: ('games' | 'minutes' | 'losses')[]
  planned?: boolean
}
export type ExperiencePreferences = z.infer<typeof preferencesSchema>
export const sceneValuesSchema = z.object({
  autoAccept: z.boolean(),
  autoHonor: z.boolean(),
  playAgain: z.boolean(),
  autoMatchmaking: z.boolean(),
  auxWindow: z.boolean(),
  opggWindow: z.boolean()
})
export type SceneValues = z.infer<typeof sceneValuesSchema>
export const sceneSchema = z.object({
  name: z.string().trim().min(1).max(40),
  values: sceneValuesSchema
})
export type Scene = z.infer<typeof sceneSchema>
export interface ExperienceStatus {
  account: z.infer<typeof playerSchema> | null
  accountKey: string
  preferences: ExperiencePreferences
  reminder: PlayReminder | null
  plan: PlanStatus | null
  scene: string | null
  values: SceneValues
}
export interface LocalGame {
  match: PoolMatch
  summary: LcuOrSgpGameSummary
}
export interface SearchRecords {
  notes: { id: string; championId: number; title: string }[]
  reports: { id: string; championId: number; gameId: number; startedAt: number }[]
}
export interface SessionSummary {
  from: number
  to: number
  games: number
  wins: number
  losses: number
  remakes: number
  durationSeconds: number
  champions: { championId: number; games: number }[]
  gameIds: number[]
}
export interface Partner {
  puuid: string
  name: string
  games: number
  wins: number
  losses: number
  gameIds: number[]
  combinations: { own: number; partner: number; games: number }[]
}
export interface SocialSummary {
  session: SessionSummary | null
  partners: Partner[]
  scanned: number
  truncated: boolean
  ranks: { queue: string; before: string; after: string }[]
}
export const sharedGamesSchema = playerSchema.extend({
  gameIds: z.array(z.number().int().positive()).max(100)
})
export const shareSchema = z.object({
  png: z.string().startsWith('data:image/png;base64,').max(8_000_000),
  action: z.enum(['copy', 'save'])
})
