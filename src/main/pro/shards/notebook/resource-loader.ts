import type { ResourceLocale } from '@shared/pro/champion-pool'
import { notebookCatalogSchema, skillsSchema } from '@shared/pro/notebook'
import {
  championInfoSchema,
  championPositionsSchema,
  positions,
  runeCatalogSchema
} from '@shared/pro/notebook/handbook'
import type { DataSource } from 'typeorm'
import { z } from 'zod'

const base = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global'
export class NotebookResourceLoader {
  private readonly _pending = new Map<string, Promise<unknown>>()
  private readonly _abort = new AbortController()
  private readonly _refreshes = new Map<string, Promise<unknown>>()
  constructor(
    private readonly _database: () => DataSource,
    private readonly _changed: (key: string, failed: boolean) => void = () => {}
  ) {}

  catalog(locale: ResourceLocale) {
    return this._cached(`catalog:${locale}`, notebookCatalogSchema, async () => {
      const [items, spells] = await Promise.all([
        this._fetch(locale, 'items.json'),
        this._fetch(locale, 'summoner-spells.json')
      ])
      return notebookCatalogSchema.parse({ items, spells })
    })
  }
  skills(locale: ResourceLocale, championId: number) {
    return this._cached(`skills:${locale}:${championId}`, skillsSchema, async () => {
      const data = await this._fetch(locale, `champions/${championId}.json`)
      return z.object({ spells: skillsSchema }).parse(data).spells
    })
  }
  runes(locale: ResourceLocale) {
    return this._cached(`runes:${locale}`, runeCatalogSchema, async () => {
      const [styles, perks] = await Promise.all([
        this._fetch(locale, 'perkstyles.json'),
        this._fetch(locale, 'perks.json')
      ])
      return runeCatalogSchema.parse({
        styles: z.object({ styles: z.array(z.unknown()) }).parse(styles).styles,
        perks
      })
    })
  }
  championInfo(locale: ResourceLocale, championId: number) {
    return this._cached(`champion-info:${locale}:${championId}`, championInfoSchema, async () =>
      championInfoSchema.parse(await this._fetch(locale, `champions/${championId}.json`))
    )
  }
  positions(locale: ResourceLocale) {
    return this._cached(`positions:${locale}`, championPositionsSchema, async () => {
      const rows = z
        .array(
          z.object({
            championId: z.number(),
            runeRecommendations: z.array(z.object({ mapId: z.number(), position: z.string() }))
          })
        )
        .parse(await this._fetch(locale, 'champion-rune-recommendations.json'))
      return championPositionsSchema.parse(
        Object.fromEntries(
          rows.map((row) => [
            row.championId,
            [
              ...new Set(
                row.runeRecommendations
                  .filter(
                    (r) =>
                      r.mapId === 11 && positions.includes(r.position as (typeof positions)[number])
                  )
                  .map((r) => r.position)
              )
            ]
          ])
        )
      )
    })
  }
  async dispose() {
    this._abort.abort()
    await Promise.allSettled(this._pending.values())
    await Promise.allSettled(this._refreshes.values())
  }
  private async _fetch(locale: ResourceLocale, file: string) {
    const response = await fetch(`${base}/${locale === 'zh-CN' ? 'zh_cn' : 'default'}/v1/${file}`, {
      signal: AbortSignal.any([this._abort.signal, AbortSignal.timeout(10_000)])
    })
    if (!response.ok) throw new Error(`Resource HTTP ${response.status}`)
    return response.json()
  }
  private _cached<T>(key: string, schema: z.ZodType<T>, fetcher: () => Promise<T>): Promise<T> {
    const existing = this._pending.get(key)
    if (existing) return existing as Promise<T>
    const request = (async () => {
      const db = this._database()
      const [row] = await db.query('SELECT data, updatedAt FROM NotebookResources WHERE key = ?', [
        key
      ])
      const previous = row ? schema.parse(JSON.parse(row.data)) : null
      if (previous && Date.now() - row.updatedAt < 86_400_000) return previous
      const refresh = () => {
        const existing = this._refreshes.get(key)
        if (existing) return existing as Promise<T>
        const task = (async () => {
          const data = await fetcher()
          await db.query(
            'INSERT INTO NotebookResources VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt',
            [key, JSON.stringify(data), Date.now()]
          )
          this._changed(key, false)
          return data
        })().finally(() => this._refreshes.delete(key))
        this._refreshes.set(key, task)
        return task
      }
      if (previous) {
        void refresh().catch(() => {
          if (!this._abort.signal.aborted) this._changed(key, true)
        })
        return previous
      }
      return refresh()
    })().finally(() => this._pending.delete(key))
    this._pending.set(key, request)
    return request
  }
}
