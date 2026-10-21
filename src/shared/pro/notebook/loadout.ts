import { z } from 'zod'

import type { ChampSelectSession } from '../../types/league-client/champ-select'
import type { Style } from '../../types/league-client/game-data'
import type { NotebookContent } from './index'

const id = z.number().int().positive()
export const runesSchema = z
  .object({
    primaryStyleId: id,
    subStyleId: id,
    selectedPerkIds: z.array(id).length(9)
  })
  .refine((r) => r.primaryStyleId !== r.subStyleId)
export const spellsSchema = z
  .object({ spell1Id: id, spell2Id: id })
  .refine((s) => s.spell1Id !== s.spell2Id)
export type NotebookRunes = z.infer<typeof runesSchema>
export type NotebookSpells = z.infer<typeof spellsSchema>
export type LoadoutPart = 'runes' | 'spells' | 'items'
export type LoadoutPartState =
  | 'skipped'
  | 'pending'
  | 'matched'
  | 'mismatch'
  | 'failed'
  | 'conflict'
  | 'noEditablePage'
  | 'invalid'
export interface LoadoutContext {
  key: string
  championId: number
  mapId: number
  position: string
  gameMode: string
}
export interface LoadoutStatus {
  context: LoadoutContext | null
  entryId: string | null
  title: string
  busy: boolean
  parts: Record<LoadoutPart, LoadoutPartState>
  issue: 'position' | 'changed' | null
  details: LoadoutDetails
  flash: 'matched' | 'mismatch' | 'failed' | null
  flashSlot: LoadoutPreferences['flashSlot']
}
export const loadoutApplySchema = z.object({
  entryId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  contextKey: z.string().min(1).max(2000),
  mode: z.enum(['apply', 'new', 'overwrite']).default('apply'),
  retry: z.boolean().optional()
})
export type LoadoutApply = z.infer<typeof loadoutApplySchema>

export function selectedLoadoutChampion(session: ChampSelectSession | null) {
  if (!session || session.isSpectating) return null
  const self = session.myTeam.find((p) => p.cellId === session.localPlayerCellId)
  if (!self?.championId) return null
  return { championId: self.championId, position: (self.assignedPosition ?? '').toUpperCase() }
}

export function validRunes(runes: NotebookRunes, styles: Record<number, Style>) {
  const primary = styles[runes.primaryStyleId],
    secondary = styles[runes.subStyleId]
  if (!primary?.allowedSubStyles.includes(runes.subStyleId) || !secondary) return false
  const slots = primary.slots.filter(
    (s) => s.type === 'kKeyStone' || s.type === 'kMixedRegularSplashable'
  )
  const stats = primary.slots.filter((s) => s.type === 'kStatMod')
  const sub = secondary.slots.filter((s) => s.type === 'kMixedRegularSplashable')
  const secondarySlots = runes.selectedPerkIds
    .slice(4, 6)
    .map((id) => sub.findIndex((s) => s.perks.includes(id)))
  return (
    slots.length === 4 &&
    stats.length === 3 &&
    slots.every((s, i) => s.perks.includes(runes.selectedPerkIds[i])) &&
    stats.every((s, i) => s.perks.includes(runes.selectedPerkIds[i + 6])) &&
    secondarySlots.every((i) => i >= 0) &&
    secondarySlots[0] !== secondarySlots[1]
  )
}

export function sameRunes(a: NotebookRunes, b: NotebookRunes) {
  const ordered = (ids: number[]) => [
    ...ids.slice(0, 4),
    ...ids.slice(4, 6).sort((a, b) => a - b),
    ...ids.slice(6)
  ]
  return (
    a.primaryStyleId === b.primaryStyleId &&
    a.subStyleId === b.subStyleId &&
    JSON.stringify(ordered(a.selectedPerkIds)) === JSON.stringify(ordered(b.selectedPerkIds))
  )
}

export const loadoutPreferencesSchema = z.object({
  flashSlot: z.enum(['none', 'D', 'F']).default('none'),
  forceFlash: z.boolean().default(false)
})
export type LoadoutPreferences = z.infer<typeof loadoutPreferencesSchema>
export interface LoadoutDetails {
  runes?: { current: NotebookRunes | null; expected: NotebookRunes }
  spells?: { current: NotebookSpells; expected: NotebookSpells }
  items?: string[]
}
export interface CapturedLoadout {
  context: LoadoutContext
  runes: NotebookRunes | null
  spells: NotebookSpells | null
  itemSets: { uid: string; title: string; groups: NotebookContent['groups'] }[]
}
export function arrangeFlash(
  spells: NotebookSpells,
  slot: LoadoutPreferences['flashSlot']
): NotebookSpells {
  const swapped = (slot === 'D' && spells.spell2Id === 4) || (slot === 'F' && spells.spell1Id === 4)
  return swapped ? { spell1Id: spells.spell2Id, spell2Id: spells.spell1Id } : { ...spells }
}
