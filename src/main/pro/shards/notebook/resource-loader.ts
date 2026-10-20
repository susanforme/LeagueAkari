import type { ResourceLocale } from '@shared/pro/champion-pool'
import { notebookCatalogSchema, skillsSchema } from '@shared/pro/notebook'
import type { DataSource } from 'typeorm'
import { z } from 'zod'

const base = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global'
export class NotebookResourceLoader {
  private readonly _pending = new Map<string, Promise<unknown>>()
  private readonly _abort = new AbortController()
  constructor(private readonly _database: () => DataSource) {}

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
  async dispose() {
    this._abort.abort()
    await Promise.allSettled(this._pending.values())
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
      try {
        const data = await fetcher()
        await db.query(
          'INSERT INTO NotebookResources VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt',
          [key, JSON.stringify(data), Date.now()]
        )
        return data
      } catch (error) {
        if (previous) return previous
        throw error
      }
    })().finally(() => this._pending.delete(key))
    this._pending.set(key, request)
    return request
  }
}
