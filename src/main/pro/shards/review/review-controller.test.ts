import { blankContent, listSchema } from '@shared/pro/notebook'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NotebookController } from '../notebook/notebook-controller'
import { initializeProDatabase } from '../storage/database-lifecycle'
import { ReviewController } from './review-controller'
import { reviewFixture } from './test-fixtures'

describe.runIf(!!process.versions.electron)('persisted reviews', () => {
  let source: DataSource
  let directory: string
  let controller: ReviewController
  const fixture = reviewFixture()
  const pool = {
    match: vi.fn(async () => fixture.summary),
    details: vi.fn(async () => fixture.details)
  }
  const request = { serverId: 'EUW1', puuid: 'player', gameId: 1, refresh: false }
  beforeEach(async () => {
    pool.match.mockReset().mockResolvedValue(fixture.summary)
    pool.details.mockReset().mockResolvedValue(fixture.details)
    directory = await mkdtemp(join(tmpdir(), 'akari-reviews-'))
    source = new DataSource({
      type: 'better-sqlite3',
      database: join(directory, 'pro.db'),
      entities: [],
      synchronize: false
    })
    await initializeProDatabase(source)
    controller = new ReviewController(() => source, pool)
  })
  afterEach(async () => {
    await controller.dispose()
    if (source.isInitialized) await source.destroy()
    await rm(directory, { recursive: true, force: true })
  })
  it('deduplicates reports, retains offline evidence and links versioned handbook notes across restart', async () => {
    const [first, second] = await Promise.all([controller.open(request), controller.open(request)])
    expect(first.id).toBe(second.id)
    expect(pool.details).toHaveBeenCalledTimes(1)
    expect((await controller.open({ ...request, refresh: true })).id).toBe(first.id)
    expect(pool.details).toHaveBeenLastCalledWith({ ...request, refresh: true }, 1, true)
    const notebook = new NotebookController(() => source)
    const content = {
      ...blankContent(103, 'note'),
      title: 'Death review',
      text: 'Avoid river',
      source: {
        ...first.player,
        gameId: 1,
        reportId: first.id,
        timestamp: 590_000,
        evidenceId: '10:0'
      }
    }
    await notebook.save({ id: null, expectedRevision: 0, content })
    await expect(
      notebook.save({
        id: null,
        expectedRevision: 0,
        content: {
          ...content,
          source: { ...content.source, timestamp: 99_000_000 }
        }
      })
    ).rejects.toThrow('Invalid review evidence')
    await notebook.dispose()
    await source.destroy()
    await initializeProDatabase(source)
    pool.details.mockRejectedValue(new Error('Offline'))
    expect((await controller.open(request)).analysis.events).toEqual(first.analysis.events)
    await expect(controller.open({ ...request, refresh: true })).rejects.toThrow('Offline')
    expect((await controller.get(first.id)).details).toEqual(first.details)
    expect((await controller.list(1)).total).toBe(1)
    expect(
      (await new NotebookController(() => source).list(listSchema.parse({ reportId: first.id })))
        .total
    ).toBe(1)
  })
  it('persists honest partial reports and creates a new immutable version after timeline recovery', async () => {
    pool.details.mockRejectedValueOnce(new Error('Offline'))
    const partial = await controller.open(request)
    expect(partial.analysis.limitations).toContain('timelineMissing')
    const recovered = await controller.open({ ...request, refresh: true })
    expect(recovered.id).not.toBe(partial.id)
    expect((await controller.get(partial.id)).details).toBeNull()
    expect(recovered.analysis.events).toHaveLength(2)
  })
})
