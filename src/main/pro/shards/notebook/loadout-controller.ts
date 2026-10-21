import type { LeagueClientMain } from '@main/shards/league-client'
import type { SgpMain } from '@main/shards/sgp'
import type { NotebookEntry } from '@shared/pro/notebook'
import {
  type CapturedLoadout,
  type LoadoutApply,
  type LoadoutContext,
  type LoadoutPart,
  type LoadoutPreferences,
  type LoadoutStatus,
  arrangeFlash,
  runesSchema,
  sameRunes,
  selectedLoadoutChampion,
  spellsSchema,
  validRunes
} from '@shared/pro/notebook/loadout'
import { type IReactionDisposer, reaction } from 'mobx'

import type { BuildSyncController } from './build-sync-controller'
import type { LoadoutPreferencesController } from './loadout-preferences-controller'
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
  private _details: LoadoutStatus['details'] = {}
  private _flash: LoadoutStatus['flash'] = null

  constructor(
    private readonly _notebooks: NotebookController,
    private readonly _builds: BuildSyncController,
    private readonly _league: LeagueClientMain,
    private readonly _sgp: SgpMain,
    private readonly _warn: (error: unknown) => void,
    private readonly _preferences: LoadoutPreferencesController
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
      gameMode: league.data.gameflow.session?.map.gameMode ?? '',
      key: JSON.stringify([
        league.state.auth?.pid,
        this._sgp.state.availability.sgpServerId,
        league.data.summoner.me.puuid,
        session!.id,
        session!.gameId,
        selected,
        mapId,
        league.data.gameflow.session?.map.gameMode
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
    this._flash = null
    this._details = {}
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
      issue: this._issue,
      details: structuredClone(this._details),
      flash: this._flash,
      flashSlot: this._preferences.value.flashSlot
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

  preferences() {
    return { ...this._preferences.value }
  }
  async savePreferences(value: LoadoutPreferences) {
    const saved = await this._preferences.save(value)
    void this.check()
    return saved
  }
  private _choiceKey() {
    const context = this._context!
    return JSON.stringify([
      this._sgp.state.availability.sgpServerId,
      this._league.data.summoner.me!.puuid,
      context.championId,
      context.mapId,
      context.position,
      context.gameMode
    ])
  }
  async preferred(contextKey: string) {
    const guard = this._guard()
    if (this._context!.key !== contextKey) throw new Error('Session changed')
    const id = await this._preferences.choice(this._choiceKey())
    guard()
    if (!id) return null
    const entry = await this._notebooks.get(id)
    guard()
    const context = this._context!
    return !entry.deleted &&
      entry.content.kind === 'build' &&
      entry.content.championId === context.championId &&
      (entry.content.mapId ?? 11) === context.mapId &&
      (!entry.content.position || entry.content.position === context.position)
      ? entry
      : null
  }
  async capture(championId: number): Promise<CapturedLoadout> {
    const guard = this._guard(),
      context = this._context!
    if (context.championId !== championId || ![11, 12].includes(context.mapId))
      throw new Error('Selection mismatch')
    const [pages, selections, itemSets] = await Promise.all([
      this._league.api.perks.getPerkPages({ signal: AbortSignal.timeout(10000) }),
      this._league.api.champSelect.getMySelections({ signal: AbortSignal.timeout(10000) }),
      this._builds.capture(guard)
    ])
    guard()
    const page = runesSchema.safeParse(pages.data.find((p) => p.current && p.isValid))
    const spells = spellsSchema.safeParse(selections.data)
    return {
      context,
      runes:
        page.success && validRunes(page.data, this._league.data.gameData.perkstyles.styles)
          ? page.data
          : null,
      spells: spells.success ? spells.data : null,
      itemSets
    }
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
      const retry = request.retry === true
      if (
        retry &&
        (this._entry?.id !== entry.id || this._entry.revision !== entry.revision || this._issue)
      )
        throw new Error('Retry target changed')
      const retryParts = retry
        ? (['runes', 'spells', 'items'] as const).filter(
            (p) => !['matched', 'skipped'].includes(this._parts[p])
          )
        : null
      if (retry) await this._verify(entry, guard)
      guard()
      const preferences = this._preferences.value
      this._flash = null
      this._entry = entry
      this._issue = null
      if (!retry)
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
        if (preferences !== this._preferences.value) throw new Error('Preferences changed')
        const latest = await this._notebooks.get(entry.id)
        guard()
        if (latest.deleted || latest.revision !== entry.revision) {
          this._issue = 'changed'
          throw new Error('Notebook entry changed')
        }
      }
      for (const part of ['items', 'runes', 'spells'] as const) {
        if (
          this._parts[part] === 'skipped' ||
          (retryParts && (!retryParts.includes(part) || this._parts[part] === 'matched'))
        )
          continue
        this._parts[part] = 'pending'
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
              page = pages.find((p) => p.current && p.isEditable) ?? pages.find((p) => p.isEditable)
              if (!page) {
                this._parts.runes = 'noEditablePage'
                continue
              }
              await assertEntry()
              await this._league.api.perks.putPage(
                {
                  id: page.id,
                  name: page.name,
                  isTemporary: false,
                  isRecommendationOverride: false,
                  ...runes
                },
                options()
              )
              guard()
            }
            await assertEntry()
            await this._league.api.perks.putCurrentPage(page.id, options())
            guard()
          } else {
            const spells = arrangeFlash(entry.content.spells!, preferences.flashSlot),
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
      guard()
      if (
        !this._issue &&
        Object.values(this._parts).some((state) => state === 'matched') &&
        Object.values(this._parts).every((state) => state === 'matched' || state === 'skipped')
      ) {
        await this._preferences.remember(this._choiceKey(), entry.id)
        guard()
      }
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
    if (this._task || this._disposed || !this._context) return Promise.resolve()
    const entry = this._entry,
      guard = this._guard()
    const task = (async () => {
      await this._checkFlash(guard)
      if (entry) await this._verify(entry, guard)
    })()
      .catch((error) => {
        if (this._entry === entry && this._context && !this._disposed) this._warn(error)
      })
      .finally(() => {
        if (this._task === task) this._task = null
      })
    this._task = task
    return task
  }

  private async _checkFlash(guard: () => void) {
    const preferences = this._preferences.value
    this._flash = null
    if (preferences.flashSlot === 'none') return
    try {
      const current = spellsSchema.parse(
        (await this._league.api.champSelect.getMySelections({ signal: AbortSignal.timeout(10000) }))
          .data
      )
      guard()
      if (preferences !== this._preferences.value) return
      if (current.spell1Id !== 4 && current.spell2Id !== 4) return
      const expected = arrangeFlash(current, preferences.flashSlot)
      this._flash = current.spell1Id === expected.spell1Id ? 'matched' : 'mismatch'
      if (this._flash !== 'mismatch' || !preferences.forceFlash) return
      // Re-read immediately before the swap to preserve a newly selected non-flash spell.
      const latest = spellsSchema.parse(
        (await this._league.api.champSelect.getMySelections({ signal: AbortSignal.timeout(10000) }))
          .data
      )
      guard()
      if (
        preferences !== this._preferences.value ||
        latest.spell1Id !== current.spell1Id ||
        latest.spell2Id !== current.spell2Id
      )
        return
      await this._league.api.champSelect.setSummonerSpells(expected, {
        signal: AbortSignal.timeout(10000)
      })
      guard()
      const confirmed = (
        await this._league.api.champSelect.getMySelections({ signal: AbortSignal.timeout(10000) })
      ).data
      guard()
      this._flash =
        confirmed.spell1Id === expected.spell1Id && confirmed.spell2Id === expected.spell2Id
          ? 'matched'
          : 'mismatch'
    } catch (error) {
      guard()
      this._flash = 'failed'
      this._warn(error)
    }
  }

  private async _verify(entry: NotebookEntry, guard: () => void) {
    guard()
    this._details = {}
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
          guard()
          const current = pages.find((p) => p.current && p.isValid)
          matches = !!current && sameRunes(current, entry.content.runes!)
          const parsed = runesSchema.safeParse(current)
          if (!matches)
            this._details.runes = {
              current: parsed.success ? parsed.data : null,
              expected: entry.content.runes!
            }
        } else if (part === 'spells') {
          const current = (await this._league.api.champSelect.getMySelections(options())).data
          guard()
          const expected = arrangeFlash(entry.content.spells!, this._preferences.value.flashSlot)
          matches = current.spell1Id === expected.spell1Id && current.spell2Id === expected.spell2Id
          if (!matches)
            this._details.spells = {
              current: { spell1Id: current.spell1Id, spell2Id: current.spell2Id },
              expected
            }
        } else {
          const differences = await this._builds.differences(entry, guard)
          guard()
          matches = !differences.length
          if (!matches) this._details.items = differences
        }
        guard()
        if (matches) this._parts[part] = 'matched'
        else if (!['conflict', 'noEditablePage', 'invalid', 'failed'].includes(this._parts[part]))
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
