import type { LeagueClientMain } from '@main/shards/league-client'
import type { SgpMain } from '@main/shards/sgp'
import type { NotebookEntry } from '@shared/pro/notebook'
import {
  type LoadoutApply,
  type LoadoutContext,
  type LoadoutPart,
  type LoadoutStatus,
  type NotebookRunes,
  runesSchema,
  sameRunes,
  selectedLoadoutChampion,
  validRunes
} from '@shared/pro/notebook/loadout'
import { type IReactionDisposer, reaction } from 'mobx'

import type { BuildSyncController } from './build-sync-controller'
import type { NotebookController } from './notebook-controller'

export class LoadoutController {
  private _disposer?: IReactionDisposer
  private _timer?: ReturnType<typeof setTimeout>
  private _task: Promise<unknown> | null = null
  private _abort?: AbortController
  private _disposed = false
  private _generation = 0
  private _context: LoadoutContext | null = null
  private _entry: NotebookEntry | null = null
  private _parts: LoadoutStatus['parts'] = { runes: 'skipped', spells: 'skipped', items: 'skipped' }
  private _issue: LoadoutStatus['issue'] = null
  private _applying = false
  // Ownership is limited to pages created in this connection; never replace a user's rune page.
  private _runePage: { account: string; id: number; runes: NotebookRunes } | null = null

  constructor(
    private readonly _notebooks: NotebookController,
    private readonly _builds: BuildSyncController,
    private readonly _league: LeagueClientMain,
    private readonly _sgp: SgpMain,
    private readonly _warn: (error: unknown) => void
  ) {}

  private _current(): LoadoutContext | null {
    const league = this._league,
      session = league.data.champSelect.session
    if (
      !league.state.isConnected ||
      !league.data.summoner.me ||
      league.data.gameflow.phase !== 'ChampSelect'
    )
      return null
    const selected = selectedLoadoutChampion(session)
    const mapId = league.data.gameflow.session?.map.id
    if (!selected || !mapId) return null
    return {
      ...selected,
      mapId,
      key: JSON.stringify([
        league.state.auth?.pid,
        this._sgp.state.availability.sgpServerId,
        league.data.summoner.me.puuid,
        session!.id,
        session!.gameId,
        selected,
        mapId
      ])
    }
  }

  private _reconcile() {
    const next = this._current(),
      previous = this._context
    if (next?.key === previous?.key) return
    this._generation++
    this._abort?.abort()
    this._context = next
    // Keep the applied plan on a role swap so its mismatch can be explained.
    const sameSession =
      next &&
      previous &&
      next.championId === previous.championId &&
      next.mapId === previous.mapId &&
      JSON.parse(next.key).slice(0, 5).join('|') === JSON.parse(previous.key).slice(0, 5).join('|')
    if (!sameSession) {
      this._entry = null
      this._parts = { runes: 'skipped', spells: 'skipped', items: 'skipped' }
      this._issue = null
    } else {
      this._issue =
        this._entry?.content.position && this._entry.content.position !== next.position
          ? 'position'
          : null
    }
  }

  status(): LoadoutStatus {
    this._reconcile()
    return {
      context: this._context,
      entryId: this._entry?.id ?? null,
      title: this._entry?.content.title ?? '',
      busy: this._applying,
      parts: { ...this._parts },
      issue: this._issue
    }
  }

  start() {
    this._disposer = reaction(
      () => this._current()?.key,
      () => this._reconcile(),
      { fireImmediately: true }
    )
    const poll = async () => {
      try {
        await this.check()
      } catch (error) {
        if (!this._disposed) this._warn(error)
      }
      if (!this._disposed) this._timer = setTimeout(poll, 3000)
    }
    void poll()
  }

  private _guard() {
    this._reconcile()
    const key = this._context?.key,
      generation = this._generation
    if (!key || this._disposed) throw new Error('Client unavailable')
    return () => {
      this._reconcile()
      if (this._disposed || this._context?.key !== key || this._generation !== generation)
        throw new Error('Session changed')
    }
  }

