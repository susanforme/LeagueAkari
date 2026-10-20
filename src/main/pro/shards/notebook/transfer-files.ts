import { transferBundleSchema } from '@shared/pro/notebook'
import { dialog } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'

export const MAX_NOTEBOOK_BYTES = 4 * 1024 * 1024
export async function readNotebookFile() {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled) return null
  const path = result.filePaths[0]
  if ((await stat(path)).size > MAX_NOTEBOOK_BYTES) throw new Error('File too large')
  return transferBundleSchema.parse(JSON.parse(await readFile(path, 'utf8')))
}
export async function saveNotebookFile(value: unknown, name: string) {
  const json = JSON.stringify(value, null, 2)
  if (Buffer.byteLength(json) > MAX_NOTEBOOK_BYTES) throw new Error('File too large')
  const result = await dialog.showSaveDialog({
    defaultPath: name,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return false
  await writeFile(result.filePath, json, 'utf8')
  return true
}
