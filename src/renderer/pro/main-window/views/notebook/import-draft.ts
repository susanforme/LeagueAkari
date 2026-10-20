import type { NotebookContent } from '@shared/pro/notebook'
import { shallowRef } from 'vue'

// A match import is an unsaved draft; opening the handbook must not persist it.
export const importedBuild = shallowRef<NotebookContent | null>(null)
