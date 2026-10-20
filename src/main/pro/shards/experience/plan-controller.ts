import type { PlayerIdentity } from '@shared/pro/champion-pool'
import {
  type PlanChange,
  type PlanStatus,
  type PlayPlan,
  planChangeSchema,
  planProgress,
  playPlanSchema
} from '@shared/pro/experience/plan'
import type { ReviewReport } from '@shared/pro/review'
import { randomUUID } from 'node:crypto'
import type { DataSource } from 'typeorm'

export class PlanController {
  constructor(
    private readonly _database: () => DataSource,
    private readonly _identity: () => PlayerIdentity | null,
    private readonly _phase: () => string | null
  ) {}
  async focuses(page: number) {
    const condition = "json_extract(payload, '$.focus') IS NOT NULL"
    const [{ total }] = await this._database().query(
      `SELECT COUNT(*) total FROM ExperiencePlans WHERE ${condition}`
    )
    const rows: { serverId: string; puuid: string; payload: string }[] =
      await this._database().query(
        `SELECT serverId,puuid,payload FROM ExperiencePlans WHERE ${condition} ORDER BY serverId,puuid LIMIT 10 OFFSET ?`,
        [(page - 1) * 10]
      )
    return {
      total,
      items: rows.map((row) => ({
        player: { serverId: row.serverId, puuid: row.puuid },
        plan: playPlanSchema.parse(JSON.parse(row.payload))
      }))
    }
  }
  async get(player: PlayerIdentity): Promise<PlayPlan> {
    const [row] = await this._database().query(
      'SELECT payload FROM ExperiencePlans WHERE serverId=? AND puuid=?',
      [player.serverId, player.puuid]
    )
    return row
      ? playPlanSchema.parse(JSON.parse(row.payload))
      : { revision: 0, focus: null, session: null }
  }
  async status(player: PlayerIdentity): Promise<PlanStatus> {
    const plan = await this.get(player)
    const rows: { projection: string; summary: string }[] = plan.session
      ? await this._database().query(
          'SELECT projection,summary FROM PoolMatches WHERE serverId=? AND puuid=? AND startedAt>=? AND startedAt<=?',
          [
            player.serverId,
            player.puuid,
            plan.session.startedAt,
            plan.session.endedAt ?? Date.now()
          ]
        )
      : []
    return {
      plan,
      progress: planProgress(
        plan,
        rows.map((row) => ({ match: JSON.parse(row.projection), summary: JSON.parse(row.summary) }))
      )
    }
  }
  async change(input: PlanChange) {
    const { player, action, revision } = planChangeSchema.parse(input)
    const plan = await this.get(player)
    if (revision !== plan.revision) throw new Error('conflict')
    const now = Date.now()
    if (action.kind === 'focus') {
      const [row] = await this._database().query('SELECT report FROM ReviewReports WHERE id=?', [
        action.value.reportId
      ])
      const report: ReviewReport | undefined = row && JSON.parse(row.report)
      if (
        !report ||
        report.player.serverId !== player.serverId ||
        report.player.puuid !== player.puuid ||
        report.analysis.metrics.championId !== action.value.championId ||
        action.value.timestamp > report.analysis.duration
      )
        throw new Error('Invalid review evidence')
      plan.focus = action.value
    } else if (action.kind === 'clearFocus') plan.focus = null
    else {
      const identity = this._identity()
      if (
        identity?.serverId !== player.serverId ||
        identity?.puuid !== player.puuid ||
        !['None', 'Lobby', 'EndOfGame', 'PreEndOfGame'].includes(this._phase() ?? '')
      )
        throw new Error('Plan requires the current account in lobby')
      if (action.kind === 'start') {
        if (plan.session && plan.session.endedAt === null) throw new Error('Plan already active')
        if ((plan.session?.breakUntil ?? 0) > now) throw new Error('Break is still active')
        plan.session = {
          id: randomUUID(),
          startedAt: now,
          endedAt: null,
          games: action.games,
          minutes: action.minutes,
          breakUntil: null
        }
      } else {
        if (!plan.session) throw new Error('No play plan')
        plan.session.endedAt ??= now
        plan.session.breakUntil = action.kind === 'rest' ? now + action.minutes * 60_000 : null
      }
    }
    plan.revision++
    // Compare-and-swap prevents a slow window from overwriting another window's goal or session.
    const rows =
      revision === 0
        ? await this._database().query(
            'INSERT INTO ExperiencePlans VALUES (?,?,?,?) ON CONFLICT DO NOTHING RETURNING revision',
            [player.serverId, player.puuid, plan.revision, JSON.stringify(plan)]
          )
        : await this._database().query(
            'UPDATE ExperiencePlans SET revision=?,payload=? WHERE serverId=? AND puuid=? AND revision=? RETURNING revision',
            [plan.revision, JSON.stringify(plan), player.serverId, player.puuid, revision]
          )
    if (!rows.length) throw new Error('conflict')
    return plan
  }
}
