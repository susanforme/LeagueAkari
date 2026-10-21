import type { LeagueClientMain } from '@main/shards/league-client'
import type { AkariLogger } from '@main/shards/logger-factory'
import type { SgpMain } from '@main/shards/sgp'
import { MAX_CACHED_ANALYSIS, type PlayerIdentity, type PoolMatch } from '@shared/pro/champion-pool'
import {
  type ProfileMatches,
  type ProfileMatchesQuery,
  type ProfileSnapshot,
  type ProfileStatus,
  type ProfileTrend,
  type ProfileTrendQuery,
  rankedSnapshotSchema
} from '@shared/pro/profile'
import { reaction } from 'mobx'
import { randomUUID } from 'node:crypto'
import type { DataSource } from 'typeorm'

import { activityStart, summarizeActivity } from './activity'

export class ProfileController {
  private readonly _disposers: (() => void)[] = []
  private _timer: ReturnType<typeof setTimeout> | null = null
  private _abort = new AbortController()
  private _pending = new Set<Promise<ProfileSnapshot>>()
  private _epoch = 0
  private _disposed = false
  private _error = false
  constructor(
    private readonly _database: () => DataSource,
    private readonly _leagueClient: LeagueClientMain,
    private readonly _sgp: SgpMain,
    private readonly _logger: AkariLogger
  ) {}

