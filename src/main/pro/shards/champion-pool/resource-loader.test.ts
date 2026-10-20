import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initializeProDatabase } from '../storage/database-lifecycle'
import type { ChampionPoolContext } from './context'
import { ResourceLoader } from './resource-loader'

describe.runIf(!!process.versions.electron)('champion catalog cache', () => {
  let database: DataSource
  let loader: ResourceLoader
  const fetchMock = vi.fn()
  beforeEach(async () => {
    database = new DataSource({ type: 'better-sqlite3', database: ':memory:' })
    await initializeProDatabase(database)
    loader = new ResourceLoader({ storage: { dataSource: database } } as ChampionPoolContext)
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(async () => {
    await loader.dispose()
    await database.destroy()
    vi.unstubAllGlobals()
  })

  it('deduplicates requests, caches localized names and retains expired data offline', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith('queues.json')
          ? [{ id: 420, name: '单排' }]
          : [{ id: 103, name: '九尾妖狐', description: '阿狸', alias: 'Ahri' }]
    }))
    const [first, second] = await Promise.all([loader.get('zh-CN'), loader.get('zh-CN')])
    expect(first).toEqual({
      champions: { 103: '九尾妖狐' },
      championSearch: { 103: '九尾妖狐 阿狸 Ahri' },
      queues: { 420: '单排' }
    })
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await loader.get('zh-CN')).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await database.query('UPDATE PoolResources SET updatedAt = 0')
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await loader.get('zh-CN')).toEqual(first)
    await expect(loader.get('en')).rejects.toThrow('offline')
  })

  it('keeps old catalogs usable offline and refreshes their search names when online', async () => {
    const catalog = { champions: { 103: '九尾妖狐' }, queues: {} }
    await database.query('INSERT INTO PoolResources VALUES (?, ?, ?)', [
      'zh-CN',
      JSON.stringify(catalog),
      Date.now()
    ])
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await loader.get('zh-CN')).toEqual(catalog)
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => [{ id: 103, name: '九尾妖狐', description: '阿狸', alias: 'Ahri' }]
    }))
    expect((await loader.get('zh-CN')).championSearch).toEqual({ 103: '九尾妖狐 阿狸 Ahri' })
  })

  it('does not cache malformed remote data', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: 'wrong', name: {} }] })
    await expect(loader.get('en')).rejects.toThrow()
    expect(await database.query('SELECT * FROM PoolResources')).toEqual([])
  })
})
