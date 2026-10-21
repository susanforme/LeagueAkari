import { matchupQuerySchema } from '@shared/pro/champion-pool/matchups'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { analyzeMatch } from '../review/analysis'
import { reviewFixture } from '../review/test-fixtures'
import { initializeProDatabase } from '../storage/database-lifecycle'
import { loadMatchups } from './matchup-loader'
import { normalizeMatch } from './normalization'

describe.runIf(!!process.versions.electron)(
  'personal matchups from cached games and reviews',
  () => {
    let db: DataSource
    beforeEach(async () => {
      db = new DataSource({ type: 'better-sqlite3', database: ':memory:' })
      await initializeProDatabase(db)
    })
    afterEach(() => db.destroy())
    async function insert(
      id: number,
      { server = 'EUW1', puuid = 'player', unknown = false, patch = '26.20.1', remake = false } = {}
    ) {
      const { summary, details } = reviewFixture()
      summary.gameId = id
      summary.data.json.gameId = id
      summary.data.json.gameCreation = id * 1000
      summary.data.json.gameVersion = patch
      summary.data.json.participants[0].puuid = puuid
      if (unknown) summary.data.json.participants[0].teamPosition = ''
      if (remake) summary.data.json.participants[0].gameEndedInEarlySurrender = true
      summary.data.json.participants[5].championId = 238
      details.gameId = id
      details.data.json.gameId = id
      details.data.json.participants[0].puuid = puuid
      const projection = normalizeMatch(summary, puuid)
      await db.query('INSERT INTO PoolMatches VALUES (?,?,?,?,?,?)', [
        server,
        puuid,
        id,
        id * 1000,
        JSON.stringify(projection),
        JSON.stringify(summary)
      ])
      return { summary, details }
    }
    async function report(
      fixture: ReturnType<typeof reviewFixture>,
      time: number,
      gold: number | null
    ) {
      const analysis = analyzeMatch(fixture.summary, fixture.details, 'player')
      analysis.checkpoints[0].point!.goldDiff = gold
      const id = randomUUID()
      await db.query('INSERT INTO ReviewReports VALUES (?,?,?,?,?,?,?,?,?)', [
        id,
        'EUW1',
        'player',
        fixture.summary.gameId,
        103,
        fixture.summary.gameId * 1000,
        time,
        id,
        JSON.stringify({ analysis })
      ])
      return id
    }
    const query = () =>
      matchupQuerySchema.parse({
        serverId: 'EUW1',
        puuid: 'player',
        championId: 103,
        opponentId: 238,
        pageSize: 1
      })
    it('counts each game once, uses the latest report, paginates evidence and isolates accounts and filters', async () => {
      const a = await insert(1)
      await insert(2)
      await insert(3, { unknown: true })
      await insert(4, { server: 'NA1' })
      await insert(5, { puuid: 'other' })
      await insert(6, { patch: '26.19.1' })
      await insert(7, { remake: true })
      await report(a, 1, 200)
      const latest = await report(a, 2, 1000)
      const result = await loadMatchups(db, { ...query(), patch: '26.20' })
      expect(result.missingTimelineGameIds).toEqual([2])
      expect(result.total).toBe(2)
      expect(result.excluded).toBe(1)
      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toMatchObject({
        opponentId: 238,
        games: 2,
        winRate: { value: 1, samples: 2 },
        goldDiff10: { value: 1000, samples: 1 },
        csDiff10: { value: 20, samples: 1 }
      })
      expect(result.matchCount).toBe(2)
      expect(result.matches[0].gameId).toBe(2)
      const page2 = await loadMatchups(db, { ...query(), patch: '26.20', page: 2 })
      expect(page2.matches[0]).toMatchObject({ gameId: 1, reportId: latest })
      expect((await loadMatchups(db, { ...query(), position: 'TOP' })).total).toBe(0)
      expect((await loadMatchups(db, { ...query(), from: 2000, to: 2000 })).total).toBe(1)
    })
    it('does not fill missing metrics or accept ambiguous positions and unsupported maps', async () => {
      const a = await insert(1)
      await report(a, 1, null)
      const b = await insert(2)
      b.summary.data.json.participants[1].teamPosition = 'MIDDLE'
      await db.query('UPDATE PoolMatches SET summary=? WHERE gameId=2', [JSON.stringify(b.summary)])
      const c = await insert(3)
      c.summary.data.json.mapId = 12
      await db.query('UPDATE PoolMatches SET summary=? WHERE gameId=3', [JSON.stringify(c.summary)])
      const result = await loadMatchups(db, query())
      expect(result.excluded).toBe(2)
      expect(result.total).toBe(1)
      expect(result.items[0].goldDiff10).toEqual({
        value: null,
        samples: 0,
        excluded: { missing: 1 }
      })
    })
  }
)
