import type { AutoGameflowMain } from '@main/shards/auto-gameflow'
import type { LeagueClientMain } from '@main/shards/league-client'
import type { AkariLogger } from '@main/shards/logger-factory'
import type { SettingFactoryMain } from '@main/shards/setting-factory'
import type { SgpMain } from '@main/shards/sgp'
import type { WindowManagerMain } from '@main/shards/window-manager'
import { MAX_CACHED_ANALYSIS, type PlayerIdentity } from '@shared/pro/champion-pool'
import {
  type CachedGame,
  type ExperiencePreferences,
  type ExperienceStatus,
  type Scene,
  type SceneValues,
  type SocialSummary,
  type Workspace,
  preferencesSchema,
  sceneSchema,
  workspaceSchema
} from '@shared/pro/experience'
import { partnerSummary, sessionSummary } from '@shared/pro/experience/summary'
import type { ProfileSnapshot } from '@shared/pro/profile'
import { reaction } from 'mobx'

import type { ChampionPoolMain } from '../champion-pool'
import type { ProStorageMain } from '../storage'

export interface ExperienceContext {
  storage: ProStorageMain
  leagueClient: LeagueClientMain
  sgp: SgpMain
  pool: ChampionPoolMain
  settings: SettingFactoryMain
  gameflow: AutoGameflowMain
  windows: WindowManagerMain
  logger: AkariLogger
}
const fields = {
  autoAccept: 'autoAcceptEnabled',
  autoHonor: 'autoHonorEnabled',
  playAgain: 'playAgainEnabled',
  autoMatchmaking: 'autoMatchmakingEnabled'
} as const

