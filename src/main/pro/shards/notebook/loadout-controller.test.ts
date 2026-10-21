import type { LeagueClientMain } from '@main/shards/league-client'
import type { SgpMain } from '@main/shards/sgp'
import { type NotebookEntry, blankContent } from '@shared/pro/notebook'
import {
  loadoutPreferencesSchema,
  runesSchema,
  spellsSchema,
  validRunes
} from '@shared/pro/notebook/loadout'
import type { PerkPage } from '@shared/types/league-client/perks'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { BuildSyncController } from './build-sync-controller'
import { LoadoutController } from './loadout-controller'
import type { LoadoutPreferencesController } from './loadout-preferences-controller'
import type { NotebookController } from './notebook-controller'

const runes = {
  primaryStyleId: 8000,
  subStyleId: 8100,
  selectedPerkIds: [1, 2, 3, 4, 5, 6, 7, 7, 8]
}
const styles = {
  8000: {
    allowedSubStyles: [8100],
    slots: [
      { type: 'kKeyStone', perks: [1] },
      ...[2, 3, 4].map((id) => ({ type: 'kMixedRegularSplashable', perks: [id] })),
      ...[7, 7, 8].map((id) => ({ type: 'kStatMod', perks: [id] }))
    ]
  },
  8100: {
    slots: [
      { type: 'kMixedRegularSplashable', perks: [5, 9] },
      { type: 'kMixedRegularSplashable', perks: [6] }
    ]
  }
}
let entry: NotebookEntry, controller: LoadoutController, league: LeagueClientMain
let preferences: LoadoutPreferencesController
let choices: Map<string, string>
let pages: PerkPage[], spells: { spell1Id: number; spell2Id: number }
const getEntry = vi.fn(),
  buildApply = vi.fn(),
  buildCheck = vi.fn(),
  getPages = vi.fn(),
  createPage = vi.fn(),
  putPage = vi.fn(),
  selectPage = vi.fn(),
  setSpells = vi.fn(),
  inventory = vi.fn(),
  getSelections = vi.fn(),
  captureItems = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  choices = new Map()
  preferences = {
    value: loadoutPreferencesSchema.parse({}),
    choice: async (key: string) => choices.get(key) ?? null,
    remember: async (key: string, id: string) => {
      choices.set(key, id)
    },
    save: async (value: unknown) => {
      preferences.value = loadoutPreferencesSchema.parse(value)
      return preferences.value
    }
  } as unknown as LoadoutPreferencesController
  captureItems.mockResolvedValue([])
  entry = {
    id: '00000000-0000-4000-8000-000000000001',
    revision: 1,
    deleted: false,
    updatedAt: 0,
    content: {
      ...blankContent(103, 'build'),
      title: 'Lane',
      position: 'MIDDLE',
      runes,
      spells: { spell1Id: 4, spell2Id: 12 },
      groups: [{ name: 'Start', items: [{ id: 1001, count: 1 }] }]
    }
  }
  pages = [
    {
      id: 42,
      name: 'Keep me',
      current: true,
      isEditable: true,
      isValid: true,
      primaryStyleId: 8200,
      subStyleId: 8100,
      selectedPerkIds: [10]
    } as PerkPage
  ]
  spells = { spell1Id: 12, spell2Id: 4 }
  getEntry.mockImplementation(async () => structuredClone(entry))
  buildApply.mockResolvedValue({ state: 'applied' })
  buildCheck.mockResolvedValue(true)
  getPages.mockImplementation(async () => ({ data: structuredClone(pages) }))
  inventory.mockResolvedValue({ data: { canAddCustomPage: true } })
  createPage.mockImplementation(async () => {
    const page = {
      id: 100,
      name: 'League Akari Pro',
      isEditable: true,
      selectedPerkIds: [],
      primaryStyleId: 8000,
      subStyleId: 0
    } as unknown as PerkPage
    pages.push(page)
    return { data: structuredClone(page) }
  })
  putPage.mockImplementation(async (page) => {
    Object.assign(
      pages.find((p) => p.id === page.id)!,
      structuredClone(page),
      { isValid: true }
    )
  })
  selectPage.mockImplementation(async (id) => {
    pages.forEach((p) => (p.current = p.id === id))
  })
  setSpells.mockImplementation(async (value) => {
    spells = value
  })
  getSelections.mockImplementation(async () => ({ data: { ...spells } }))
  league = {
    state: { isConnected: true, auth: { pid: 1 } },
    data: {
      summoner: { me: { puuid: 'player', summonerLevel: 30 } },
      gameflow: { phase: 'ChampSelect', session: { map: { id: 11, gameMode: 'CLASSIC' } } },
      champSelect: {
        session: {
          id: 'session',
          gameId: 1,
          localPlayerCellId: 0,
          isSpectating: false,
          myTeam: [{ cellId: 0, championId: 103, assignedPosition: 'middle' }]
        }
      },
      gameData: {
        perkstyles: { styles },
        summonerSpells: {
          4: { gameModes: ['CLASSIC'], summonerLevel: 1 },
          12: { gameModes: ['CLASSIC'], summonerLevel: 1 }
        }
      }
    },
    api: {
      perks: {
        getPerkPages: getPages,
        getPerkInventory: inventory,
        postPerkPage: createPage,
        putPage,
        putCurrentPage: selectPage
      },
      champSelect: { setSummonerSpells: setSpells, getMySelections: getSelections }
    }
  } as unknown as LeagueClientMain
  controller = new LoadoutController(
    { get: getEntry } as unknown as NotebookController,
    {
      apply: buildApply,
      differences: async () => ((await buildCheck()) ? [] : ['blocks']),
      capture: captureItems
    } as unknown as BuildSyncController,
    league,
    { state: { availability: { sgpServerId: 'EUW' } } } as SgpMain,
    () => {},
    preferences
  )
})
afterEach(async () => {
  await controller.dispose()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
const request = () => ({
  entryId: entry.id,
  expectedRevision: entry.revision,
  contextKey: controller.status().context!.key,
  mode: 'apply' as const
})

it('replaces the current editable rune page without creating pages, and reuses matching runes', async () => {
  const original = structuredClone(pages[0])
  await controller.apply(request())
  expect(controller.status().parts).toEqual({
    runes: 'matched',
    spells: 'matched',
    items: 'matched'
  })
  expect(pages[0]).toMatchObject({ id: original.id, name: original.name, current: true, ...runes })
  expect(spells).toEqual(entry.content.spells)
  await controller.apply(request())
  expect(createPage).not.toHaveBeenCalled()
  expect(putPage).toHaveBeenCalledTimes(1)
})

it('reports no editable page without creating one and still verifies the other parts', async () => {
  pages[0].isEditable = false
  await controller.apply(request())
  expect(controller.status().parts).toEqual({
    runes: 'noEditablePage',
    spells: 'matched',
    items: 'matched'
  })
  expect(putPage).not.toHaveBeenCalled()
  expect(createPage).not.toHaveBeenCalled()
})

it('reports partial failure and confirms a spell write that timed out after reaching the client', async () => {
  buildApply.mockRejectedValue(new Error('conflict'))
  buildCheck.mockResolvedValue(false)
  setSpells.mockImplementation(async (value) => {
    spells = value
    throw new Error('timeout')
  })
  await controller.apply(request())
  expect(controller.status().parts).toEqual({
    runes: 'matched',
    spells: 'matched',
    items: 'conflict'
  })
})

it.each(['account', 'champion', 'position', 'phase'] as const)(
  'stops later writes when %s changes during an operation',
  async (change) => {
    buildApply.mockImplementation(async (_request, _selection, guard) => {
      if (change === 'account') league.data.summoner.me!.puuid = 'other'
      if (change === 'champion') league.data.champSelect.session!.myTeam[0].championId = 64
      if (change === 'position')
        league.data.champSelect.session!.myTeam[0].assignedPosition = 'jungle'
      if (change === 'phase') league.data.gameflow.phase = 'GameStart'
      guard()
      return { state: 'applied' }
    })
    await expect(controller.apply(request())).rejects.toThrow('Session changed')
    expect(putPage).not.toHaveBeenCalled()
    expect(setSpells).not.toHaveBeenCalled()
    if (change !== 'position') expect(controller.status().entryId).toBeNull()
  }
)

it('detects changed spells, role swaps and changed notebook revisions without rewriting the client', async () => {
  await controller.apply(request())
  setSpells.mockClear()
  buildApply.mockClear()
  putPage.mockClear()
  spells = { spell1Id: 12, spell2Id: 4 }
  await controller.check()
  expect(controller.status().parts.spells).toBe('mismatch')
  league.data.champSelect.session!.myTeam[0].assignedPosition = 'jungle'
  await controller.check()
  expect(controller.status().issue).toBe('position')
  entry.revision++
  await controller.check()
  expect(controller.status().issue).toBe('changed')
  expect(setSpells).not.toHaveBeenCalled()
  expect(buildApply).not.toHaveBeenCalled()
  expect(putPage).not.toHaveBeenCalled()
})

it('rejects stale requests and invalid resource combinations before their writes', async () => {
  const stale = request()
  league.data.champSelect.session!.gameId++
  await expect(controller.apply(stale)).rejects.toThrow('Session changed')
  expect(buildApply).not.toHaveBeenCalled()
  entry.content.runes = { ...runes, selectedPerkIds: [1, 2, 3, 4, 5, 9, 7, 7, 8] }
  entry.content.spells = { spell1Id: 4, spell2Id: 99 }
  await controller.apply(request())
  expect(controller.status().parts).toEqual({
    runes: 'invalid',
    spells: 'invalid',
    items: 'matched'
  })
  expect(putPage).not.toHaveBeenCalled()
  expect(setSpells).not.toHaveBeenCalled()
})

it('replaces an existing editable fallback when the current page is read-only', async () => {
  pages[0].isEditable = false
  pages.push({ ...pages[0], id: 43, current: false, isEditable: true, name: 'Fallback' })
  await controller.apply(request())
  expect(putPage.mock.calls[0][0]).toMatchObject({ id: 43, name: 'Fallback' })
  expect(pages[0].selectedPerkIds).toEqual([10])
  expect(createPage).not.toHaveBeenCalled()
})

it('accepts repeated stat shards but rejects incomplete runes and duplicate spells at the boundary', () => {
  expect(runesSchema.parse(runes)).toEqual(runes)
  expect(validRunes(runes, league.data.gameData.perkstyles.styles)).toBe(true)
  expect(runesSchema.safeParse({ ...runes, selectedPerkIds: [1] }).success).toBe(false)
  expect(spellsSchema.safeParse({ spell1Id: 4, spell2Id: 4 }).success).toBe(false)
})

it.each(['read', 'write'] as const)(
  'stops using an edited notebook during a rune %s',
  async (stage) => {
    if (stage === 'read')
      getPages.mockImplementationOnce(async () => {
        entry.revision++
        return { data: structuredClone(pages) }
      })
    else
      putPage.mockImplementationOnce(async () => {
        entry.revision++
      })
    await controller.apply(request())
    expect(controller.status().issue).toBe('changed')
    expect(selectPage).not.toHaveBeenCalled()
    expect(setSpells).not.toHaveBeenCalled()
    if (stage === 'read') expect(putPage).not.toHaveBeenCalled()
  }
)

it('gives runes and spells their own timeout after a slow item-set operation', async () => {
  vi.useFakeTimers()
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
    const abort = new AbortController()
    setTimeout(() => abort.abort(), delay)
    return abort.signal
  })
  buildApply.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 16000))
    return { state: 'applied' }
  })
  getPages.mockImplementation(async ({ signal }) => {
    signal.throwIfAborted()
    return { data: structuredClone(pages) }
  })
  const task = controller.apply(request())
  await vi.advanceTimersByTimeAsync(16000)
  await task
  expect(controller.status().parts).toEqual({
    runes: 'matched',
    spells: 'matched',
    items: 'matched'
  })
})