  private _identity(): PlayerIdentity | null {
    const puuid = this._leagueClient.data.summoner.me?.puuid
    const serverId = this._sgp.state.availability.sgpServerId
    return this._leagueClient.state.isConnected && puuid && serverId ? { serverId, puuid } : null
  }
  status(): ProfileStatus {
    return { current: this._identity(), capturing: this._pending.size > 0, error: this._error }
  }
  start() {
    this._disposers.push(
      reaction(
        () => JSON.stringify([this._identity(), this._leagueClient.state.auth?.pid]),
        () => {
          this._epoch++
          this._abort.abort()
          this._abort = new AbortController()
          if (this._timer) clearTimeout(this._timer)
          this._timer = null
          this._error = false
          if (this._identity()) this._schedule('connected')
        },
        { fireImmediately: true }
      )
    )
    this._disposers.push(
      this._leagueClient.events.on('/lol-ranked/v1/current-ranked-stats', () =>
        this._schedule('rankedUpdate')
      ),
      this._leagueClient.events.on('/lol-gameflow/v1/gameflow-phase', (event) => {
        if (event.data === 'EndOfGame') this._schedule('endGame')
      })
    )
  }
  private _schedule(reason: ProfileSnapshot['reason']) {
    if (this._disposed || !this._identity()) return
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(() => {
      this._timer = null
      void this.capture(reason).catch(() => {})
    }, 1500)
  }
  capture(reason: ProfileSnapshot['reason'] = 'manual') {
    const identity = this._identity()
    if (this._disposed || !identity) return Promise.reject(new Error('Client unavailable'))
    const epoch = this._epoch
    const task = this._capture(identity, reason, epoch)
      .catch((error) => {
        if (epoch === this._epoch && !this._disposed) {
          this._error = true
          this._logger.warn('Personal rank snapshot failed; previous snapshots retained')
        }
        throw error
      })
      .finally(() => this._pending.delete(task))
    this._pending.add(task)
    return task
  }
  private async _capture(
    identity: PlayerIdentity,
    reason: ProfileSnapshot['reason'],
    epoch: number
  ): Promise<ProfileSnapshot> {
    const database = this._database()
    const summoner = JSON.parse(JSON.stringify(this._leagueClient.data.summoner.me))
    const { data } = await this._leagueClient.api.ranked.getCurrentRankedStats({
      signal: AbortSignal.any([this._abort.signal, AbortSignal.timeout(30_000)])
    })
    rankedSnapshotSchema.parse(data)
    if (
      this._disposed ||
      epoch !== this._epoch ||
      JSON.stringify(identity) !== JSON.stringify(this._identity())
    )
      throw new Error('Client changed')
    const snapshot: ProfileSnapshot = {
      ...identity,
      id: randomUUID(),
      observedAt: Date.now(),
      reason,
      summoner,
      ranked: data
    }
    await database.query('INSERT INTO ProfileSnapshots VALUES (?, ?, ?, ?, ?, ?, ?)', [
      snapshot.id,
      identity.serverId,
      identity.puuid,
      snapshot.observedAt,
      reason,
      JSON.stringify(summoner),
      JSON.stringify(data)
    ])
    this._error = false
    return snapshot
  }
  private _decode(row: any): ProfileSnapshot {
    return { ...row, summoner: JSON.parse(row.summoner), ranked: JSON.parse(row.ranked) }
  }
  async players(): Promise<ProfileSnapshot[]> {
    const rows = await this._database().query(`SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY serverId, puuid ORDER BY observedAt DESC, rowid DESC) AS n
      FROM ProfileSnapshots) WHERE n = 1 ORDER BY observedAt DESC`)
    return rows.map(this._decode)
  }
  async history(
    player: PlayerIdentity,
    page: number
  ): Promise<{ items: ProfileSnapshot[]; total: number }> {
    const database = this._database()
    const params = [player.serverId, player.puuid]
    const [{ total }] = await database.query(
      'SELECT COUNT(*) AS total FROM ProfileSnapshots WHERE serverId = ? AND puuid = ?',
      params
    )
    const rows = await database.query(
      'SELECT * FROM ProfileSnapshots WHERE serverId = ? AND puuid = ? ORDER BY observedAt DESC, rowid DESC LIMIT 30 OFFSET ?',
      [...params, (page - 1) * 30]
    )
    return { items: rows.map(this._decode), total }
  }
  async trend(query: ProfileTrendQuery): Promise<ProfileTrend> {
    const database = this._database()
    const projection = `SELECT s.rowid AS sequence, s.id, s.observedAt, s.reason,
      json_extract(s.ranked, ?) AS season, q.value AS entry
      FROM ProfileSnapshots s, json_each(s.ranked, '$.queues') q
      WHERE s.serverId = ? AND s.puuid = ? AND json_extract(q.value, '$.queueType') = ?`
    const parameters = [
      `$.seasons.${query.queue}.currentSeasonId`,
      query.serverId,
      query.puuid,
      query.queue
    ]
    const seasons: (number | null)[] = (
      await database.query(
        `SELECT DISTINCT season FROM (${projection}) ORDER BY season DESC`,
        parameters
      )
    ).map((row: { season: number | null }) => row.season)
    const season = query.season === undefined ? (seasons[0] ?? null) : query.season
    const rows = await database.query(
      `SELECT id, observedAt, reason, entry FROM (${projection})
       WHERE season IS ? ORDER BY observedAt, sequence`,
      [...parameters, season]
    )
    return {
      seasons,
      season,
      points: rows.map(
        (row: {
          id: string
          observedAt: number
          reason: ProfileSnapshot['reason']
          entry: string
        }) => {
          const rank = JSON.parse(row.entry)
          return {
            id: row.id,
            observedAt: row.observedAt,
            reason: row.reason,
            tier: rank.tier,
            division: rank.division,
            leaguePoints: rank.leaguePoints,
            isProvisional: rank.isProvisional,
            wins: rank.wins,
            losses: rank.losses
          }
        }
      )
    }
  }
  async activity(player: PlayerIdentity) {
    const now = Date.now()
    const rows: { projection: string; duration: number | null }[] = await this._database().query(
      `SELECT projection, CASE json_extract(summary, '$.source')
         WHEN 'sgp' THEN json_extract(summary, '$.data.json.gameDuration')
         ELSE json_extract(summary, '$.data.gameDuration') END AS duration
       FROM PoolMatches WHERE serverId = ? AND puuid = ? AND startedAt >= ? AND startedAt < ?
       ORDER BY startedAt DESC, gameId DESC LIMIT ?`,
      [player.serverId, player.puuid, activityStart(now), now, MAX_CACHED_ANALYSIS + 1]
    )
    return summarizeActivity(
      rows.slice(0, MAX_CACHED_ANALYSIS).map((row) => ({
        match: JSON.parse(row.projection) as PoolMatch,
        duration: row.duration
      })),
      now,
      rows.length > MAX_CACHED_ANALYSIS
    )
  }
  async matches(query: ProfileMatchesQuery): Promise<ProfileMatches> {
    const database = this._database()
    const parameters: (string | number)[] = [query.serverId, query.puuid]
    const conditions = ['serverId = ?', 'puuid = ?']
    if (query.championId !== null) {
      conditions.push("json_extract(projection, '$.championId') = ?")
      parameters.push(query.championId)
    }
    if (query.from !== null) {
      conditions.push('startedAt >= ?')
      parameters.push(query.from)
    }
    if (query.to !== null) {
      conditions.push('startedAt < ?')
      parameters.push(query.to)
    }
    const where = conditions.join(' AND ')
    const [{ total }] = await database.query(
      `SELECT COUNT(*) total FROM PoolMatches WHERE ${where}`,
      parameters
    )
    const rows: { summary: string }[] = await database.query(
      `SELECT summary FROM PoolMatches WHERE ${where} ORDER BY startedAt DESC, gameId DESC LIMIT ? OFFSET ?`,
      [...parameters, query.pageSize, (query.page - 1) * query.pageSize]
    )
    return { items: rows.map((row) => JSON.parse(row.summary)), total }
  }
  async dispose() {
    this._disposed = true
    this._epoch++
    this._disposers.splice(0).forEach((dispose) => dispose())
    if (this._timer) clearTimeout(this._timer)
    this._abort.abort()
    await Promise.allSettled(this._pending)
  }
}
