import {
  type ResourceCatalog,
  type ResourceLocale,
  resourceCatalogSchema
} from '@shared/pro/champion-pool'
import { z } from 'zod'

import type { ChampionPoolContext } from './context'

const rowsSchema = z.array(
  z.object({
    id: z.number().int(),
    name: z.string(),
    description: z.string().optional(),
    alias: z.string().optional()
  })
)
const base = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global'
const SYNC_INTERVAL_MS = 86_400_000
const RETRY_INTERVAL_MS = 60_000

export class ResourceLoader {
  private readonly _requests = new Map<ResourceLocale, Promise<ResourceCatalog>>()
  private readonly _abort = new AbortController()

  private readonly _refreshes = new Map<ResourceLocale, Promise<ResourceCatalog>>()
  private readonly _retryAfter = new Map<ResourceLocale, number>()
  constructor(
    private readonly _context: ChampionPoolContext,
    private readonly _changed: (locale: ResourceLocale, failed: boolean) => void = () => {}
  ) {}

  get(locale: ResourceLocale) {
    const pending = this._requests.get(locale)
    if (pending) return pending
    const request = this._load(locale).finally(() => this._requests.delete(locale))
    this._requests.set(locale, request)
    return request
  }

  async dispose() {
    this._abort.abort()
    await Promise.allSettled(this._requests.values())
    await Promise.allSettled(this._refreshes.values())
  }

  private async _load(locale: ResourceLocale): Promise<ResourceCatalog> {
    const database = this._context.storage.dataSource
    const [local]: { catalog: string; updatedAt: number }[] = await database.query(
      'SELECT catalog, updatedAt FROM PoolResources WHERE locale = ?',
      [locale]
    )
    const previous = local ? resourceCatalogSchema.parse(JSON.parse(local.catalog)) : null
    if (previous) {
      // Older local catalogs include Jade variants (60xxx), which are not the current LoL roster.
      for (const id of Object.keys(previous.champions)) {
        if (Number(id) <= 0 || (Number(id) >= 60000 && Number(id) < 70000)) {
          delete previous.champions[id]
          if (previous.championSearch) delete previous.championSearch[id]
        }
      }
    }
    if (previous) {
      // The interval schedules synchronization; local data never expires.
      const syncDue = !previous.championSearch || Date.now() - local.updatedAt >= SYNC_INTERVAL_MS
      if (syncDue && Date.now() >= (this._retryAfter.get(locale) ?? 0)) {
        void this._refresh(locale).catch(() => {
          if (!this._abort.signal.aborted) this._changed(locale, true)
        })
      }
      return previous
    }
    return this._refresh(locale)
  }

  private _refresh(locale: ResourceLocale): Promise<ResourceCatalog> {
    const pending = this._refreshes.get(locale)
    if (pending) return pending
    const request = (async () => {
      const database = this._context.storage.dataSource
      const language = locale === 'zh-CN' ? 'zh_cn' : 'default'
      const load = async (file: string) => {
        const response = await fetch(`${base}/${language}/v1/${file}`, {
          signal: AbortSignal.any([this._abort.signal, AbortSignal.timeout(10_000)])
        })
        if (!response.ok) throw new Error(`Resource catalog HTTP ${response.status}`)
        return rowsSchema.parse(await response.json())
      }
      const [championRows, queues] = await Promise.all([
        load('champion-summary.json'),
        load('queues.json')
      ])
      const champions = championRows.filter((row) => row.id > 0 && !row.alias?.startsWith('Jade_'))
      const catalog: ResourceCatalog = {
        champions: Object.fromEntries(champions.map((row) => [row.id, row.name])),
        championSearch: Object.fromEntries(
          champions.map((row) => [
            row.id,
            [row.name, row.description, row.alias].filter(Boolean).join(' ')
          ])
        ),
        queues: Object.fromEntries(queues.map((row) => [row.id, row.name]))
      }
      await database.query(
        'INSERT INTO PoolResources VALUES (?, ?, ?) ON CONFLICT(locale) DO UPDATE SET catalog = excluded.catalog, updatedAt = excluded.updatedAt',
        [locale, JSON.stringify(catalog), Date.now()]
      )
      this._retryAfter.delete(locale)
      this._changed(locale, false)
      return catalog
    })()
      .catch((error) => {
        this._retryAfter.set(locale, Date.now() + RETRY_INTERVAL_MS)
        throw error
      })
      .finally(() => this._refreshes.delete(locale))
    this._refreshes.set(locale, request)
    return request
  }
}