it('retries only unsuccessful parts, and skips a failed write already confirmed by readback', async () => {
  setSpells.mockRejectedValue(new Error('offline'))
  await controller.apply(request())
  expect(controller.status().parts.spells).toBe('failed')
  buildApply.mockClear()
  putPage.mockClear()
  selectPage.mockClear()
  setSpells.mockImplementation(async (value) => {
    spells = value
  })
  await controller.apply({ ...request(), retry: true })
  expect(controller.status().parts.spells).toBe('matched')
  expect(buildApply).not.toHaveBeenCalled()
  expect(putPage).not.toHaveBeenCalled()
  expect(selectPage).not.toHaveBeenCalled()
  expect(setSpells).toHaveBeenCalledTimes(2)
  await controller.apply({ ...request(), retry: true })
  expect(setSpells).toHaveBeenCalledTimes(2)
})

it('reports exact spell and rune differences without changing an applied plan', async () => {
  await controller.apply(request())
  spells = { spell1Id: 12, spell2Id: 4 }
  pages[0].selectedPerkIds[0] = 999
  buildCheck.mockResolvedValue(false)
  await controller.check()
  expect(controller.status().details).toMatchObject({
    spells: { current: spells, expected: entry.content.spells },
    runes: {
      current: { selectedPerkIds: [999, ...runes.selectedPerkIds.slice(1)] },
      expected: runes
    },
    items: ['blocks']
  })
})

