import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import { z } from 'zod'

export const CHAMPION_POOL_NAMESPACE = 'pro-champion-pool-main'
export const CHAMPION_POOL_ROUTE = 'pro-champion-pool'
export const MAX_CACHED_ANALYSIS = 10_000
export const positions = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'UNKNOWN'] as const

export const playerSchema = z.object({
  serverId: z.string().trim().min(1).max(80),
  puuid: z.string().trim().min(1).max(128)
})
export type PlayerIdentity = z.infer<typeof playerSchema>
export interface PoolPlayer extends PlayerIdentity {
  name: string
  updatedAt: number
}

export const querySchema = playerSchema
  .extend({
    queueIds: z.array(z.number().int().min(1).max(999_999)).max(32).default([420]),
    position: z.enum(positions).nullable().default(null),
    patch: z
      .string()
      .regex(/^\d+\.\d+$/)
      .max(20)
      .nullable()
      .default(null),
    from: z.number().int().nonnegative().nullable().default(null),
    to: z.number().int().nonnegative().nullable().default(null),
    championId: z.number().int().positive().nullable().default(null),
    sort: z.enum(['games', 'winRate', 'kda', 'csPerMin', 'damageShare']).default('games'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
    page: z.number().int().min(1).max(10_000).default(1),
    pageSize: z.number().int().min(1).max(100).default(20)
  })
  .refine((q) => q.from === null || q.to === null || q.from <= q.to, {
    message: 'Invalid date range'
  })
export type PoolQuery = z.infer<typeof querySchema>
export const matchQuerySchema = querySchema.safeExtend({ championId: z.number().int().positive() })
export type PoolMatchQuery = z.infer<typeof matchQuerySchema>
export interface PoolMatchPage {
  items: LcuOrSgpGameSummary[]
  total: number
}
export const syncSchema = playerSchema.extend({
  name: z.string().trim().max(150),
  count: z.number().int().min(20).max(1000).default(200),
  preferredSource: z.enum(['sgp', 'lcu']).default('sgp')
})
export type SyncRequest = z.infer<typeof syncSchema>

export interface PoolMatch {
  gameId: number
  championId: number | null
  queueId: number
  position: (typeof positions)[number]
  patch: string
  startedAt: number
  outcome: 'win' | 'loss' | 'remake' | 'unknown'
  kills: number | null
  deaths: number | null
  assists: number | null
  csPerMin: number | null
  damageShare: number | null
}
export interface SampleMetric {
  value: number | null
  samples: number
  excluded: Partial<Record<'missing' | 'zeroDenominator' | 'unknownOutcome', number>>
}
export interface ChampionStats {
  championId: number | null
  games: number
  winRate: SampleMetric
  kda: SampleMetric
  csPerMin: SampleMetric
  damageShare: SampleMetric
}
export interface PoolResult {
  items: ChampionStats[]
  topChampions: { championId: number | null; games: number }[]
  championIds: number[]
  totalChampions: number
  cachedMatches: number
  scannedMatches: number
  filteredMatches: number
  from: number | null
  to: number | null
  truncated: boolean
}
export interface SyncStatus {
  player: PlayerIdentity | null
  running: boolean
  processed: number
  requested: number
  cancelled: boolean
  error: string | null
}
export interface PoolStatus {
  storage: 'ready' | 'unavailable' | 'newer-version'
  sync: SyncStatus
}

export const resourceLocaleSchema = z.enum(['zh-CN', 'en'])
export type ResourceLocale = z.infer<typeof resourceLocaleSchema>
export const resourceCatalogSchema = z.object({
  champions: z.record(z.string(), z.string()),
  championSearch: z.record(z.string(), z.string()).optional(),
  queues: z.record(z.string(), z.string())
})
export type ResourceCatalog = z.infer<typeof resourceCatalogSchema>
