import type { ExperienceStatus, Workspace } from '@shared/pro/experience'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

export const useExperienceStore = defineStore('pro-experience', () => {
  const status = shallowRef<
    (ExperienceStatus & { archiveError: boolean; archiving: boolean }) | null
  >(null)
  const workspace = ref<Workspace>({ route: 'pro-profile', query: {}, pages: {} })
  const ready = ref(false),
    restoring = ref(false),
    error = ref(false),
    revision = ref(0)
  return { status, workspace, ready, restoring, error, revision }
})