it('remembers only successful plans and separates choices by champion, role, mode and account', async () => {
  buildCheck.mockResolvedValue(false)
  await controller.apply(request())
  expect(choices.size).toBe(0)
  buildCheck.mockResolvedValue(true)
  await controller.apply(request())
  expect((await controller.preferred(controller.status().context!.key))?.id).toBe(entry.id)
  for (const change of [
    () => {
      league.data.summoner.me!.puuid = 'other'
    },
    () => {
      league.data.champSelect.session!.myTeam[0].assignedPosition = 'jungle'
    },
    () => {
      league.data.champSelect.session!.myTeam[0].championId = 64
    },
    () => {
      league.data.gameflow.session!.map.gameMode = 'ARAM'
    }
  ]) {
    change()
    expect(await controller.preferred(controller.status().context!.key)).toBeNull()
  }
})

it.each(['D', 'F'] as const)(
  'applies the preferred %s Flash slot and enforces it only when enabled',
  async (slot) => {
    preferences.value = { flashSlot: slot, forceFlash: false }
    await controller.apply(request())
    expect(spells[slot === 'D' ? 'spell1Id' : 'spell2Id']).toBe(4)
    spells = slot === 'D' ? { spell1Id: 12, spell2Id: 4 } : { spell1Id: 4, spell2Id: 12 }
    setSpells.mockClear()
    await controller.check()
    expect(controller.status().flash).toBe('mismatch')
    expect(setSpells).not.toHaveBeenCalled()
    preferences.value = { flashSlot: slot, forceFlash: true }
    await controller.check()
    expect(controller.status().flash).toBe('matched')
    expect(setSpells).toHaveBeenCalledTimes(1)
    await controller.check()
    expect(setSpells).toHaveBeenCalledTimes(1)
  }
)