export class ExperienceController {
  private _preferences: ExperiencePreferences = { restore: true, archive: true }
  private _lastAccount = 'offline'
  private _timer: ReturnType<typeof setTimeout> | undefined
  private _disposers: (() => void)[] = []
  private _archiveTask: Promise<void> | null = null
  private _disposed = false
  private _sceneBusy = false
  private _expectedGame: number | null = null
  private _attempt = 0
  archiveError = false
  constructor(private readonly _context: ExperienceContext) {}
  private get _database() {
    return this._context.storage.dataSource
  }
  identity(): PlayerIdentity | null {
    const { leagueClient, sgp } = this._context
    const puuid = leagueClient.data.summoner.me?.puuid,
      serverId = sgp.state.availability.sgpServerId
    return leagueClient.state.isConnected && puuid && serverId ? { puuid, serverId } : null
  }
  async start() {
    if (this._context.storage.status !== 'ready') return
    const [row] = await this._database.query('SELECT payload FROM ExperiencePreferences WHERE id=1')
    if (row) this._preferences = preferencesSchema.parse(JSON.parse(row.payload))
    const [last] = await this._database.query(
      'SELECT accountKey FROM ExperienceWorkspaces ORDER BY updatedAt DESC LIMIT 1'
    )
    this._lastAccount = last?.accountKey ?? 'offline'
    this._disposers.push(
      reaction(
        () => JSON.stringify([this.identity(), this._context.sgp.state.isTokenReady]),
        () => {
          const identity = this.identity()
          if (identity) {
            const key = JSON.stringify([identity.serverId, identity.puuid])
            if (key !== this._lastAccount) {
              this._expectedGame = null
              this._attempt = 0
              this.archiveError = false
            }
            this._lastAccount = key
          }
          this._schedule()
        },
        { fireImmediately: true }
      )
    )
    this._disposers.push(
      this._context.leagueClient.events.on('/lol-gameflow/v1/gameflow-phase', (event) => {
        if (event.data === 'EndOfGame') {
          this._expectedGame =
            this._context.leagueClient.data.gameflow.session?.gameData.gameId ?? null
          this._attempt = 0
          this._schedule()
        }
      })
    )
  }
  private _schedule() {
    clearTimeout(this._timer)
    if (!this.identity() || !this._preferences.archive || this._disposed) return
    this._timer = setTimeout(
      () => {
        void this.archive().catch(() => {})
      },
      this._attempt ? 15_000 : 5000
    )
  }
  async archive() {
    if (this._archiveTask) return this._archiveTask
    const player = this.identity()
    if (!player || !this._preferences.archive || this._disposed) return
    const task = (async () => {
      const preferred = await this._context.settings.getSetting(
        'player-tabs-renderer',
        'matchHistoryUseSgpApi'
      )
      if (JSON.stringify(player) !== JSON.stringify(this.identity())) return
      const me = this._context.leagueClient.data.summoner.me!
      await this._context.pool.archive({
        ...player,
        name: `${me.gameName}#${me.tagLine}`,
        count: 200,
        preferredSource: preferred === false ? 'lcu' : 'sgp'
      })
      if (this._expectedGame && !(await this._context.pool.match(player, this._expectedGame))) {
        this._attempt++
        if (this._attempt < 3) this._schedule()
        else throw new Error('Latest match is not available yet')
      } else {
        this._expectedGame = null
        this._attempt = 0
      }
      this.archiveError = false
    })()
      .catch((error) => {
        if (JSON.stringify(player) === JSON.stringify(this.identity())) this.archiveError = true
        this._context.logger.warn('Automatic archive incomplete; cached matches retained')
        throw error
      })
      .finally(() => {
        this._archiveTask = null
        if (JSON.stringify(player) !== JSON.stringify(this.identity())) this._schedule()
      })
    this._archiveTask = task
    return task
  }
  private _values(): SceneValues {
    const { gameflow, windows } = this._context
    return {
      autoAccept: gameflow.settings.autoAcceptEnabled,
      autoHonor: gameflow.settings.autoHonorEnabled,
      playAgain: gameflow.settings.playAgainEnabled,
      autoMatchmaking: gameflow.settings.autoMatchmakingEnabled,
      auxWindow: windows.auxWindow.settings.autoShow,
      opggWindow: windows.opggWindow.settings.autoShow
    }
  }
  async status(): Promise<ExperienceStatus & { archiveError: boolean; archiving: boolean }> {
    const values = this._values(),
      scenes = await this.scenes()
    return {
      account: this.identity(),
      accountKey: this._lastAccount,
      preferences: this._preferences,
      values,
      scene:
        scenes.find((scene) =>
          Object.keys(values).every(
            (key) => values[key as keyof SceneValues] === scene.values[key as keyof SceneValues]
          )
        )?.name ?? null,
      archiveError: this.archiveError,
      archiving: !!this._archiveTask
    }
  }
  async preferences(value: ExperiencePreferences) {
    await this._database.query(
      'INSERT INTO ExperiencePreferences VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
      [JSON.stringify(value)]
    )
    this._preferences = value
    if (value.archive) this._schedule()
  }
  async workspace(accountKey: string): Promise<Workspace | null> {
    if (!this._preferences.restore) return null
    const [row] = await this._database.query(
      'SELECT payload FROM ExperienceWorkspaces WHERE accountKey=?',
      [accountKey]
    )
    return row ? workspaceSchema.parse(JSON.parse(row.payload)) : null
  }
  async saveWorkspace(accountKey: string, workspace: Workspace) {
    if (!this._preferences.restore) return
    await this._database.query(
      'INSERT INTO ExperienceWorkspaces VALUES (?,?,?) ON CONFLICT(accountKey) DO UPDATE SET updatedAt=excluded.updatedAt,payload=excluded.payload',
      [accountKey, Date.now(), JSON.stringify(workspace)]
    )
  }
  async scenes(): Promise<Scene[]> {
    return (await this._database.query('SELECT payload FROM ExperienceScenes ORDER BY name')).map(
      (row: { payload: string }) => sceneSchema.parse(JSON.parse(row.payload))
    )
  }
  async saveScene(scene: Scene) {
    const [{ count }] = await this._database.query(
      'SELECT COUNT(*) count FROM ExperienceScenes WHERE name<>?',
      [scene.name]
    )
    if (count >= 20) throw new Error('Scene limit reached')
    await this._database.query(
      'INSERT INTO ExperienceScenes VALUES (?,?) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload',
      [scene.name, JSON.stringify(scene)]
    )
  }
  async deleteScene(name: string) {
    await this._database.query('DELETE FROM ExperienceScenes WHERE name=?', [name])
  }
  async applyScene(name: string) {
    if (this._sceneBusy) throw new Error('busy')
    this._sceneBusy = true
    try {
      const scene = (await this.scenes()).find((s) => s.name === name)
      if (!scene) throw new Error('Scene unavailable')
      const previous = this._values()
      try {
        await this._apply(scene.values)
      } catch (error) {
        // Settings span upstream persistence; compensate rather than pretending cross-database atomicity.
        await this._apply(previous)
        throw error
      }
    } finally {
      this._sceneBusy = false
    }
  }
  private async _apply(values: SceneValues) {
    for (const key of Object.keys(fields) as (keyof typeof fields)[])
      await this._context.settings.setSetting('auto-gameflow-main', fields[key], values[key])
    for (const key of ['auxWindow', 'opggWindow'] as const) {
      const window = this._context.windows[key]
      await this._context.settings.setSetting(
        `window-manager-main/${key === 'auxWindow' ? 'aux-window' : 'opgg-window'}`,
        'autoShow',
        values[key]
      )
      if (values[key]) window.show()
      else window.hide()
    }
  }
  async social(player: PlayerIdentity): Promise<SocialSummary> {
    const rows: { projection: string; summary: string }[] = await this._database.query(
      'SELECT projection,summary FROM PoolMatches WHERE serverId=? AND puuid=? ORDER BY startedAt DESC LIMIT ?',
      [player.serverId, player.puuid, MAX_CACHED_ANALYSIS + 1]
    )
    const games: CachedGame[] = rows
      .slice(0, MAX_CACHED_ANALYSIS)
      .map((row) => ({ match: JSON.parse(row.projection), summary: JSON.parse(row.summary) }))
    const session = sessionSummary(games)
    const ranks: SocialSummary['ranks'] = []
    if (session) {
      const snapshots: { observedAt: number; ranked: string }[] = await this._database.query(
        'SELECT observedAt,ranked FROM ProfileSnapshots WHERE serverId=? AND puuid=? AND observedAt>=? AND observedAt<=? ORDER BY observedAt',
        [
          player.serverId,
          player.puuid,
          session.from - 2 * 60 * 60 * 1000,
          session.to + 10 * 60 * 1000
        ]
      )
      const first = snapshots.filter((s) => s.observedAt <= session.from).at(-1),
        last = snapshots.at(-1)
      if (first && last && first !== last) {
        const before: ProfileSnapshot['ranked'] = JSON.parse(first.ranked),
          after: ProfileSnapshot['ranked'] = JSON.parse(last.ranked)
        for (const a of before.queues) {
          const b = after.queues.find((q) => q.queueType === a.queueType)
          if (
            !b ||
            !before.seasons?.[a.queueType] ||
            before.seasons[a.queueType].currentSeasonId !==
              after.seasons?.[a.queueType]?.currentSeasonId
          )
            continue
          const label = (rank: typeof a) =>
            `${rank.tier} ${rank.division} · ${rank.leaguePoints} LP`
          ranks.push({ queue: a.queueType, before: label(a), after: label(b) })
        }
      }
    }
    return {
      session,
      partners: partnerSummary(games, player.puuid),
      scanned: games.length,
      truncated: rows.length > MAX_CACHED_ANALYSIS,
      ranks
    }
  }
  async games(player: PlayerIdentity, ids: number[]) {
    if (!ids.length) return []
    const rows = await this._database.query(
      `SELECT summary FROM PoolMatches WHERE serverId=? AND puuid=? AND gameId IN (${ids.map(() => '?').join(',')}) ORDER BY startedAt DESC`,
      [player.serverId, player.puuid, ...ids]
    )
    return rows.map((row: { summary: string }) => JSON.parse(row.summary))
  }
  async search(text: string, champions: number[]) {
    const championClause = champions.length
      ? ` OR championId IN (${champions.map(() => '?').join(',')})`
      : ''
    const notes = await this._database.query(
      `SELECT id,championId,title FROM NotebookEntries WHERE deleted=0 AND (instr(lower(title),lower(?))>0${championClause}) ORDER BY pinned DESC,updatedAt DESC LIMIT 20`,
      [text, ...champions]
    )
    const reports = await this._database.query(
      `SELECT id,championId,gameId,startedAt FROM ReviewReports WHERE instr(CAST(gameId AS TEXT),?)>0${championClause} ORDER BY startedAt DESC,createdAt DESC LIMIT 20`,
      [text, ...champions]
    )
    return { notes, reports }
  }
  async dispose() {
    this._disposed = true
    clearTimeout(this._timer)
    this._disposers.forEach((dispose) => dispose())
    await this._archiveTask?.catch(() => {})
  }
}
