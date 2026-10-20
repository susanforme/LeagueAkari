import type { AkariIpcMain } from '@main/shards/ipc'
import { playerSchema } from '@shared/pro/champion-pool'
import {
  EXPERIENCE_NAMESPACE,
  preferencesSchema,
  sceneSchema,
  shareSchema,
  sharedGamesSchema,
  workspaceSchema
} from '@shared/pro/experience'
import { clipboard, dialog, nativeImage } from 'electron'
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'

import type { ExperienceController } from './experience-controller'

export function registerExperienceHandlers(ipc: AkariIpcMain, controller: ExperienceController) {
  const keySchema = z.string().min(1).max(500)
  ipc.onCall(EXPERIENCE_NAMESPACE, 'dismissReminder', (_, id) =>
    controller.dismissReminder(keySchema.parse(id))
  )
  ipc.onCall(EXPERIENCE_NAMESPACE, 'status', () => controller.status())
  ipc.onCall(EXPERIENCE_NAMESPACE, 'search', (_, input) => {
    const value = z
      .object({
        text: z.string().trim().max(100),
        champions: z.array(z.number().int().positive()).max(200)
      })
      .parse(input)
    return controller.search(value.text, value.champions)
  })
  ipc.onCall(EXPERIENCE_NAMESPACE, 'preferences', (_, value) =>
    controller.preferences(preferencesSchema.parse(value))
  )
  ipc.onCall(EXPERIENCE_NAMESPACE, 'workspace', (_, key) =>
    controller.workspace(keySchema.parse(key))
  )
  ipc.onCall(EXPERIENCE_NAMESPACE, 'saveWorkspace', (_, input) => {
    const value = z.object({ key: keySchema, workspace: workspaceSchema }).parse(input)
    return controller.saveWorkspace(value.key, value.workspace)
  })
  ipc.onCall(EXPERIENCE_NAMESPACE, 'scenes', () => controller.scenes())
  ipc.onCall(EXPERIENCE_NAMESPACE, 'saveScene', (_, value) =>
    controller.saveScene(sceneSchema.parse(value))
  )
  ipc.onCall(EXPERIENCE_NAMESPACE, 'deleteScene', (_, name) =>
    controller.deleteScene(sceneSchema.shape.name.parse(name))
  )
  ipc.onCall(EXPERIENCE_NAMESPACE, 'applyScene', (_, name) =>
    controller.applyScene(sceneSchema.shape.name.parse(name))
  )
  ipc.onCall(EXPERIENCE_NAMESPACE, 'archive', () => controller.archive())
  ipc.onCall(EXPERIENCE_NAMESPACE, 'social', (_, player) =>
    controller.social(playerSchema.parse(player))
  )
  ipc.onCall(EXPERIENCE_NAMESPACE, 'games', (_, input) => {
    const query = sharedGamesSchema.parse(input)
    return controller.games(query, query.gameIds)
  })
  ipc.onCall(EXPERIENCE_NAMESPACE, 'share', async (_, input) => {
    const { png, action } = shareSchema.parse(input)
    const image = nativeImage.createFromDataURL(png)
    if (image.isEmpty() || image.getSize().width > 4096 || image.getSize().height > 4096)
      throw new Error('Invalid image')
    if (action === 'copy') {
      clipboard.writeImage(image)
      return true
    }
    const result = await dialog.showSaveDialog({
      defaultPath: `akari-${Date.now()}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }]
    })
    if (result.canceled || !result.filePath) return false
    if (!result.filePath.toLowerCase().endsWith('.png')) throw new Error('Choose a PNG file')
    await writeFile(result.filePath, image.toPNG())
    return true
  })
}
