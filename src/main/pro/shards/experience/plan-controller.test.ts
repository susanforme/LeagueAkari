import type { PlayerIdentity } from '@shared/pro/champion-pool'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeMatch } from '../champion-pool/normalization'
import { sgpSummary } from '../champion-pool/test-fixtures'
import { analyzeMatch } from '../review/analysis'
import { reviewFixture } from '../review/test-fixtures'
import { initializeProDatabase } from '../storage/database-lifecycle'
import { PlanController } from './plan-controller'

describe.runIf(!!process.versions.electron)('play plans and next-game focus', () => {
  const player = { serverId: 'EUW1', puuid: 'player' }
  let db: DataSource, api: PlanController, identity: PlayerIdentity | null, phase: string
  beforeEach(async () => {
    db = new DataSource({ type: 'better-sqlite3', database: ':memory:' })
    await initializeProDatabase(db)
    identity = player
    phase = 'Lobby'
    api = new PlanController(
      () => db,
      () => identity,
      () => phase
    )
    vi.spyOn(Date, 'now').mockReturnValue(10000)
  })
  afterEach(async () => {
    await db.destroy()
    vi.restoreAllMocks()
  })
  const start = { kind: 'start' as const, games: 3, minutes: 90 }
  async function insert(
    gameId: number,
    startedAt: number,
    outcome: 'win' | 'loss' | 'remake',
    serverId = player.serverId
  ) {
    const summary = sgpSummary(gameId)
    summary.data.json.gameCreation = startedAt
    const match = { ...normalizeMatch(summary, player.puuid), outcome }
    await db.query('INSERT INTO PoolMatches VALUES (?,?,?,?,?,?)', [
      serverId,
      player.puuid,
      gameId,
      startedAt,
      JSON.stringify(match),
      JSON.stringify(summary)
    ])
  }
  it('counts only games started inside the plan and isolates regions; rest persists across controllers', async () => {
    await api.change({ player, revision: 0, action: start })
    await insert(1, 9000, 'win')
    await insert(2, 11000, 'loss')
    await insert(3, 12000, 'remake')
    await insert(4, 13000, 'win', 'NA1')
    vi.mocked(Date.now).mockReturnValue(20000)
    expect((await api.status(player)).progress).toMatchObject({
      games: 1,
      minutes: 40,
      losses: 1,
      wins: 0,
      reached: false
    })
    const ended = await api.change({ player, revision: 1, action: { kind: 'rest', minutes: 10 } })
    expect(ended.session).toMatchObject({ endedAt: 20000, breakUntil: 620000 })
    await insert(5, 21000, 'win')
    vi.mocked(Date.now).mockReturnValue(30000)
    const reopened = new PlanController(
      () => db,
      () => identity,
      () => phase
    )
    expect((await reopened.status(player)).progress.games).toBe(1)
    await expect(reopened.change({ player, revision: 2, action: start })).rejects.toThrow('Break')
    expect((await reopened.get({ ...player, puuid: 'other' })).session).toBeNull()
    await reopened.change({ player, revision: 2, action: { kind: 'end' } })
    expect((await reopened.change({ player, revision: 3, action: start })).session?.startedAt).toBe(
      30000
    )
  })
  it('rejects wrong-account and in-game starts and does not replace an active block', async () => {
    phase = 'InProgress'
    await expect(api.change({ player, revision: 0, action: start })).rejects.toThrow('lobby')
    phase = 'Lobby'
    identity = { ...player, serverId: 'NA1' }
    await expect(api.change({ player, revision: 0, action: start })).rejects.toThrow('account')
    identity = player
    await api.change({ player, revision: 0, action: start })
    await expect(api.change({ player, revision: 1, action: start })).rejects.toThrow('active')
  })
  it('saves one evidence-backed focus, rejects invalid evidence and protects simultaneous writes', async () => {
    const fixture = reviewFixture(),
      reportId = randomUUID()
    const analysis = analyzeMatch(fixture.summary, fixture.details, 'player')
    const report = { id: reportId, player, summary: fixture.summary, analysis }
    await db.query('INSERT INTO ReviewReports VALUES (?,?,?,?,?,?,?,?,?)', [
      reportId,
      player.serverId,
      player.puuid,
      1,
      analysis.metrics.championId,
      0,
      0,
      reportId,
      JSON.stringify(report)
    ])
    const value = {
      reportId,
      timestamp: 1000,
      text: 'Check the wave before trading',
      championId: analysis.metrics.championId!
    }
    await expect(
      api.change({
        player: { ...player, puuid: 'other' },
        revision: 0,
        action: { kind: 'focus', value }
      })
    ).rejects.toThrow('evidence')
    await expect(
      api.change({
        player,
        revision: 0,
        action: { kind: 'focus', value: { ...value, timestamp: analysis.duration + 1 } }
      })
    ).rejects.toThrow('evidence')
    identity = null
    const results = await Promise.allSettled([
      api.change({ player, revision: 0, action: { kind: 'focus', value } }),
      api.change({
        player,
        revision: 0,
        action: { kind: 'focus', value: { ...value, text: 'Watch the map' } }
      })
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    const plan = await api.get(player)
    expect(plan.focus?.reportId).toBe(reportId)
    expect(plan.revision).toBe(1)
    expect(await api.focuses(1)).toMatchObject({
      total: 1,
      items: [{ player, plan: { revision: 1 } }]
    })
    await api.change({ player, revision: 1, action: { kind: 'clearFocus' } })
    expect((await api.get(player)).focus).toBeNull()
    expect(await api.focuses(1)).toEqual({ total: 0, items: [] })
  })
})
