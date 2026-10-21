import { z } from 'zod'

export const positions = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const
export const difficulties = ['easy', 'medium', 'hard'] as const
const id = z.number().int().positive()
const text = z.string().max(10000)
export const championGuideSchema = z.object({
  championId: id,
  expectedRevision: z.number().int().nonnegative(),
  position: z.enum(positions).nullable().default(null),
  summary: text.default(''),
  strengths: text.default(''),
  weaknesses: text.default(''),
  playstyle: text.default('')
})
export type ChampionGuideInput = z.infer<typeof championGuideSchema>
export interface ChampionGuide extends Omit<ChampionGuideInput, 'expectedRevision'> {
  revision: number
  addedAt: number
}
export const championInfoSchema = z.object({
  id,
  name: z.string(),
  title: z.string(),
  shortBio: z.string(),
  roles: z.array(z.string()),
  tacticalInfo: z.object({ difficulty: z.number(), style: z.number(), damageType: z.string() }),
  playstyleInfo: z.object({
    damage: z.number(),
    durability: z.number(),
    crowdControl: z.number(),
    mobility: z.number(),
    utility: z.number()
  }),
  passive: z.object({ name: z.string(), abilityIconPath: z.string(), description: z.string() }),
  spells: z.array(
    z.object({
      spellKey: z.string(),
      name: z.string(),
      abilityIconPath: z.string(),
      description: z.string()
    })
  ),
  skins: z.array(
    z.object({
      isBase: z.boolean().optional(),
      splashPath: z.string(),
      uncenteredSplashPath: z.string().optional()
    })
  )
})
export type ChampionInfo = z.infer<typeof championInfoSchema>
export const championPositionsSchema = z.record(z.string(), z.array(z.enum(positions)))
export const practicePlanContentSchema = z
  .object({
    championId: id,
    sourceEntryId: z.string().uuid().nullable(),
    title: z.string().trim().min(1).max(120),
    category: z.string().max(60),
    difficulty: z.enum(difficulties),
    description: text,
    goals: z
      .array(
        z.object({
          id: z.string().uuid(),
          label: z.string().trim().min(1).max(200),
          target: z.number().finite().positive().max(100000),
          unit: z.enum(['count', 'percent'])
        })
      )
      .max(30),
    steps: z
      .array(z.object({ title: z.string().trim().min(1).max(120), notes: z.string().max(2000) }))
      .max(100),
    notes: text,
    state: z.enum(['pending', 'practicing', 'paused', 'mastered'])
  })
  .superRefine((plan, ctx) => {
    if (new Set(plan.goals.map((g) => g.id)).size !== plan.goals.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate goal' })
    if (plan.goals.some((g) => g.unit === 'percent' && g.target > 100))
      ctx.addIssue({ code: 'custom', message: 'Invalid percentage target' })
  })
export const savePracticePlanSchema = z.object({
  id: z.string().uuid().nullable(),
  expectedRevision: z.number().int().nonnegative(),
  content: practicePlanContentSchema
})
export type PracticePlanContent = z.infer<typeof practicePlanContentSchema>
export type SavePracticePlan = z.infer<typeof savePracticePlanSchema>
export interface PracticePlan {
  completion?: number | null
  id: string
  revision: number
  updatedAt: number
  content: PracticePlanContent
}
export const savePracticeSessionSchema = z
  .object({
    id: z.string().uuid(),
    planId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    practicedAt: z.number().int().nonnegative(),
    durationSeconds: z.number().int().min(1).max(86400),
    attempts: z.number().int().positive().max(100000).nullable(),
    hits: z.number().int().nonnegative().max(100000).nullable(),
    results: z
      .array(
        z.object({
          goalId: z.string().uuid(),
          value: z.number().finite().nonnegative().max(100000)
        })
      )
      .max(30),
    notes: text
  })
  .superRefine((session, ctx) => {
    if (
      (session.attempts === null) !== (session.hits === null) ||
      (session.hits ?? 0) > (session.attempts ?? 0)
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid hit count' })
    if (new Set(session.results.map((r) => r.goalId)).size !== session.results.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate result' })
  })
export type SavePracticeSession = z.infer<typeof savePracticeSessionSchema>
export interface PracticeSession extends Omit<SavePracticeSession, 'expectedRevision' | 'results'> {
  results: {
    goalId: string
    label: string
    target: number
    unit: 'count' | 'percent'
    value: number
  }[]
  completion: number | null
}
export const practiceQuerySchema = z.object({
  championId: id.nullable().default(null),
  page: z.number().int().min(1).max(100000).default(1),
  search: z.string().max(200).default('')
})
export const sessionQuerySchema = z.object({
  planId: z.string().uuid(),
  days: z.number().int().min(1).max(3650).default(30),
  page: z.number().int().min(1).max(100000).default(1)
})
export interface PracticeSessionPage {
  items: PracticeSession[]
  total: number
  stats: {
    sessions: number
    durationSeconds: number
    completion: number | null
    hitRate: number | null
    attempts: number
  }
}
export function sessionCompletion(
  results: PracticeSession['results'],
  goalCount: number
): number | null {
  if (!goalCount || results.length !== goalCount) return null
  return (results.reduce((sum, r) => sum + Math.min(1, r.value / r.target), 0) / goalCount) * 100
}
export function blankPractice(championId: number, title = ''): PracticePlanContent {
  return {
    championId,
    title,
    sourceEntryId: null,
    category: '',
    difficulty: 'medium',
    description: '',
    goals: [],
    steps: [],
    notes: '',
    state: 'pending'
  }
}
export const runeCatalogSchema = z.object({
  styles: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      iconPath: z.string(),
      allowedSubStyles: z.array(z.number()),
      defaultPerks: z.array(z.number()),
      defaultSubStyle: z.number(),
      slots: z.array(
        z.object({ type: z.string(), perks: z.array(z.number()), slotLabel: z.string() })
      )
    })
  ),
  perks: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      iconPath: z.string(),
      longDesc: z.string(),
      endOfGameStatDescs: z.array(z.string()).default([])
    })
  )
})
export type RuneCatalog = z.infer<typeof runeCatalogSchema>
