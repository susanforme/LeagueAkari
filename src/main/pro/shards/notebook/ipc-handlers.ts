import type { AkariIpcMain } from '@main/shards/ipc'
import { resourceLocaleSchema } from '@shared/pro/champion-pool'
import {
  NOTEBOOK_NAMESPACE,
  buildApplySchema,
  changeSchema,
  favoriteChampionSchema,
  historySchema,
  listSchema,
  practiceSchema,
  saveSchema,
  transferSchema
} from '@shared/pro/notebook'
import {
  championGuideSchema,
  practiceQuerySchema,
  savePracticePlanSchema,
  savePracticeSessionSchema,
  sessionQuerySchema
} from '@shared/pro/notebook/handbook'
import { loadoutApplySchema, loadoutPreferencesSchema } from '@shared/pro/notebook/loadout'
import { z } from 'zod'

import { BuildSyncController, clientItemSet } from './build-sync-controller'
import type { LoadoutController } from './loadout-controller'
import type { NotebookController } from './notebook-controller'
import type { PracticeController } from './practice-controller'
import type { NotebookResourceLoader } from './resource-loader'
import { MAX_NOTEBOOK_BYTES, readNotebookFile, saveNotebookFile } from './transfer-files'

export function registerNotebookHandlers(
  ipc: AkariIpcMain,
  controller: NotebookController,
  resources: NotebookResourceLoader,
  builds: BuildSyncController,
  loadouts: LoadoutController,
  practice: PracticeController
) {
  const changed = async <T>(operation: Promise<T>) => {
    const result = await operation
    ipc.sendEvent(NOTEBOOK_NAMESPACE, 'entries-changed')
    return result
  }
  ipc.onCall(NOTEBOOK_NAMESPACE, 'guide', (_, id) =>
    controller.guide(z.number().int().positive().parse(id))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'saveGuide', (_, value) =>
    changed(controller.saveGuide(championGuideSchema.parse(value)))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'practicePlans', (_, value) => {
    const q = practiceQuerySchema.parse(value)
    return practice.list(q.championId, q.page, q.search)
  })
  ipc.onCall(NOTEBOOK_NAMESPACE, 'practiceFromEntry', (_, id) =>
    changed(practice.fromEntry(z.string().uuid().parse(id)))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'practicePlan', (_, id) =>
    practice.get(z.string().uuid().parse(id))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'savePracticePlan', (_, value) =>
    changed(practice.save(savePracticePlanSchema.parse(value)))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'recordPractice', (_, value) =>
    changed(practice.record(savePracticeSessionSchema.parse(value)))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'practiceSessions', (_, value) => {
    const q = sessionQuerySchema.parse(value)
    return practice.sessions(q.planId, q.days, q.page)
  })
  ipc.onCall(NOTEBOOK_NAMESPACE, 'runes', (_, locale) =>
    resources.runes(resourceLocaleSchema.parse(locale))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'positions', (_, locale) =>
    resources.positions(resourceLocaleSchema.parse(locale))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'championInfo', (_, value) => {
    const q = z
      .object({
        locale: resourceLocaleSchema,
        championId: z.number().int().positive().max(1000000)
      })
      .parse(value)
    return resources.championInfo(q.locale, q.championId)
  })
  ipc.onCall(NOTEBOOK_NAMESPACE, 'loadoutPreferences', () => loadouts.preferences())
  ipc.onCall(NOTEBOOK_NAMESPACE, 'saveLoadoutPreferences', (_, value) =>
    loadouts.savePreferences(loadoutPreferencesSchema.parse(value))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'preferredLoadout', (_, key) =>
    loadouts.preferred(z.string().min(1).max(2000).parse(key))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'captureLoadout', (_, championId) =>
    loadouts.capture(z.number().int().positive().parse(championId))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'captureRunes', () => loadouts.captureRunes())
  ipc.onCall(NOTEBOOK_NAMESPACE, 'loadoutStatus', () => loadouts.status())
  ipc.onCall(NOTEBOOK_NAMESPACE, 'applyLoadout', (_, request) =>
    loadouts.apply(loadoutApplySchema.parse(request))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'get', (_, id) => controller.get(z.string().uuid().parse(id)))
  ipc.onCall(NOTEBOOK_NAMESPACE, 'practices', (_, id) =>
    controller.practices(z.number().int().positive().nullable().parse(id))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'savePractice', (_, request) =>
    controller.savePractice(practiceSchema.parse(request))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'readImport', () => readNotebookFile())
  ipc.onCall(NOTEBOOK_NAMESPACE, 'exportFile', async (_, championId) =>
    saveNotebookFile(
      await controller.exportBundle(z.number().int().positive().nullable().parse(championId)),
      'akari-notebook.json'
    )
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'transfer', async (_, request) => {
    if (Buffer.byteLength(JSON.stringify(request)) > MAX_NOTEBOOK_BYTES)
      throw new Error('File too large')
    const value = transferSchema.parse(request),
      result = await controller.transfer(value)
    if (value.commit) ipc.sendEvent(NOTEBOOK_NAMESPACE, 'entries-changed')
    return result
  })
  ipc.onCall(NOTEBOOK_NAMESPACE, 'exportBuild', async (_, id) =>
    saveNotebookFile(
      clientItemSet(await controller.get(z.string().uuid().parse(id)), crypto.randomUUID()),
      'akari-item-set.json'
    )
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'applyBuild', (_, request) =>
    builds.apply(buildApplySchema.parse(request))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'buildRule', (_, id) => builds.rule(z.string().uuid().parse(id)))
  ipc.onCall(NOTEBOOK_NAMESPACE, 'setBuildRule', (_, request) => {
    const value = z.object({ entryId: z.string().uuid(), enabled: z.boolean() }).parse(request)
    return builds.setRule(value.entryId, value.enabled)
  })
  ipc.onCall(NOTEBOOK_NAMESPACE, 'home', () => controller.home())
  ipc.onCall(NOTEBOOK_NAMESPACE, 'favoriteChampion', async (_, request) => {
    const value = favoriteChampionSchema.parse(request)
    await controller.favoriteChampion(value.championId, value.favorite)
    ipc.sendEvent(NOTEBOOK_NAMESPACE, 'entries-changed')
  })
  ipc.onCall(NOTEBOOK_NAMESPACE, 'champions', () => controller.champions())
  ipc.onCall(NOTEBOOK_NAMESPACE, 'list', (_, query) => controller.list(listSchema.parse(query)))
  ipc.onCall(NOTEBOOK_NAMESPACE, 'save', (_, query) => controller.save(saveSchema.parse(query)))
  ipc.onCall(NOTEBOOK_NAMESPACE, 'change', (_, query) =>
    controller.change(changeSchema.parse(query))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'history', (_, query) => {
    const request = historySchema.parse(query)
    return controller.history(request.id, request.page)
  })
  ipc.onCall(NOTEBOOK_NAMESPACE, 'catalog', (_, locale) =>
    resources.catalog(resourceLocaleSchema.parse(locale))
  )
  ipc.onCall(NOTEBOOK_NAMESPACE, 'skills', (_, query) => {
    const request = z
      .object({
        locale: resourceLocaleSchema,
        championId: z.number().int().positive().max(1_000_000)
      })
      .parse(query)
    return resources.skills(request.locale, request.championId)
  })
}
