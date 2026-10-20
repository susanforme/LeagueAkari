import { observable, runInAction } from 'mobx'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeMatch } from '../champion-pool/normalization'
import { sgpSummary } from '../champion-pool/test-fixtures'
import { initializeProDatabase } from '../storage/database-lifecycle'
import { type ExperienceContext, ExperienceController } from './experience-controller'

describe.runIf(!!process.versions.electron)('experience persistence and presets', () => {
  let database: DataSource, controller: ExperienceController, context: ExperienceContext
  const settings = vi.fn()
  beforeEach(async () => {
    database = new DataSource({ type: 'better-sqlite3', database: ':memory:' })
    await initializeProDatabase(database)
    settings.mockReset()
    context = {
      storage: { dataSource: database, status: 'ready' },
      leagueClient: {
        state: { isConnected: false },
        data: { summoner: { me: null } },
        events: { on: () => () => {} }
      },
      sgp: { state: { availability: { sgpServerId: 'EUW1' }, isTokenReady: false } },
      settings: { setSetting: settings, getSetting: vi.fn() },
      gameflow: {
        settings: {
          autoAcceptEnabled: false,
          autoHonorEnabled: false,
          playAgainEnabled: false,
          autoMatchmakingEnabled: false
        }
      },
      windows: {
        auxWindow: { settings: { autoShow: false }, show: vi.fn(), hide: vi.fn() },
        opggWindow: { settings: { autoShow: false }, show: vi.fn(), hide: vi.fn() }
      },
      pool: { archive: vi.fn() },
      logger: { warn: vi.fn() }
    } as unknown as ExperienceContext
    controller = new ExperienceController(context)
    await controller.start()
  })
  afterEach(async () => {
    await controller.dispose()
    await database.destroy()
    vi.useRealTimers()
  })
  it('isolates account workspaces and respects opt-out without deleting saved context', async () => {
    await controller.saveWorkspace('EUW:a', {
      route: 'pro-review',
      query: { id: 'one' },
      pages: {}
    })
    await controller.saveWorkspace('NA:a', { route: 'pro-profile', query: {}, pages: {} })
    expect((await controller.workspace('EUW:a'))?.query).toEqual({ id: 'one' })
    expect(await controller.workspace('EUW:b')).toBeNull()
    await controller.preferences({ restore: false, archive: false })
    await controller.saveWorkspace('EUW:a', { route: 'pro-profile', query: {}, pages: {} })
    expect(await controller.workspace('EUW:a')).toBeNull()
    await controller.preferences({ restore: true, archive: false })
    expect((await controller.workspace('EUW:a'))?.route).toBe('pro-review')
  })
  it('applies only registered settings and compensates when a write fails', async () => {
    const values = {
      autoAccept: true,
      autoHonor: true,
      playAgain: false,
      autoMatchmaking: false,
      auxWindow: true,
      opggWindow: false
    }
    await controller.saveScene({ name: 'Ranked', values })
    settings.mockRejectedValueOnce(new Error('disk full'))
    await expect(controller.applyScene('Ranked')).rejects.toThrow('disk full')
    expect(settings).toHaveBeenCalledWith('auto-gameflow-main', 'autoAcceptEnabled', false)
    expect((await controller.status()).scene).toBeNull()
    settings.mockClear()
    await controller.applyScene('Ranked')
    expect(settings).toHaveBeenCalledWith('window-manager-main/aux-window', 'autoShow', true)
    expect(context.windows.auxWindow.show).toHaveBeenCalledOnce()
    await controller.deleteScene('Ranked')
    expect(await controller.scenes()).toEqual([])
  })
  it('keeps search values parameterized and excludes deleted notes', async () => {
    await database.query(
      `INSERT INTO NotebookEntries VALUES ('note',103,'note','Flash combo','',0,NULL,1,0,'{}',1)`
    )
    expect((await controller.search('Flash', [])).notes).toHaveLength(1)
    expect((await controller.search("' OR 1=1 --", [])).notes).toEqual([])
    await database.query('UPDATE NotebookEntries SET deleted=1')
    expect((await controller.search('', [])).notes).toEqual([])
  })
  it('archives after connection and retries a delayed settlement, respecting opt-out', async () => {
    await controller.dispose()
    vi.useFakeTimers()
    const events = new Map<string, (event: { data: string }) => void>()
    const league = observable({
      state: { isConnected: false },
      data: {
        summoner: { me: { puuid: 'player', gameName: 'Name', tagLine: 'Tag' } },
        gameflow: { session: { gameData: { gameId: 123 } } }
      },
      events: {
        on: (name: string, listener: (event: { data: string }) => void) => {
          events.set(name, listener)
          return () => events.delete(name)
        }
      }
    })
    context.leagueClient = league as unknown as ExperienceContext['leagueClient']
    const archive = vi.fn().mockResolvedValue(undefined)
    const match = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ gameId: 123 })
    context.pool = { archive, match } as unknown as ExperienceContext['pool']
    controller = new ExperienceController(context)
    await controller.start()
    runInAction(() => {
      league.state.isConnected = true
    })
    await vi.advanceTimersByTimeAsync(5000)
    expect(archive).toHaveBeenCalledOnce()
    events.get('/lol-gameflow/v1/gameflow-phase')!({ data: 'EndOfGame' })
    await vi.advanceTimersByTimeAsync(5000)
    expect(archive).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(15000)
    expect(archive).toHaveBeenCalledTimes(3)
    expect(match).toHaveBeenCalledTimes(2)
    await controller.preferences({ restore: true, archive: false })
    events.get('/lol-gameflow/v1/gameflow-phase')!({ data: 'EndOfGame' })
    await vi.advanceTimersByTimeAsync(30000)
    expect(archive).toHaveBeenCalledTimes(3)
  })
  async function enableReminders() {
    await controller.preferences({
      restore: true,
      archive: false,
      reminder: { enabled: true, games: 1, minutes: 0, losses: 0 }
    })
    await controller.dispose()
    vi.useFakeTimers()
    const listeners = new Map<string, (event: { data: string }) => void>()
    const league = observable({
      state: { isConnected: true },
      data: {
        summoner: { me: { puuid: 'player', gameName: 'Name', tagLine: 'Tag' } },
        gameflow: { phase: 'EndOfGame', session: { gameData: { gameId: 123 } } }
      },
      events: {
        on: (name: string, fn: (event: { data: string }) => void) => {
          listeners.set(name, fn)
          return () => listeners.delete(name)
        }
      }
    })
    context.leagueClient = league as unknown as ExperienceContext['leagueClient']
    const summary = sgpSummary(123)
    summary.data.json.gameCreation = Date.now() - 1200000
    await database.query('INSERT INTO PoolMatches VALUES (?,?,?,?,?,?)', [
      'EUW1',
      'player',
      123,
      summary.data.json.gameCreation,
      JSON.stringify(normalizeMatch(summary, 'player')),
      JSON.stringify(summary)
    ])
    context.pool = {
      archive: vi.fn().mockResolvedValue(undefined),
      match: vi.fn().mockResolvedValue(summary)
    } as unknown as ExperienceContext['pool']
    controller = new ExperienceController(context)
    await controller.start()
    return {
      league,
      settle: () => listeners.get('/lol-gameflow/v1/gameflow-phase')!({ data: 'EndOfGame' })
    }
  }
  it('persists thresholds, notifies only after settlement, and dismisses without repeat delivery', async () => {
    const { settle, league } = await enableReminders()
    await vi.advanceTimersByTimeAsync(5000)
    expect(context.pool.archive).not.toHaveBeenCalled()
    expect((await controller.status()).preferences.reminder.games).toBe(1)
    settle()
    await vi.advanceTimersByTimeAsync(5000)
    const reminder = (await controller.status()).reminder!
    expect(reminder).toMatchObject({ games: 1, reasons: ['games'] })
    runInAction(() => {
      league.data.gameflow.phase = 'InProgress'
    })
    expect((await controller.status()).reminder).toBeNull()
    runInAction(() => {
      league.data.gameflow.phase = 'EndOfGame'
    })
    controller.dismissReminder(reminder.id)
    settle()
    await vi.advanceTimersByTimeAsync(5000)
    expect((await controller.status()).reminder).toBeNull()
  })
  it.each(['archive', 'match'] as const)(
    'drops an in-flight %s after reconnecting to the same account',
    async (operation) => {
      const { settle, league } = await enableReminders()
      let finish!: () => void
      const pending = new Promise<null>((resolve) => {
        finish = () => resolve(null)
      })
      if (operation === 'archive')
        vi.mocked(context.pool.archive).mockImplementationOnce(async () => {
          await pending
        })
      else vi.mocked(context.pool.match).mockReturnValueOnce(pending)
      settle()
      await vi.advanceTimersByTimeAsync(5000)
      runInAction(() => {
        league.state.isConnected = false
      })
      runInAction(() => {
        league.state.isConnected = true
      })
      finish()
      await vi.advanceTimersByTimeAsync(1)
      expect((await controller.status()).reminder).toBeNull()
    }
  )
})
