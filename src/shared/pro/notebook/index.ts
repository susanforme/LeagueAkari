import { z } from 'zod'

import { playerSchema } from '../champion-pool'
import { runesSchema, spellsSchema } from './loadout'

export const NOTEBOOK_NAMESPACE = 'pro-notebook-main'
export const NOTEBOOK_ROUTE = 'pro-notebook'
export const kinds = ['note', 'combo', 'matchup', 'build'] as const
export const actions = ['skill', 'attack', 'move', 'spell', 'item', 'text'] as const
const entityId = z.number().int().positive()
export const sourceSchema = playerSchema.extend({
  gameId: z.number().int().positive(),
  reportId: z.string().uuid().optional(),
  timestamp: z.number().int().min(0).max(43_200_000).optional(),
  evidenceId: z.string().max(50).optional()
})
export const contentSchema = z
  .object({
    championId: entityId,
    kind: z.enum(kinds),
    title: z.string().trim().min(1).max(120),
    text: z.string().max(30_000),
    matchupPlan: z
      .object({
        opening: z.string().max(300),
        trading: z.string().max(300),
        caution: z.string().max(300)
      })
      .optional(),
    pinned: z.boolean(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    confirmedPatch: z
      .string()
      .max(20)
      .regex(/^\d+\.\d+$/)
      .nullable()
      .optional(),
    links: z.array(z.string().uuid()).max(30).optional(),
    mapId: z.union([z.literal(11), z.literal(12)]).optional(),
    opponentId: entityId.nullable(),
    position: z.enum(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']).nullable(),
    steps: z
      .array(
        z
          .object({
            action: z.enum(actions),
            entityId: entityId.nullable(),
            label: z.string().max(120)
          })
          .superRefine((step, ctx) => {
            if (['skill', 'item', 'spell'].includes(step.action) && step.entityId === null)
              ctx.addIssue({ code: 'custom', message: 'Select a game entity' })
            if (step.action === 'skill' && (step.entityId ?? 0) > 4)
              ctx.addIssue({ code: 'custom', message: 'Invalid skill slot' })
            if (step.action === 'text' && !step.label.trim())
              ctx.addIssue({ code: 'custom', message: 'Text step is empty' })
          })
      )
      .max(100),
    groups: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          items: z.array(z.object({ id: entityId, count: z.number().int().min(1).max(99) })).max(32)
        })
      )
      .max(20),
    skillOrder: z.array(z.number().int().min(1).max(4)).max(30),
    runes: runesSchema.nullable().optional(),
    spells: spellsSchema.nullable().optional(),
    source: sourceSchema.nullable()
  })
  .superRefine((content, ctx) => {
    if (content.kind === 'matchup' && content.opponentId === null)
      ctx.addIssue({ code: 'custom', message: 'Select an opponent' })
  })
export type NotebookContent = z.infer<typeof contentSchema>
export interface NotebookEntry {
  id: string
  revision: number
  content: NotebookContent
  updatedAt: number
  deleted: boolean
}
export const entryIdSchema = z.string().uuid()
export const saveSchema = z.object({
  id: entryIdSchema.nullable(),
  expectedRevision: z.number().int().nonnegative(),
  content: contentSchema
})
export type SaveNotebook = z.infer<typeof saveSchema>
export const listSchema = z.object({
  championId: entityId.nullable().default(null),
  kind: z.enum(kinds).nullable().default(null),
  search: z.string().trim().max(200).default(''),
  opponentId: entityId.nullable().default(null),
  targetPatch: z
    .string()
    .max(20)
    .regex(/^\d+\.\d+$/)
    .nullable()
    .optional(),
  reviewState: z.enum(['all', 'unmarked', 'needsReview', 'confirmed']).optional(),
  publicOpponents: z.array(entityId).max(5).optional(),
  buildMapId: entityId.optional(),
  buildPosition: z.string().max(20).optional(),
  reportId: z.string().uuid().optional(),
  deleted: z.boolean().default(false),
  page: z.number().int().min(1).max(100_000).default(1)
})
export type NotebookQuery = z.infer<typeof listSchema>
export interface NotebookPage {
  items: NotebookEntry[]
  total: number
}
export interface NotebookChampionSummary {
  championId: number
  total: number
  trash: number
  pinned: number
  updatedAt: number
  note: number
  combo: number
  matchup: number
  build: number
}
export const changeSchema = z
  .object({
    id: entryIdSchema,
    expectedRevision: z.number().int().positive(),
    action: z.enum(['pin', 'trash', 'recover', 'restore']),
    revision: z.number().int().positive().optional()
  })
  .refine((q) => q.action !== 'restore' || q.revision !== undefined)
export type ChangeNotebook = z.infer<typeof changeSchema>
export const historySchema = z.object({
  id: entryIdSchema,
  page: z.number().int().min(1).max(100_000).default(1)
})
export function blankContent(championId: number, kind: NotebookContent['kind']): NotebookContent {
  return {
    championId,
    kind,
    title: '',
    text: '',
    pinned: false,
    opponentId: null,
    position: null,
    steps: [],
    groups: [],
    skillOrder: [],
    source: null
  }
}

export const assetSchema = z.object({
  id: entityId,
  name: z.string(),
  iconPath: z.string()
})
export const notebookCatalogSchema = z.object({
  items: z.array(
    assetSchema.extend({
      description: z.string(),
      price: z.number(),
      priceTotal: z.number(),
      from: z.array(z.number()),
      to: z.array(z.number())
    })
  ),
  spells: z.array(
    assetSchema.extend({
      description: z.string(),
      cooldown: z.number(),
      summonerLevel: z.number()
    })
  )
})
export type NotebookCatalog = z.infer<typeof notebookCatalogSchema>
export const skillsSchema = z.array(
  z.object({
    spellKey: z.enum(['q', 'w', 'e', 'r']),
    name: z.string(),
    abilityIconPath: z.string()
  })
)
export type NotebookSkills = z.infer<typeof skillsSchema>

export const practiceSchema = z.object({
  entryId: entryIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  sourceRevision: z.number().int().positive(),
  state: z.enum(['pending', 'practicing', 'mastered']),
  notes: z.string().max(10000)
})
export type SavePractice = z.infer<typeof practiceSchema>
export interface PracticeEntry {
  entryId: string
  revision: number
  sourceRevision: number
  state: SavePractice['state']
  notes: string
  updatedAt: number
  entry: NotebookEntry
}
export const transferBundleSchema = z.object({
  format: z.literal('akari-notebook'),
  version: z.literal(1),
  entries: z.array(z.object({ id: entryIdSchema, content: contentSchema })).max(1000)
})
export type NotebookBundle = z.infer<typeof transferBundleSchema>
export const transferSchema = z.object({
  bundle: transferBundleSchema,
  replacements: z
    .array(
      z.object({
        sourceId: entryIdSchema,
        targetId: entryIdSchema,
        expectedRevision: z.number().int().positive()
      })
    )
    .max(1000)
    .default([]),
  commit: z.boolean().default(false)
})
export type NotebookTransfer = z.infer<typeof transferSchema>
export interface TransferPreview {
  added: number
  duplicates: number
  missingLinks: number
  conflicts: { sourceId: string; targetId: string; title: string; revision: number }[]
}
export const buildApplySchema = z.object({
  entryId: entryIdSchema,
  expectedRevision: z.number().int().positive(),
  mode: z.enum(['apply', 'new', 'overwrite']).default('apply')
})
export type BuildApply = z.infer<typeof buildApplySchema>
