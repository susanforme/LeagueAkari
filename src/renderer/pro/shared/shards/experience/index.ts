import { AkariIpcRenderer } from '@renderer-shared/shards/ipc'
import { Dep, Shard } from '@shared/akari-shard'
import type { LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'
import type { PlayerIdentity } from '@shared/pro/champion-pool'
import {
  EXPERIENCE_NAMESPACE,
  type ExperiencePreferences,
  type ExperienceStatus,
  type Scene,
  type SearchRecords,
  type SocialSummary,
  type Workspace
} from '@shared/pro/experience'

@Shard(ExperienceRenderer.id)
export class ExperienceRenderer {
  static id = 'pro-experience-renderer'
  constructor(@Dep(AkariIpcRenderer) private readonly _ipc: AkariIpcRenderer) {}
  dismissReminder(id: string) {
    return this._ipc.call<void>(EXPERIENCE_NAMESPACE, 'dismissReminder', id)
  }
  status() {
    return this._ipc.call<ExperienceStatus & { archiveError: boolean; archiving: boolean }>(
      EXPERIENCE_NAMESPACE,
      'status'
    )
  }
  search(text: string, champions: number[]) {
    return this._ipc.call<SearchRecords>(EXPERIENCE_NAMESPACE, 'search', { text, champions })
  }
  preferences(value: ExperiencePreferences) {
    return this._ipc.call<void>(EXPERIENCE_NAMESPACE, 'preferences', value)
  }
  workspace(key: string) {
    return this._ipc.call<Workspace | null>(EXPERIENCE_NAMESPACE, 'workspace', key)
  }
  saveWorkspace(key: string, workspace: Workspace) {
    return this._ipc.call<void>(EXPERIENCE_NAMESPACE, 'saveWorkspace', { key, workspace })
  }
  scenes() {
    return this._ipc.call<Scene[]>(EXPERIENCE_NAMESPACE, 'scenes')
  }
  saveScene(scene: Scene) {
    return this._ipc.call<void>(EXPERIENCE_NAMESPACE, 'saveScene', scene)
  }
  deleteScene(name: string) {
    return this._ipc.call<void>(EXPERIENCE_NAMESPACE, 'deleteScene', name)
  }
  applyScene(name: string) {
    return this._ipc.call<void>(EXPERIENCE_NAMESPACE, 'applyScene', name)
  }
  archive() {
    return this._ipc.call<void>(EXPERIENCE_NAMESPACE, 'archive')
  }
  social(player: PlayerIdentity) {
    return this._ipc.call<SocialSummary>(EXPERIENCE_NAMESPACE, 'social', player)
  }
  games(player: PlayerIdentity, gameIds: number[]) {
    return this._ipc.call<LcuOrSgpGameSummary[]>(EXPERIENCE_NAMESPACE, 'games', {
      ...player,
      gameIds
    })
  }
  share(png: string, action: 'copy' | 'save') {
    return this._ipc.call<boolean>(EXPERIENCE_NAMESPACE, 'share', { png, action })
  }
}