it('enforces Flash without an applied plan, preserves the other spell, and never inserts Flash', async () => {
  preferences.value = { flashSlot: 'D', forceFlash: true }
  await controller.check()
  expect(spells).toEqual({ spell1Id: 4, spell2Id: 12 })
  setSpells.mockClear()
  spells = { spell1Id: 11, spell2Id: 12 }
  await controller.check()
  expect(setSpells).not.toHaveBeenCalled()
  expect(controller.status().flash).toBeNull()
})

it('does not force a stale spell pair or write after leaving champion select', async () => {
  preferences.value = { flashSlot: 'D', forceFlash: true }
  getSelections
    .mockImplementationOnce(async () => ({ data: { spell1Id: 12, spell2Id: 4 } }))
    .mockImplementationOnce(async () => ({ data: { spell1Id: 11, spell2Id: 4 } }))
  await controller.check()
  expect(setSpells).not.toHaveBeenCalled()
  getSelections.mockImplementationOnce(async () => {
    league.data.gameflow.phase = 'GameStart'
    return { data: spells }
  })
  await controller.check()
  expect(setSpells).not.toHaveBeenCalled()
})

it('captures a preview without writing and rejects snapshots from a changed selection', async () => {
  pages[0] = { ...pages[0], ...runes }
  captureItems.mockResolvedValue([{ uid: 'items', title: 'Build', groups: entry.content.groups }])
  const preview = await controller.capture(103)
  expect(preview).toMatchObject({ runes, spells, itemSets: [{ uid: 'items' }] })
  expect(putPage).not.toHaveBeenCalled()
  expect(setSpells).not.toHaveBeenCalled()
  await expect(controller.capture(64)).rejects.toThrow('Selection mismatch')
  captureItems.mockImplementation(async () => {
    league.data.summoner.me!.puuid = 'other'
    return []
  })
  await expect(controller.capture(103)).rejects.toThrow('Session changed')
})
