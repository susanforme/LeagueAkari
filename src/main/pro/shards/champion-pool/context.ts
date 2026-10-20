import type { AkariIpcMain } from '@main/shards/ipc'
import type { LeagueClientMain } from '@main/shards/league-client'
import type { AkariLogger } from '@main/shards/logger-factory'
import type { SgpMain } from '@main/shards/sgp'

import type { ProStorageMain } from '../storage'

export interface ChampionPoolContext {
  storage: ProStorageMain
  leagueClient: LeagueClientMain
  sgp: SgpMain
  ipc: AkariIpcMain
  logger: AkariLogger
}
