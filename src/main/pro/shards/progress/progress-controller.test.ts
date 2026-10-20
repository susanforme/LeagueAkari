import type { ReviewReport } from '@shared/pro/review'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { analyzeMatch } from '../review/analysis'
import { reviewFixture } from '../review/test-fixtures'
import { initializeProDatabase } from '../storage/database-lifecycle'
import { metricValue, quantile } from './metrics'
import { ProgressController } from './progress-controller'

describe.runIf(!!process.versions.electron)('training and batch persistence', () => {
  let directory: string, database: DataSource, controller: ProgressController
  const reports = new Map<string, ReviewReport>()
  const open = vi.fn(),
    player = { serverId: 'EUW1', puuid: 'player' }
  function report(gameId: number, startedAt: number): ReviewReport {
    const fixture = reviewFixture()
    const analysis = analyzeMatch(fixture.summary, fixture.details, 'player')
    analysis.metrics.startedAt = startedAt
    return {
      id: randomUUID(),
      player,
      createdAt: Date.now(),
      summary: { ...fixture.summary, gameId },
      details: { ...fixture.details, gameId },
      analysis
    }
  }
  async function insert(r: ReviewReport) {
    reports.set(r.id, r)
    await database.query('INSERT INTO ReviewReports VALUES (?,?,?,?,?,?,?,?,?)', [
      r.id,
      player.serverId,
      player.puuid,
      r.summary.gameId,
      r.analysis.metrics.championId,
      r.analysis.metrics.startedAt,
      r.createdAt,
      r.id,
      JSON.stringify(r)
    ])
    await database.query('INSERT OR IGNORE INTO PoolMatches VALUES (?,?,?,?,?,?)', [
      player.serverId,
      player.puuid,
      r.summary.gameId,
      r.analysis.metrics.startedAt,
      JSON.stringify(r.analysis.metrics),
      JSON.stringify(r.summary)
    ])
  }
  beforeEach(async () => {
    reports.clear()
    open.mockReset()
    directory = await mkdtemp(join(tmpdir(), 'akari-progress-'))
    database = new DataSource({
      type: 'better-sqlite3',
      database: join(directory, 'pro.db'),
      entities: [],
      synchronize: false
    })
    await initializeProDatabase(database)
    controller = new ProgressController(
      () => database,
      { get: async (id) => reports.get(id)!, open },
      () => 'session',
      () => {}
    )
  })
  afterEach(async () => {
    await controller.dispose()
    await database.destroy()
    await rm(directory, { recursive: true, force: true })
  })
  it('excludes future and incompatible reports, freezes baseline, and protects concurrent goal transitions', async () => {
    for (let i = 0; i < 6; i++) await insert(report(i + 1, 1000 + i))
    const current = report(50, 2000)
    await insert(current)
    const wrong = report(51, 1500)
    wrong.analysis.metrics.position = 'TOP'
    await insert(wrong)
    await insert(report(52, 3000))
    const insight = await controller.insights(current.id, false)
    expect(insight.metrics[0].samples).toHaveLength(6)
    expect(insight.metrics[0].median).toBe(60)
    const goal = await controller.createGoal({
      reportId: current.id,
      allChampions: false,
      metric: 'cs10',
      title: 'CS',
      direction: 'increase',
      target: 70
    })
    expect(goal.state).toBe('active')
    const newer = report(53, Date.now() + 1000)
    await insert(newer)
    const progress = await controller.progress(goal.id)
    expect(progress.goal.baseline).toEqual(goal.baseline)
    expect(progress.samples).toHaveLength(1)
    const changes = await Promise.allSettled([
      controller.changeGoal({ id: goal.id, revision: 1, state: 'paused' }),
      controller.changeGoal({ id: goal.id, revision: 1, state: 'completed' })
    ])
    expect(changes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  })
  it('counts only evidenced issues and requires five quantile samples', () => {
    const r = report(1, 1000)
    expect(metricValue(r, 'deathBeforeObjective')).toBe(1)
    r.details = null
    expect(metricValue(r, 'deathBeforeObjective')).toBeNull()
    expect(quantile([1, 2, 3, 4], 0.5)).toBeNull()
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2)
  })
  it('keeps completed items and resumes cancelled batches without rerunning them', async () => {
    const first = report(1, 1000),
      second = report(2, 2000)
    first.details = null
    second.details = null
    await insert(first)
    await insert(second)
    let release!: () => void
    open.mockImplementation(async (request) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { ...(request.gameId === 1 ? first : second), details: reviewFixture().details }
    })
    const batch = await controller.preview({ ...player, gameIds: [1, 2] })
    const concurrent = await Promise.allSettled([
      controller.runBatch(batch.id),
      controller.runBatch(batch.id)
    ])
    expect(concurrent.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1))
    controller.cancel()
    release()
    await vi.waitFor(async () => expect((await controller.batches())[0].state).toBe('cancelled'))
    await controller.runBatch(batch.id)
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2))
    release()
    await vi.waitFor(async () => expect((await controller.batches())[0].state).toBe('completed'))
    expect(open.mock.calls.map((c) => c[0].gameId)).toEqual([1, 2])
  })
})
