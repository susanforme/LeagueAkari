import type { LeagueClientMain } from '@main/shards/league-client'
import type { SgpMain } from '@main/shards/sgp'
import type { BuildApply, NotebookEntry } from '@shared/pro/notebook'
import { type IReactionDisposer, reaction } from 'mobx'
import { randomUUID } from 'node:crypto'
import stringify from 'safe-stable-stringify'
import type { DataSource } from 'typeorm'
import { z } from 'zod'

import type { NotebookController } from './notebook-controller'

export function clientItemSet(entry: NotebookEntry, uid: string) {
  if (
    entry.deleted ||
    entry.content.kind !== 'build' ||
    !entry.content.groups.some((g) => g.items.length)
  )
    throw new Error('Invalid build')
  return {
    uid,
    title: entry.content.title,
    type: 'custom',
    map: 'any',
    mode: 'any',
    associatedChampions: [entry.content.championId],
    associatedMaps: [entry.content.mapId ?? 11],
    blocks: entry.content.groups.map((group) => ({
      type: group.name,
      items: group.items.map((item) => ({ id: String(item.id), count: item.count }))
    }))
  }
}
const collectionSchema = z
  .object({ itemSets: z.array(z.object({ uid: z.string().min(1) }).passthrough()).max(1000) })
  .passthrough()
