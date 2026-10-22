import { blankContent, listSchema } from '@shared/pro/notebook'
import { REVIEW_PAGE_SIZE, reviewListSchema } from '@shared/pro/review'
import { randomUUID } from 'node:crypto'
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
    expect(await controller.remove(first.id)).toBe('referenced')
    expect((await controller.get(first.id)).id).toBe(first.id)
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
  it('filters the full library before pagination and keeps library summaries independent of filters', async () => {
    const base = await controller.open(request)
    await controller.remove(base.id)
    for (let index = 0; index < REVIEW_PAGE_SIZE + 2; index++) {
      const report = structuredClone(base)
      report.id = randomUUID()
      report.summary.gameId = 100 + index
      report.createdAt = 50_000 - index * 100
      Object.assign(report.analysis.metrics, {
        gameId: 100 + index,
        championId: index < 10 ? 103 : 22,
        queueId: index < 10 ? 420 : 450,
        startedAt: 1000 + index * 1000
      })
      await source.query('INSERT INTO ReviewReports VALUES (?,?,?,?,?,?,?,?,?)', [
        report.id,
        'EUW1',
        'player',
        report.summary.gameId,
        report.analysis.metrics.championId,
        report.analysis.metrics.startedAt,
        report.createdAt,
        String(index),
        JSON.stringify(report)
      ])
    }
    const first = await controller.list(reviewListSchema.parse({ sort: 'matchOldest' }))
    const second = await controller.list(reviewListSchema.parse({ page: 2, sort: 'matchOldest' }))
    expect(first.items).toHaveLength(REVIEW_PAGE_SIZE)
    expect(second.items.map((item) => item.gameId)).toEqual([110, 111])
    expect(second.items[0].summary.gameId).toBe(110)
    const filtered = await controller.list(
      reviewListSchema.parse({
        search: 'ashe',
        searchChampionIds: [22],
        championId: 22,
        queueId: 450,
        from: 11_000,
        to: 12_000
      })
    )
    expect(filtered.items.map((item) => item.gameId)).toEqual([110])
    expect(filtered.total).toBe(1)
    expect(filtered.saved).toBe(12)
    expect(filtered.champions[0]).toEqual({ championId: 103, count: 10 })
    expect(filtered.queueIds).toEqual([420, 450])
    expect(
      (await controller.list(reviewListSchema.parse({ search: '111' }))).items.map(
        (item) => item.gameId
      )
    ).toEqual([111])
    expect((await controller.list(reviewListSchema.parse({ search: "%' OR 1=1 --" }))).total).toBe(
      0
    )
    for (const [sort, id] of [
      ['matchNewest', 111],
      ['matchOldest', 100],
      ['savedNewest', 100],
      ['savedOldest', 111]
    ]) {
      expect((await controller.list(reviewListSchema.parse({ sort }))).items[0].gameId).toBe(id)
    }
    expect(reviewListSchema.safeParse({ from: 2000, to: 1000 }).success).toBe(false)
    expect(
      reviewListSchema.safeParse({ sort: 'createdAt; DROP TABLE ReviewReports' }).success
    ).toBe(false)
  })

  it('deletes only unreferenced reports and retains reports used by training baselines and notebook history', async () => {
    const report = await controller.open(request)
    await source.query('INSERT INTO TrainingGoals VALUES (?,?,?)', [
      'goal',
      1,
      JSON.stringify({ baseline: [{ reportId: report.id }] })
    ])
    expect(await controller.remove(report.id)).toBe('referenced')
    await source.query('DELETE FROM TrainingGoals')
    await source.query('INSERT INTO NotebookRevisions VALUES (?,?,?)', [
      'note',
      1,
      JSON.stringify({ content: { source: { reportId: report.id } } })
    ])
    expect(await controller.remove(report.id)).toBe('referenced')
    await source.query('DELETE FROM NotebookRevisions')
    await source.query('INSERT INTO ReviewBatches VALUES (?,?,?)', [
      'batch',
      1,
      JSON.stringify({ items: [{ reportId: report.id }] })
    ])
    expect(await controller.remove(report.id)).toBe('referenced')
    await source.query('DELETE FROM ReviewBatches')
    expect(await controller.remove(report.id)).toBe('removed')
    await expect(controller.get(report.id)).rejects.toThrow('Report unavailable')
    expect((await controller.list(1)).total).toBe(0)
  })
})
