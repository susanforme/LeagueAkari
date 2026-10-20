import { type NotebookBundle, blankContent, listSchema } from '@shared/pro/notebook'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { initializeProDatabase } from '../storage/database-lifecycle'
import { NotebookController } from './notebook-controller'

describe.runIf(!!process.versions.electron)('notebook transfer and practice', () => {
  let directory: string, database: DataSource, controller: NotebookController
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'akari-transfer-'))
    database = new DataSource({
      type: 'better-sqlite3',
      database: join(directory, 'pro.db'),
      entities: [],
      synchronize: false
    })
    await initializeProDatabase(database)
    controller = new NotebookController(() => database)
  })
  afterEach(async () => {
    await controller.dispose()
    await database.destroy()
    await rm(directory, { recursive: true, force: true })
  })
  it('previews without writing, remaps links, deduplicates reimports and restores replaced revisions', async () => {
    const a = randomUUID(),
      b = randomUUID(),
      bundle: NotebookBundle = {
        format: 'akari-notebook',
        version: 1,
        entries: [
          {
            id: a,
            content: { ...blankContent(103, 'note'), title: 'A', links: [b], tags: ['spacing'] }
          },
          { id: b, content: { ...blankContent(103, 'combo'), title: 'B' } }
        ]
      }
    expect(await controller.transfer({ bundle, replacements: [], commit: false })).toMatchObject({
      added: 2
    })
    expect((await controller.list(listSchema.parse({}))).total).toBe(0)
    await controller.transfer({ bundle, replacements: [], commit: true })
    const entries = (await controller.list(listSchema.parse({}))).items,
      entryA = entries.find((e) => e.content.title === 'A')!,
      entryB = entries.find((e) => e.content.title === 'B')!
    expect(entryA.content.links).toEqual([entryB.id])
    expect(
      (await controller.list(listSchema.parse({ search: 'spacing' }))).items.map((e) => e.id)
    ).toEqual([entryA.id])
    expect(await controller.transfer({ bundle, replacements: [], commit: true })).toMatchObject({
      added: 0,
      duplicates: 2
    })
    bundle.entries[0].content.text = 'new'
    await controller.transfer({
      bundle,
      replacements: [{ sourceId: a, targetId: entryA.id, expectedRevision: 1 }],
      commit: true
    })
    expect((await controller.get(entryA.id)).revision).toBe(2)
    await expect(
      controller.transfer({
        bundle,
        replacements: [{ sourceId: a, targetId: entryA.id, expectedRevision: 1 }],
        commit: true
      })
    ).rejects.toThrow('conflict')
    expect((await controller.history(entryA.id, 1)).items[1].content.text).toBe('')
  })
  it('filters version review state and records confirmation as a recoverable revision', async () => {
    const old = await controller.save({
      id: null,
      expectedRevision: 0,
      content: { ...blankContent(103, 'note'), title: 'Old', confirmedPatch: '26.19' }
    })
    await controller.save({
      id: null,
      expectedRevision: 0,
      content: { ...blankContent(103, 'note'), title: 'Unmarked' }
    })
    expect(
      (
        await controller.list(
          listSchema.parse({ targetPatch: '26.20', reviewState: 'needsReview' })
        )
      ).items.map((e) => e.id)
    ).toEqual([old.id])
    expect(
      (await controller.list(listSchema.parse({ targetPatch: '26.20', reviewState: 'unmarked' })))
        .total
    ).toBe(1)
    await controller.save({
      id: old.id,
      expectedRevision: 1,
      content: { ...old.content, confirmedPatch: '26.20' }
    })
    expect(
      (await controller.list(listSchema.parse({ targetPatch: '26.20', reviewState: 'confirmed' })))
        .total
    ).toBe(1)
    expect((await controller.history(old.id, 1)).items[1].content.confirmedPatch).toBe('26.19')
  })

  it('requires acknowledging edited practice sources and rejects stale saves', async () => {
    const entry = await controller.save({
      id: null,
      expectedRevision: 0,
      content: { ...blankContent(103, 'combo'), title: 'Combo' }
    })
    await controller.savePractice({
      entryId: entry.id,
      expectedRevision: 0,
      sourceRevision: 1,
      state: 'practicing',
      notes: 'slow first'
    })
    await controller.save({
      id: entry.id,
      expectedRevision: 1,
      content: { ...entry.content, text: 'changed' }
    })
    expect((await controller.practices(103))[0]).toMatchObject({
      sourceRevision: 1,
      entry: { revision: 2 }
    })
    await expect(
      controller.savePractice({
        entryId: entry.id,
        expectedRevision: 1,
        sourceRevision: 1,
        state: 'mastered',
        notes: ''
      })
    ).rejects.toThrow('conflict')
    await controller.savePractice({
      entryId: entry.id,
      expectedRevision: 1,
      sourceRevision: 2,
      state: 'mastered',
      notes: 'done'
    })
    expect((await controller.practices(103))[0].state).toBe('mastered')
  })
})
