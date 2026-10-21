import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initializeProDatabase } from '../storage/database-lifecycle'
import type { ChampionPoolContext } from './context'
import { ResourceLoader } from './resource-loader'

describe.runIf(!!process.versions.electron)('champion catalog cache', () => {
  let database: DataSource
  let loader: ResourceLoader
  const fetchMock = vi.fn()
  const changed = vi.fn()
  beforeEach(async () => {
    database = new DataSource({ type: 'better-sqlite3', database: ':memory:' })
    await initializeProDatabase(database)
    loader = new ResourceLoader(
      { storage: { dataSource: database } } as ChampionPoolContext,
      changed
    )
    changed.mockReset()
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
          : [
              { id: -1, name: 'None', alias: 'None' },
              { id: 103, name: '九尾妖狐', description: '阿狸', alias: 'Ahri' },
              { id: 60103, name: '九尾妖狐', description: '阿狸', alias: 'Jade_Ahri' }
            ]
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
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith('zh-CN', true))
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => [{ id: 103, name: '九尾妖狐', description: '阿狸', alias: 'Ahri' }]
    }))
    expect(await loader.get('zh-CN')).toEqual(catalog)
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith('zh-CN', false))
    expect((await loader.get('zh-CN')).championSearch).toEqual({ 103: '九尾妖狐 阿狸 Ahri' })
  })

  it('serves expired local data while a slow refresh is pending', async () => {
    const catalog = { champions: { 103: 'Ahri' }, championSearch: { 103: 'Ahri' }, queues: {} }
    await database.query('INSERT INTO PoolResources VALUES (?, ?, ?)', [
      'en',
      JSON.stringify(catalog),
      0
    ])
    let release!: () => void
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    fetchMock.mockImplementation(async () => {
      await wait
      return { ok: true, json: async () => [{ id: 103, name: 'Updated' }] }
    })
    expect(await loader.get('en')).toEqual(catalog)
    expect(await loader.get('en')).toEqual(catalog)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    release()
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith('en', false))
    expect((await loader.get('en')).champions[103]).toBe('Updated')
  })

  it('does not cache malformed remote data', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ id: 'wrong', name: {} }] })
    await expect(loader.get('en')).rejects.toThrow()
    expect(await database.query('SELECT * FROM PoolResources')).toEqual([])
  })

  it.each([Date.now(), 0])(
    'filters legacy variants from cached catalogs at %s, including offline',
    async (updatedAt) => {
      await database.query('INSERT INTO PoolResources VALUES (?, ?, ?)', [
        'en',
        JSON.stringify({
          champions: { '-1': 'None', 103: 'Ahri', 60103: 'Ahri', 266: 'Aatrox', 60266: 'Aatrox' },
          championSearch: {
            103: 'Ahri',
            60103: 'Ahri Jade_Ahri',
            266: 'Aatrox',
            60266: 'Aatrox Jade_Aatrox'
          },
          queues: { 420: 'Ranked Solo' }
        }),
        updatedAt
      ])
      fetchMock.mockRejectedValue(new Error('offline'))
      expect(await loader.get('en')).toEqual({
        champions: { 103: 'Ahri', 266: 'Aatrox' },
        championSearch: { 103: 'Ahri', 266: 'Aatrox' },
        queues: { 420: 'Ranked Solo' }
      })
    }
  )
})
