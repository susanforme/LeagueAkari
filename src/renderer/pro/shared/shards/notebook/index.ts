import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { Dep, Shard } from '@shared/akari-shard'
import type { ResourceLocale } from '@shared/pro/champion-pool'
import {
  type BuildApply,
  type ChangeNotebook,
  type HandbookHome,
  NOTEBOOK_NAMESPACE,
  type NotebookBundle,
  type NotebookCatalog,
  type NotebookChampionSummary,
  type NotebookEntry,
  type NotebookPage,
  type NotebookQuery,
  type NotebookSkills,
  type NotebookTransfer,
  type PracticeEntry,
  type SaveNotebook,
  type SavePractice,
  type TransferPreview,
  saveSchema
} from '@shared/pro/notebook'
import type {
  ChampionGuide,
  ChampionGuideInput,
  ChampionInfo,
  PracticePlan,
  PracticeSession,
  PracticeSessionPage,
  RuneCatalog,
  SavePracticePlan,
  SavePracticeSession
} from '@shared/pro/notebook/handbook'
import type {
  CapturedLoadout,
  LoadoutApply,
  LoadoutPreferences,
  LoadoutStatus,
  NotebookRunes
} from '@shared/pro/notebook/loadout'

@Shard(NotebookRenderer.id)
export class NotebookRenderer {
  static id = 'pro-notebook-renderer'
  constructor(@Dep(AkariIpcRenderer) private readonly _ipc: AkariIpcRenderer) {}
  runes(locale: ResourceLocale) {
    return this._ipc.call<RuneCatalog>(NOTEBOOK_NAMESPACE, 'runes', locale)
  }
  guide(id: number) {
    return this._ipc.call<ChampionGuide | null>(NOTEBOOK_NAMESPACE, 'guide', id)
  }
  saveGuide(value: ChampionGuideInput) {
    return this._ipc.call<void>(NOTEBOOK_NAMESPACE, 'saveGuide', value)
  }
  championInfo(locale: ResourceLocale, championId: number) {
    return this._ipc.call<ChampionInfo>(NOTEBOOK_NAMESPACE, 'championInfo', { locale, championId })
  }
  positions(locale: ResourceLocale) {
    return this._ipc.call<Record<string, string[]>>(NOTEBOOK_NAMESPACE, 'positions', locale)
  }
  practicePlans(championId: number | null, page = 1, search = '') {
    return this._ipc.call<{ items: PracticePlan[]; total: number }>(
      NOTEBOOK_NAMESPACE,
      'practicePlans',
      { championId, page, search }
    )
  }
  practiceFromEntry(id: string) {
    return this._ipc.call<PracticePlan>(NOTEBOOK_NAMESPACE, 'practiceFromEntry', id)
  }
  practicePlan(id: string) {
    return this._ipc.call<PracticePlan>(NOTEBOOK_NAMESPACE, 'practicePlan', id)
  }
  savePracticePlan(value: SavePracticePlan) {
    return this._ipc.call<PracticePlan>(NOTEBOOK_NAMESPACE, 'savePracticePlan', value)
  }
  recordPractice(value: SavePracticeSession) {
    return this._ipc.call<PracticeSession>(NOTEBOOK_NAMESPACE, 'recordPractice', value)
  }
  practiceSessions(planId: string, days = 30, page = 1) {
    return this._ipc.call<PracticeSessionPage>(NOTEBOOK_NAMESPACE, 'practiceSessions', {
      planId,
      days,
      page
    })
  }
  loadoutPreferences() {
    return this._ipc.call<LoadoutPreferences>(NOTEBOOK_NAMESPACE, 'loadoutPreferences')
  }
  saveLoadoutPreferences(value: LoadoutPreferences) {
    return this._ipc.call<LoadoutPreferences>(NOTEBOOK_NAMESPACE, 'saveLoadoutPreferences', value)
  }
  preferredLoadout(key: string) {
    return this._ipc.call<NotebookEntry | null>(NOTEBOOK_NAMESPACE, 'preferredLoadout', key)
  }
  captureLoadout(championId: number) {
    return this._ipc.call<CapturedLoadout>(NOTEBOOK_NAMESPACE, 'captureLoadout', championId)
  }
  captureRunes() {
    return this._ipc.call<NotebookRunes>(NOTEBOOK_NAMESPACE, 'captureRunes')
  }
  loadoutStatus() {
    return this._ipc.call<LoadoutStatus>(NOTEBOOK_NAMESPACE, 'loadoutStatus')
  }
  applyLoadout(value: LoadoutApply) {
    return this._ipc.call<LoadoutStatus>(NOTEBOOK_NAMESPACE, 'applyLoadout', value)
  }
  onResourcesChanged(callback: (event: { key: string; failed: boolean }) => void) {
    return this._ipc.onEventVue(NOTEBOOK_NAMESPACE, 'resources-changed', callback)
  }
  onChanged(callback: () => void) {
    return this._ipc.onEventVue(NOTEBOOK_NAMESPACE, 'entries-changed', callback)
  }
  get(id: string) {
    return this._ipc.call<NotebookEntry>(NOTEBOOK_NAMESPACE, 'get', id)
  }
  practices(id: number | null) {
    return this._ipc.call<PracticeEntry[]>(NOTEBOOK_NAMESPACE, 'practices', id)
  }
  savePractice(value: SavePractice) {
    return this._ipc.call<void>(NOTEBOOK_NAMESPACE, 'savePractice', value)
  }
  readImport() {
    return this._ipc.call<NotebookBundle | null>(NOTEBOOK_NAMESPACE, 'readImport')
  }
  exportFile(championId: number | null) {
    return this._ipc.call<boolean>(NOTEBOOK_NAMESPACE, 'exportFile', championId)
  }
  transfer(value: NotebookTransfer) {
    return this._ipc.call<TransferPreview>(NOTEBOOK_NAMESPACE, 'transfer', value)
  }
  exportBuild(id: string) {
    return this._ipc.call<boolean>(NOTEBOOK_NAMESPACE, 'exportBuild', id)
  }
  applyBuild(value: BuildApply) {
    return this._ipc.call<{ state: string }>(NOTEBOOK_NAMESPACE, 'applyBuild', value)
  }
  buildRule(id: string) {
    return this._ipc.call<{ enabled: boolean; status: string }>(NOTEBOOK_NAMESPACE, 'buildRule', id)
  }
  setBuildRule(entryId: string, enabled: boolean) {
    return this._ipc.call<void>(NOTEBOOK_NAMESPACE, 'setBuildRule', { entryId, enabled })
  }
  home() {
    return this._ipc.call<HandbookHome>(NOTEBOOK_NAMESPACE, 'home')
  }
  favoriteChampion(championId: number, favorite: boolean) {
    return this._ipc.call<void>(NOTEBOOK_NAMESPACE, 'favoriteChampion', { championId, favorite })
  }
  champions() {
    return this._ipc.call<NotebookChampionSummary[]>(NOTEBOOK_NAMESPACE, 'champions')
  }
  list(query: NotebookQuery) {
    return this._ipc.call<NotebookPage>(NOTEBOOK_NAMESPACE, 'list', query)
  }
  save(query: SaveNotebook) {
    return this._ipc.call<NotebookEntry>(NOTEBOOK_NAMESPACE, 'save', saveSchema.parse(query))
  }
  change(query: ChangeNotebook) {
    return this._ipc.call<NotebookEntry>(NOTEBOOK_NAMESPACE, 'change', query)
  }
  history(id: string, page: number) {
    return this._ipc.call<NotebookPage>(NOTEBOOK_NAMESPACE, 'history', { id, page })
  }
  catalog(locale: ResourceLocale) {
    return this._ipc.call<NotebookCatalog>(NOTEBOOK_NAMESPACE, 'catalog', locale)
  }
  skills(locale: ResourceLocale, championId: number) {
    return this._ipc.call<NotebookSkills>(NOTEBOOK_NAMESPACE, 'skills', { locale, championId })
  }
}