function matchesItemSet(value: Record<string, unknown>, desired: ReturnType<typeof clientItemSet>) {
  return ['uid', 'title', 'associatedChampions', 'associatedMaps', 'blocks'].every(
    (key) => stringify(value[key]) === stringify(desired[key as keyof typeof desired])
  )
}
export class BuildSyncController {
  private _disposer: IReactionDisposer | undefined
  private _running: Promise<unknown> | null = null
  private _disposed = false
  private _autoRequested = false
  private _autoTask: Promise<void> | null = null
  status: { entryId: string | null; state: string } = { entryId: null, state: 'waiting' }
  constructor(
    private readonly _database: () => DataSource,
    private readonly _notebooks: NotebookController,
    private readonly _league: LeagueClientMain,
    private readonly _sgp: SgpMain,
    private readonly _warn: (error: unknown) => void
  ) {}
  private _identity() {
    return JSON.stringify([
      this._league.state.isConnected,
      this._league.state.auth?.pid,
      this._sgp.state.availability.sgpServerId,
      this._league.data.summoner.me?.puuid
    ])
  }
  private _selection() {
    const s = this._league.data.champSelect.session
    const self = s?.myTeam.find((p) => p.cellId === s.localPlayerCellId)
    return this._league.data.gameflow.phase === 'ChampSelect' &&
      s &&
      !s.isSpectating &&
      self?.championId
      ? {
          championId: self.championId,
          mapId: this._league.data.gameflow.session?.map.id,
          session: s.id
        }
      : null
  }
  start() {
    this._disposer = reaction(
      () => JSON.stringify([this._identity(), this._selection()]),
      () => this._requestAuto(),
      { fireImmediately: true }
    )
  }
  private _requestAuto() {
    this._autoRequested = true
    if (this._autoTask || this._running || this._disposed) return
    this._autoTask = (async () => {
      while (this._autoRequested && !this._disposed) {
        this._autoRequested = false
        const selected = this._selection()
        if (!selected) continue
        const signature = JSON.stringify([this._identity(), selected])
        const [rule] = await this._database().query(
          'SELECT entryId FROM BuildSyncRules WHERE championId=? AND mapId=? AND enabled=1',
          [selected.championId, selected.mapId ?? 0]
        )
        if (!rule || signature !== JSON.stringify([this._identity(), this._selection()])) continue
        const entry = await this._notebooks.get(rule.entryId)
        if (
          entry.deleted ||
          entry.content.championId !== selected.championId ||
          (entry.content.mapId ?? 11) !== selected.mapId
        )
          continue
        await this.apply(
          { entryId: entry.id, expectedRevision: entry.revision, mode: 'apply' },
          signature
        )
      }
    })()
      .catch(this._warn)
      .finally(() => {
        this._autoTask = null
        if (this._autoRequested && !this._disposed) this._requestAuto()
      })
  }
  async rule(entryId: string) {
    const entry = await this._notebooks.get(entryId)
    const [rule] = await this._database().query(
      'SELECT * FROM BuildSyncRules WHERE championId=? AND mapId=?',
      [entry.content.championId, entry.content.mapId ?? 11]
    )
    return {
      enabled: !!rule?.enabled && rule.entryId === entryId,
      status: this.status.entryId === entryId ? this.status.state : 'waiting'
    }
  }
  async setRule(entryId: string, enabled: boolean) {
    const entry = await this._notebooks.get(entryId)
    clientItemSet(entry, 'validation')
    if (!enabled) {
      await this._database().query('UPDATE BuildSyncRules SET enabled=0 WHERE entryId=?', [entryId])
      return
    }
    await this._database().query(
      'INSERT INTO BuildSyncRules VALUES (?,?,?,1) ON CONFLICT(championId,mapId) DO UPDATE SET entryId=excluded.entryId,enabled=1',
      [entry.content.championId, entry.content.mapId ?? 11, entryId]
    )
    this._requestAuto()
  }
  async check(entry: NotebookEntry, assertCurrent: () => void) {
    assertCurrent()
    const me = this._league.data.summoner.me!
    const [mapping] = await this._database().query(
      'SELECT uid FROM BuildApplications WHERE entryId=? AND playerKey=?',
      [entry.id, JSON.stringify([this._sgp.state.availability.sgpServerId, me.puuid])]
    )
    assertCurrent()
    if (!mapping) return false
    const response = await this._league.http.get(
      `/lol-item-sets/v1/item-sets/${me.summonerId}/sets`,
      { timeout: 15000 }
    )
    assertCurrent()
    const found = collectionSchema.parse(response.data).itemSets.find((s) => s.uid === mapping.uid)
    return !!found && matchesItemSet(found, clientItemSet(entry, mapping.uid))
  }
  apply(
    request: BuildApply,
    selection?: string,
    guard: () => void = () => {}
  ): Promise<{ state: string }> {
    if (this._running || this._disposed) return Promise.reject(new Error('busy'))
    const task = this._apply(request, selection, guard)
      .catch((error) => {
        this.status = {
          entryId: request.entryId,
          state: /conflict/.test(String(error))
            ? 'conflict'
            : this.status.entryId === request.entryId && this.status.state === 'pending'
              ? 'pending'
              : 'failed'
        }
        throw error
      })
      .finally(() => {
        this._running = null
        if (this._autoRequested && !this._autoTask && !this._disposed) this._requestAuto()
      })
    this._running = task
    return task
  }
  private async _apply(request: BuildApply, selection: string | undefined, guard: () => void) {
    guard()
    const entry = await this._notebooks.get(request.entryId)
    if (entry.revision !== request.expectedRevision) throw new Error('conflict')
    const identity = this._identity(),
      me = this._league.data.summoner.me,
      phase = this._league.data.gameflow.phase
    if (!me || !this._league.state.isConnected || !['Lobby', 'ChampSelect'].includes(phase ?? ''))
      throw new Error('Client unavailable')
    const assertCurrent = () => {
      guard()
      if (
        this._disposed ||
        identity !== this._identity() ||
        !['Lobby', 'ChampSelect'].includes(this._league.data.gameflow.phase ?? '') ||
        (selection && selection !== JSON.stringify([this._identity(), this._selection()]))
      )
        throw new Error('Session changed')
    }
    const playerKey = JSON.stringify([this._sgp.state.availability.sgpServerId, me.puuid]),
      database = this._database()
    const [mapping] = await database.query(
      'SELECT * FROM BuildApplications WHERE entryId=? AND playerKey=?',
      [entry.id, playerKey]
    )
    const uid = request.mode === 'new' ? randomUUID() : (mapping?.uid ?? randomUUID()),
      desired = clientItemSet(entry, uid)
    const knownItems = this._league.data.gameData.items
    if (
      !Object.keys(knownItems).length ||
      entry.content.groups.some((g) => g.items.some((i) => !knownItems[i.id]))
    )
      throw new Error('Item unavailable in current client')
    const path = `/lol-item-sets/v1/item-sets/${me.summonerId}/sets`
    const read = async () => {
      assertCurrent()
      const response = await this._league.http.get(path, { timeout: 15000 })
      assertCurrent()
      const data = collectionSchema.parse(response.data)
      if (new Set(data.itemSets.map((s) => s.uid)).size !== data.itemSets.length)
        throw new Error('Invalid item sets')
      return data
    }
    const collection = await read(),
      found = collection.itemSets.find((s) => s.uid === uid)
    const matches = (value: Record<string, unknown>) => matchesItemSet(value, desired)
    const record = async (state: string, value: unknown, fingerprint: string) =>
      database.query(
        'INSERT INTO BuildApplications VALUES (?,?,?,?,?) ON CONFLICT(entryId,playerKey) DO UPDATE SET uid=excluded.uid,fingerprint=excluded.fingerprint,payload=excluded.payload',
        [entry.id, playerKey, uid, fingerprint, JSON.stringify({ state, desired: value })]
      )
    if (found && matches(found)) {
      await record('applied', found, stringify(found)!)
      this.status = { entryId: entry.id, state: 'applied' }
      return { state: 'applied' }
    }
    if (
      found &&
      request.mode !== 'overwrite' &&
      (!mapping || mapping.fingerprint !== stringify(found))
    )
      throw new Error('conflict')
    if (stringify(await read()) !== stringify(collection)) throw new Error('conflict')
    const current = await this._notebooks.get(entry.id)
    if (current.revision !== entry.revision || current.deleted) throw new Error('conflict')
    if (selection) {
      const [rule] = await database.query(
        'SELECT enabled FROM BuildSyncRules WHERE entryId=? AND enabled=1',
        [entry.id]
      )
      if (!rule) throw new Error('Session changed')
    }
    assertCurrent()
    const data = {
      ...collection,
      itemSets: [...collection.itemSets.filter((s) => s.uid !== uid), desired]
    }
    await record('pending', desired, mapping?.fingerprint ?? '')
    assertCurrent()
    this.status = { entryId: entry.id, state: 'pending' }
    // shortcut: LCU cannot conditionally update collections; use ETags if its API adds support.
    await this._league.http.put(path, data, { timeout: 15000 })
    const confirmed = (await read()).itemSets.find((s) => s.uid === uid)
    if (!confirmed || !matches(confirmed)) return { state: 'pending' }
    await record('applied', confirmed, stringify(confirmed)!)
    this.status = { entryId: entry.id, state: 'applied' }
    return { state: 'applied' }
  }
  async dispose() {
    this._disposed = true
    this._disposer?.()
    await this._autoTask
    await this._running?.catch(() => {})
  }
}
