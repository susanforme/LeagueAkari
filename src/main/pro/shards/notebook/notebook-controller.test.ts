import { blankContent, contentSchema, listSchema } from '@shared/pro/notebook'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initializeProDatabase } from '../storage/database-lifecycle'
import { initializeChampionPool } from '../storage/upgrades/version-1'
import { initializeResourceCache } from '../storage/upgrades/version-2'
import { NotebookController } from './notebook-controller'
import { NotebookResourceLoader } from './resource-loader'

describe.runIf(!!process.versions.electron)('notebook persistence', () => {
  let directory: string
  let source: DataSource
  let controller: NotebookController
  const content = () => ({ ...blankContent(103, 'note'), title: 'Ahri', text: '保持距离' })
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'akari-notebook-'))
    source = new DataSource({
      type: 'better-sqlite3',
      database: join(directory, 'pro.db'),
      entities: [],
      synchronize: false
    })
    await initializeProDatabase(source)
    controller = new NotebookController(() => source)
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    await controller.dispose()
    if (source.isInitialized) await source.destroy()
    await rm(directory, { recursive: true, force: true })
  })
  it('retains revisions, restores as a new revision, and rejects competing saves', async () => {
    const first = await controller.save({ id: null, expectedRevision: 0, content: content() })
    const request = {
      id: first.id,
      expectedRevision: 1,
      content: { ...first.content, text: '新版' }
    }
    const saves = await Promise.allSettled([controller.save(request), controller.save(request)])
    expect(saves.map((s) => s.status)).toEqual(['fulfilled', 'rejected'])
    expect(await controller.history(first.id, 1)).toMatchObject({
      total: 2,
      items: [
        { revision: 2, content: { text: '新版' } },
        { revision: 1, content: { text: '保持距离' } }
      ]
    })
    const restored = await controller.change({
      id: first.id,
      expectedRevision: 2,
      action: 'restore',
      revision: 1
    })
    expect(restored).toMatchObject({ revision: 3, content: { text: '保持距离' } })
    await controller.change({ id: first.id, expectedRevision: 3, action: 'trash' })
    expect((await controller.list(listSchema.parse({}))).total).toBe(0)
    expect((await controller.list(listSchema.parse({ deleted: true }))).total).toBe(1)
    await controller.change({ id: first.id, expectedRevision: 4, action: 'recover' })
    await source.destroy()
    await initializeProDatabase(source)
    expect((await controller.list(listSchema.parse({}))).items[0].revision).toBe(5)
    expect((await controller.history(first.id, 1)).total).toBe(5)
  })
  it('paginates, searches literal text, pins, and only includes revealed matchups in quick lookup', async () => {
    for (let i = 0; i < 32; i++)
      await controller.save({
        id: null,
        expectedRevision: 0,
        content: {
          ...content(),
          title: `note ${i}`,
          text: i === 0 ? '100%_safe' : '',
          pinned: i === 0
        }
      })
    await controller.save({
      id: null,
      expectedRevision: 0,
      content: { ...content(), championId: 64 }
    })
    for (const opponentId of [1, 2])
      await controller.save({
        id: null,
        expectedRevision: 0,
        content: { ...content(), kind: 'matchup', opponentId }
      })
    const page1 = await controller.list(listSchema.parse({ championId: 103 }))
    const page2 = await controller.list(listSchema.parse({ championId: 103, page: 2 }))
    expect(page1.total).toBe(34)
    expect(page1.items).toHaveLength(30)
    expect(page2.items).toHaveLength(4)
    expect(new Set([...page1.items, ...page2.items].map((e) => e.id)).size).toBe(34)
    expect(page1.items[0].content.title).toBe('note 0')
    expect((await controller.list(listSchema.parse({ search: '%_' }))).total).toBe(1)
    expect(
      (await controller.list(listSchema.parse({ championId: 103, publicOpponents: [] }))).total
    ).toBe(32)
    const quick = await controller.list(
      listSchema.parse({ championId: 103, kind: 'matchup', publicOpponents: [2] })
    )
    expect(quick.items.map((e) => e.content.opponentId)).toEqual([2])
  })
  it('summarizes all pages by champion and excludes trashed entries from active counts', async () => {
    expect(await controller.champions()).toEqual([])
    for (let i = 0; i < 31; i++) {
      await controller.save({
        id: null,
        expectedRevision: 0,
        content: { ...content(), pinned: i === 0 }
      })
    }
    const matchup = await controller.save({
      id: null,
      expectedRevision: 0,
      content: { ...content(), kind: 'matchup', opponentId: 64 }
    })
    const other = await controller.save({
      id: null,
      expectedRevision: 0,
      content: { ...content(), championId: 64, kind: 'combo' }
    })
    await controller.change({ id: other.id, expectedRevision: 1, action: 'trash' })
    expect(await controller.champions()).toEqual(
      expect.arrayContaining([
        {
          championId: 103,
          total: 32,
          trash: 0,
          pinned: 1,
          note: 31,
          matchup: 1,
          combo: 0,
          build: 0,
          updatedAt: matchup.updatedAt
        },
        {
          championId: 64,
          total: 0,
          trash: 1,
          pinned: 0,
          note: 0,
          matchup: 0,
          combo: 0,
          build: 0,
          updatedAt: 0
        }
      ])
    )
    const filtered = await controller.list(listSchema.parse({ championId: 103, opponentId: 64 }))
    expect(filtered.items.map((entry) => entry.id)).toEqual([matchup.id])
    await controller.change({ id: other.id, expectedRevision: 2, action: 'recover' })
    await source.destroy()
    await initializeProDatabase(source)
    expect((await controller.champions()).find((row) => row.championId === 64)).toMatchObject({
      total: 1,
      trash: 0,
      combo: 1
    })
  })
  it('rolls back a failed history write without losing the current entry', async () => {
    const entry = await controller.save({ id: null, expectedRevision: 0, content: content() })
    await source.query(
      `CREATE TRIGGER fail_revision BEFORE INSERT ON NotebookRevisions WHEN NEW.revision = 2 BEGIN SELECT RAISE(ABORT, 'test write failure'); END`
    )
    await expect(
      controller.save({
        id: entry.id,
        expectedRevision: 1,
        content: { ...content(), text: 'must rollback' }
      })
    ).rejects.toThrow()
    expect((await controller.list(listSchema.parse({}))).items[0]).toEqual(entry)
    expect((await controller.history(entry.id, 1)).total).toBe(1)
  })
  it('upgrades an existing v2 database while retaining champion pool data and resources', async () => {
    await source.destroy()
    await rm(join(directory, 'pro.db'))
    await source.initialize()
    await source.transaction(async (manager) => {
      await initializeChampionPool(manager)
      await initializeResourceCache(manager)
      await manager.query("INSERT INTO PoolPlayers VALUES ('EUW1','player','Name#Tag',123)")
      await manager.query(
        'INSERT INTO PoolResources VALUES (\'en\',\'{"champions":{},"queues":{}}\',123)'
      )
      await manager.query('PRAGMA user_version = 2')
    })
    await source.destroy()
    await initializeProDatabase(source)
    expect(await source.query('SELECT name FROM PoolPlayers')).toEqual([{ name: 'Name#Tag' }])
    expect(await source.query('SELECT updatedAt FROM PoolResources')).toEqual([{ updatedAt: 123 }])
    expect((await controller.list(listSchema.parse({}))).total).toBe(0)
  })
  it('coalesces resource requests and keeps cached icons available when offline', async () => {
    const item = {
      id: 1001,
      name: 'Boots',
      iconPath: '/lol-game-data/assets/boots.png',
      description: 'Boots',
      price: 300,
      priceTotal: 300,
      from: [],
      to: []
    }
    const spell = {
      id: 4_294_967_295,
      name: 'Special spell',
      iconPath: '/lol-game-data/assets/spell.png',
      description: 'Special mode',
      cooldown: 10,
      summonerLevel: 1
    }
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(url.endsWith('items.json') ? [item] : [spell]))
    )
    vi.stubGlobal('fetch', fetcher)
    const loader = new NotebookResourceLoader(() => source)
    const [first, second] = await Promise.all([loader.catalog('en'), loader.catalog('en')])
    expect(first).toEqual({ items: [item], spells: [spell] })
    expect(second).toEqual(first)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await source.query('UPDATE NotebookResources SET updatedAt = 0')
    fetcher.mockRejectedValue(new Error('offline'))
    expect(await loader.catalog('en')).toEqual(first)
    await loader.dispose()
  })
})

it('validates game entities, matchups, quantities and content bounds at the IPC contract', () => {
  const note = { ...blankContent(103, 'combo'), title: 'combo' }
  expect(
    contentSchema.safeParse({ ...note, steps: [{ action: 'skill', entityId: 5, label: '' }] })
      .success
  ).toBe(false)
  expect(contentSchema.safeParse({ ...note, kind: 'matchup' }).success).toBe(false)
  expect(
    contentSchema.safeParse({
      ...note,
      groups: [{ name: 'core', items: [{ id: 1001, count: 0 }] }]
    }).success
  ).toBe(false)
  expect(
    contentSchema.safeParse({
      ...note,
      skillOrder: [1, 2, 3, 4],
      steps: [{ action: 'skill', entityId: 1, label: 'Q2' }]
    }).success
  ).toBe(true)
})
