import type { AkariIpcMain } from '@main/shards/ipc'
import { playerSchema } from '@shared/pro/champion-pool'
import {
  PROFILE_NAMESPACE,
  profileHistorySchema,
  profileMatchesSchema,
  profileTrendSchema
} from '@shared/pro/profile'

import type { ProfileController } from './profile-controller'

export function registerProfileHandlers(ipc: AkariIpcMain, controller: ProfileController) {
  ipc.onCall(PROFILE_NAMESPACE, 'status', () => controller.status())
  ipc.onCall(PROFILE_NAMESPACE, 'capture', () => controller.capture())
  ipc.onCall(PROFILE_NAMESPACE, 'players', () => controller.players())
  ipc.onCall(PROFILE_NAMESPACE, 'matches', (_, query) =>
    controller.matches(profileMatchesSchema.parse(query))
  )
  ipc.onCall(PROFILE_NAMESPACE, 'activity', (_, player) =>
    controller.activity(playerSchema.parse(player))
  )
  ipc.onCall(PROFILE_NAMESPACE, 'trend', (_, query) =>
    controller.trend(profileTrendSchema.parse(query))
  )
  ipc.onCall(PROFILE_NAMESPACE, 'history', (_, query) => {
    const request = profileHistorySchema.parse(query)
    return controller.history(request, request.page)
  })
}
