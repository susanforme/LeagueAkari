import type { LcuOrSgpGameDetails, LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import {
  CHAMPION_POOL_NAMESPACE,
  MAX_CACHED_ANALYSIS,
  type PlayerIdentity,
  type PoolMatch,
  type PoolMatchPage,
  type PoolMatchQuery,
  type PoolPlayer,
  type PoolQuery,
  type PoolStatus,
  type SyncRequest,
  type SyncStatus
} from '@shared/pro/champion-pool'
import type { MatchupQuery } from '@shared/pro/champion-pool/matchups'

import { aggregatePool } from './aggregation'
import type { ChampionPoolContext } from './context'
import { MatchHistoryLoader } from './match-history-loader'
import { loadMatchups } from './matchup-loader'
import { normalizeMatch } from './normalization'

export class ChampionPoolController {
  private readonly _loader: MatchHistoryLoader
  private readonly _detailsAbort = new AbortController()
  private _abort: AbortController | null = null
  private _task: Promise<void> | null = null
  private _retry: { request: SyncRequest; offset: number; incremental: boolean } | null = null
  private _sync: SyncStatus = {
    player: null,
    running: false,
    processed: 0,
    requested: 0,
    cancelled: false,
    error: null
  }

  constructor(private readonly _context: ChampionPoolContext) {
    this._loader = new MatchHistoryLoader(_context)
  }

  status(): PoolStatus {
    return { storage: this._context.storage.status, sync: { ...this._sync } }
  }

  async players(): Promise<PoolPlayer[]> {
    const { storage, leagueClient, sgp } = this._context
    const players: PoolPlayer[] =
      storage.status === 'ready'
        ? await storage.dataSource.query('SELECT * FROM PoolPlayers ORDER BY updatedAt DESC')
        : []
    const me = leagueClient.data.summoner.me
    const serverId = sgp.state.availability.sgpServerId
    if (
      leagueClient.state.isConnected &&
      me?.puuid &&
      serverId &&
      !players.some((p) => p.puuid === me.puuid && p.serverId === serverId)
    ) {
      players.unshift({
        serverId,
        puuid: me.puuid,
        name: `${me.gameName}#${me.tagLine}`,
        updatedAt: 0
      })
    }
    return players
  }

  matchups(query: MatchupQuery) {
    return loadMatchups(this._context.storage.dataSource, query)
  }

  async query(query: PoolQuery) {
    const database = this._context.storage.dataSource
    const parameters = [query.serverId, query.puuid]
    const [{ count }] = await database.query(
      'SELECT COUNT(*) AS count FROM PoolMatches WHERE serverId = ? AND puuid = ?',
      parameters
    )
    const rows: { projection: string; summary: string }[] = await database.query(
      'SELECT projection, summary FROM PoolMatches WHERE serverId = ? AND puuid = ? ORDER BY startedAt DESC, gameId DESC LIMIT ?',
      [...parameters, MAX_CACHED_ANALYSIS]
    )
    return aggregatePool(
      rows.map((r) => {
        const projection: PoolMatch = JSON.parse(r.projection)
        if (projection.killParticipation === undefined || projection.visionPerMin === undefined) {
          const current = normalizeMatch(JSON.parse(r.summary), query.puuid)
          projection.killParticipation = current.killParticipation
          projection.visionPerMin = current.visionPerMin
        }
        return projection
      }),
      query,
      count
    )
  }

  async match(player: PlayerIdentity, gameId: number): Promise<LcuOrSgpGameSummary | null> {
    const rows: { summary: string }[] = await this._context.storage.dataSource.query(
      'SELECT summary FROM PoolMatches WHERE serverId = ? AND puuid = ? AND gameId = ?',
      [player.serverId, player.puuid, gameId]
    )
    return rows.length ? JSON.parse(rows[0].summary) : null
  }

  async matches(query: PoolMatchQuery): Promise<PoolMatchPage> {
    const conditions = [
      'serverId = ?',
      'puuid = ?',
      "json_extract(projection, '$.championId') = ?",
      "json_extract(projection, '$.outcome') != 'remake'"
    ]
    const parameters: (string | number)[] = [query.serverId, query.puuid, query.championId]
    if (query.queueIds.length) {
      conditions.push(
        `json_extract(projection, '$.queueId') IN (${query.queueIds.map(() => '?').join(',')})`
      )
      parameters.push(...query.queueIds)
    }
    for (const field of ['position', 'patch'] as const) {
      if (query[field] !== null) {
        conditions.push(`json_extract(projection, '$.${field}') = ?`)
        parameters.push(query[field])
      }
    }
    if (query.from !== null) {
      conditions.push('startedAt >= ?')
      parameters.push(query.from)
    }
    if (query.to !== null) {
      conditions.push('startedAt <= ?')
      parameters.push(query.to)
    }
    const where = conditions.join(' AND ')
    const database = this._context.storage.dataSource
    const [{ total }] = await database.query(
      `SELECT COUNT(*) AS total FROM PoolMatches WHERE ${where}`,
      parameters
    )
    const rows: { summary: string }[] = await database.query(
      `SELECT summary FROM PoolMatches WHERE ${where} ORDER BY startedAt DESC, gameId DESC LIMIT ? OFFSET ?`,
      [...parameters, query.pageSize, (query.page - 1) * query.pageSize]
    )
    return { items: rows.map((row) => JSON.parse(row.summary)), total }
  }

  async details(player: PlayerIdentity, gameId: number): Promise<LcuOrSgpGameDetails | null> {
    const summary = await this.match(player, gameId)
    if (!summary) return null
    const source = this._loader.source({
      ...player,
      name: '',
      count: 20,
      preferredSource: summary.source
    })
    if (source !== summary.source) throw new Error('Cached source unavailable')
    const options = {
      signal: AbortSignal.any([this._detailsAbort.signal, AbortSignal.timeout(30_000)])
    }
    if (source === 'sgp') {
      const { data } = await this._context.sgp.api.matchHistoryQuery.getGameDetailsByGameId(
        gameId,
        {
          ...options,
          __sgpServerId: player.serverId
        }
      )
      return { source, gameId, data }
    }
    const { data } = await this._context.leagueClient.api.matchHistory.getTimeline(gameId, options)
    return { source, gameId, data }
  }

  start(request: SyncRequest, incremental = false, offset = 0) {
    if (this._sync.running) throw new Error('busy')
    const database = this._context.storage.dataSource
    const source = this._loader.source(request)
    const connectedPuuid = this._context.leagueClient.data.summoner.me?.puuid
    this._abort = new AbortController()
    const signal = this._abort.signal
    this._sync = {
      player: request,
      running: true,
      processed: offset,
      requested: request.count,
      cancelled: false,
      error: null
    }
    this._retry = { request, offset, incremental }
    this._task = this._synchronize(
      request,
      source,
      connectedPuuid,
      database,
      signal,
      incremental,
      offset
    )
      .catch(() => {
        if (signal.aborted) this._sync.cancelled = true
        else {
          this._sync.error = 'syncFailed'
          this._context.logger.warn('Champion pool synchronization failed; cached pages retained')
        }
      })
      .finally(() => {
        this._sync.running = false
        this._abort = null
        this._context.ipc.sendEvent(CHAMPION_POOL_NAMESPACE, 'cache-changed')
      })
    return this.status()
  }

  retry() {
    if (!this._retry || this._sync.running) throw new Error('No failed task')
    return this.start(this._retry.request, this._retry.incremental, this._retry.offset)
  }

  async archive(request: SyncRequest) {
    if (this._sync.running) await this._task
    if (
      this._sync.error &&
      this._retry?.incremental &&
      this._retry.request.serverId === request.serverId &&
      this._retry.request.puuid === request.puuid
    )
      this.retry()
    else this.start(request, true)
    await this._task
    if (this._sync.error || this._sync.cancelled) throw new Error('Archive incomplete')
  }

  cancel() {
    this._abort?.abort()
  }

  async dispose() {
    this._detailsAbort.abort()
    this.cancel()
    await this._task
  }

  private async _synchronize(
    request: SyncRequest,
    source: 'sgp' | 'lcu',
    connectedPuuid: string | undefined,
    database: ChampionPoolContext['storage']['dataSource'],
    signal: AbortSignal,
    incremental: boolean,
    startOffset: number
  ) {
    const assertSession = () => {
      signal.throwIfAborted()
      if (
        this._context.leagueClient.data.summoner.me?.puuid !== connectedPuuid ||
        !this._context.leagueClient.state.isConnected ||
        this._context.sgp.state.availability.sgpServerId !== request.serverId
      ) {
        throw new Error('Client session changed')
      }
    }
    const seen = new Set<number>()
    const existingIds: { gameId: number }[] = incremental
      ? await database.query('SELECT gameId FROM PoolMatches WHERE serverId=? AND puuid=?', [
          request.serverId,
          request.puuid
        ])
      : []
    const cached = new Set(existingIds.map((row) => row.gameId))
    for (let offset = startOffset; offset < request.count; offset += 20) {
      this._retry = { request, offset, incremental }
      assertSession()
      const count = Math.min(20, request.count - offset)
      const summaries = await this._loader.loadPage(request, source, offset, count, signal, cached)
      assertSession()
      const fresh = summaries.filter((s) => !seen.has(s.gameId) && !cached.has(s.gameId))
      if (!fresh.length) break
      const matches = fresh.map((summary) => ({
        summary,
        projection: normalizeMatch(summary, request.puuid)
      }))
      await database.transaction(async (manager) => {
        for (const { summary, projection } of matches) {
          const [existing]: { projection: string; summary: string }[] = await manager.query(
            'SELECT projection, summary FROM PoolMatches WHERE serverId = ? AND puuid = ? AND gameId = ?',
            [request.serverId, request.puuid, projection.gameId]
          )
          let cachedSummary = summary
          if (existing) {
            const previous: PoolMatch = JSON.parse(existing.projection)
            // A partial LCU retry must not erase metrics already obtained from a complete game.
            for (const key of [
              'championId',
              'kills',
              'deaths',
              'assists',
              'csPerMin',
              'damageShare',
              'killParticipation',
              'visionPerMin'
            ] as const) {
              projection[key] ??= previous[key]
            }
            if (projection.position === 'UNKNOWN') projection.position = previous.position
            if (!projection.patch) projection.patch = previous.patch
            if (projection.outcome === 'unknown') projection.outcome = previous.outcome
            const oldSummary: LcuOrSgpGameSummary = JSON.parse(existing.summary)
            const size = (s: LcuOrSgpGameSummary) =>
              s.source === 'sgp' ? s.data.json.participants.length : s.data.participants.length
            if (size(oldSummary) > size(summary)) cachedSummary = oldSummary
          }
          await manager.query(
            `INSERT INTO PoolMatches (serverId, puuid, gameId, startedAt, projection, summary) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(serverId, puuid, gameId) DO UPDATE SET
             startedAt = excluded.startedAt, projection = excluded.projection, summary = excluded.summary`,
            [
              request.serverId,
              request.puuid,
              projection.gameId,
              projection.startedAt,
              JSON.stringify(projection),
              JSON.stringify(cachedSummary)
            ]
          )
        }
        await manager.query(
          `INSERT INTO PoolPlayers (serverId, puuid, name, updatedAt) VALUES (?, ?, ?, ?)
           ON CONFLICT(serverId, puuid) DO UPDATE SET name = excluded.name, updatedAt = excluded.updatedAt`,
          [request.serverId, request.puuid, request.name || request.puuid, Date.now()]
        )
        assertSession()
      })
      matches.forEach(({ projection }) => seen.add(projection.gameId))
      this._sync.processed = offset + summaries.length
      if (summaries.length < count || (incremental && summaries.some((s) => cached.has(s.gameId))))
        break
    }
    this._retry = null
  }
}