  async captureRunes() {
    const identity = JSON.stringify([
      this._league.state.auth?.pid,
      this._league.data.summoner.me?.puuid,
      this._sgp.state.availability.sgpServerId
    ])
    if (!this._league.state.isConnected) throw new Error('Client unavailable')
    const pages = (
      await this._league.api.perks.getPerkPages({ signal: AbortSignal.timeout(10000) })
    ).data
    if (
      this._disposed ||
      !this._league.state.isConnected ||
      identity !==
        JSON.stringify([
          this._league.state.auth?.pid,
          this._league.data.summoner.me?.puuid,
          this._sgp.state.availability.sgpServerId
        ])
    )
      throw new Error('Session changed')
    const page = pages.find((p) => p.current && p.isValid)
    const runes = runesSchema.parse(page)
    if (!validRunes(runes, this._league.data.gameData.perkstyles.styles))
      throw new Error('Invalid runes')
    return runes
  }

  apply(request: LoadoutApply): Promise<LoadoutStatus> {
    if (this._applying || this._disposed) return Promise.reject(new Error('busy'))
    this._applying = true
    const pending = this._task
    const task = (async () => {
      await pending
      const guard = this._guard()
      if (request.contextKey !== this._context!.key) throw new Error('Session changed')
      const entry = await this._notebooks.get(request.entryId)
      guard()
      const context = this._context!
      if (entry.deleted || entry.revision !== request.expectedRevision) throw new Error('conflict')
      if (
        entry.content.kind !== 'build' ||
        entry.content.championId !== context.championId ||
        (entry.content.mapId ?? 11) !== context.mapId ||
        (entry.content.position && entry.content.position !== context.position)
      )
        throw new Error('Selection mismatch')
      this._entry = entry
      this._issue = null
      this._parts = {
        runes: entry.content.runes ? 'pending' : 'skipped',
        spells: entry.content.spells ? 'pending' : 'skipped',
        items: entry.content.groups.some((g) => g.items.length) ? 'pending' : 'skipped'
      }
      this._abort = new AbortController()
      const options = () => ({
        signal: AbortSignal.any([this._abort!.signal, AbortSignal.timeout(15000)])
      })
      const assertEntry = async () => {
        guard()
        const latest = await this._notebooks.get(entry.id)
        guard()
        if (latest.deleted || latest.revision !== entry.revision) {
          this._issue = 'changed'
          throw new Error('Notebook entry changed')
        }
      }
      for (const part of ['items', 'runes', 'spells'] as const) {
        if (this._parts[part] === 'skipped') continue
        try {
          await assertEntry()
          if (part === 'items') {
            const result = await this._builds.apply(request, undefined, guard)
            guard()
            this._parts.items = result.state === 'applied' ? 'matched' : 'pending'
          } else if (part === 'runes') {
            const runes = entry.content.runes!
            if (!validRunes(runes, this._league.data.gameData.perkstyles.styles)) {
              this._parts.runes = 'invalid'
              continue
            }
            const pages = (await this._league.api.perks.getPerkPages(options())).data
            guard()
            let page = pages.find((p) => p.isValid && sameRunes(p, runes))
            if (!page) {
              const account = JSON.stringify([
                this._league.state.auth?.pid,
                this._league.data.summoner.me?.puuid,
                this._sgp.state.availability.sgpServerId
              ])
              page =
                this._runePage?.account === account
                  ? pages.find(
                      (p) =>
                        p.id === this._runePage!.id &&
                        p.isEditable &&
                        p.name === 'League Akari Pro' &&
                        sameRunes(p, this._runePage!.runes)
                    )
                  : undefined
              if (!page) {
                const inventory = (await this._league.api.perks.getPerkInventory(options())).data
                guard()
                if (!inventory.canAddCustomPage) {
                  this._parts.runes = 'noSpace'
                  continue
                }
                await assertEntry()
                page = (
                  await this._league.api.perks.postPerkPage(
                    {
                      name: 'League Akari Pro',
                      isEditable: true,
                      primaryStyleId: String(runes.primaryStyleId)
                    },
                    options()
                  )
                ).data
                guard()
                this._runePage = {
                  account,
                  id: page.id,
                  runes: {
                    primaryStyleId: page.primaryStyleId,
                    subStyleId: page.subStyleId,
                    selectedPerkIds: page.selectedPerkIds
                  }
                }
              }
              await assertEntry()
              await this._league.api.perks.putPage(
                {
                  id: page.id,
                  name: 'League Akari Pro',
                  isTemporary: false,
                  isRecommendationOverride: false,
                  ...runes
                },
                options()
              )
              guard()
              this._runePage = { account, id: page.id, runes }
            }
            await assertEntry()
            await this._league.api.perks.putCurrentPage(page.id, options())
            guard()
          } else {
            const spells = entry.content.spells!,
              data = this._league.data.gameData.summonerSpells
            const mode = this._league.data.gameflow.session?.map.gameMode
            const level = this._league.data.summoner.me!.summonerLevel
            if (
              ![spells.spell1Id, spells.spell2Id].every(
                (id) =>
                  data[id] &&
                  mode &&
                  data[id].gameModes.includes(mode) &&
                  level >= data[id].summonerLevel
              )
            ) {
              this._parts.spells = 'invalid'
              continue
            }
            await this._league.api.champSelect.setSummonerSpells(spells, options())
            guard()
          }
        } catch (error) {
          guard()
          if (this._issue === 'changed') break
          this._parts[part] = /conflict/.test(String(error)) ? 'conflict' : 'failed'
          this._warn(error)
        }
      }
      await this._verify(entry, guard)
      this._applying = false
      return this.status()
    })().finally(() => {
      this._applying = false
      if (this._task === task) this._task = null
    })
    this._task = task
    return task
  }

  check(): Promise<void> {
    this._reconcile()
    if (this._task || this._disposed || !this._entry || !this._context) return Promise.resolve()
    const entry = this._entry,
      guard = this._guard()
    const task = this._verify(entry, guard)
      .catch((error) => {
        // A context change invalidates this read; the next poll checks the new context.
        if (this._entry === entry && this._context && !this._disposed) this._warn(error)
      })
      .finally(() => {
        if (this._task === task) this._task = null
      })
    this._task = task
    return task
  }

  private async _verify(entry: NotebookEntry, guard: () => void) {
    guard()
    const latest = await this._notebooks.get(entry.id)
    guard()
    if (latest.deleted || latest.revision !== entry.revision) {
      this._issue = 'changed'
      return
    }
    this._issue =
      entry.content.position && entry.content.position !== this._context!.position
        ? 'position'
        : null
    const options = () => ({ signal: AbortSignal.timeout(10000) })
    for (const part of ['runes', 'spells', 'items'] as LoadoutPart[]) {
      if (this._parts[part] === 'skipped') continue
      try {
        guard()
        let matches: boolean
        if (part === 'runes') {
          const pages = (await this._league.api.perks.getPerkPages(options())).data
          matches = pages.some((p) => p.current && p.isValid && sameRunes(p, entry.content.runes!))
        } else if (part === 'spells') {
          const current = (await this._league.api.champSelect.getMySelections(options())).data
          matches =
            current.spell1Id === entry.content.spells!.spell1Id &&
            current.spell2Id === entry.content.spells!.spell2Id
        } else matches = await this._builds.check(entry, guard)
        guard()
        if (matches) this._parts[part] = 'matched'
        else if (!['conflict', 'noSpace', 'invalid', 'failed'].includes(this._parts[part]))
          this._parts[part] = 'mismatch'
      } catch (error) {
        guard()
        this._parts[part] = 'failed'
        this._warn(error)
      }
    }
  }

  async dispose() {
    this._disposed = true
    this._abort?.abort()
    this._disposer?.()
    clearTimeout(this._timer)
    await this._task?.catch(() => {})
  }
}
