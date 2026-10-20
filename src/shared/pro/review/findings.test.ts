import { expect, it } from 'vitest'

import { analyzeMatch } from '../../../main/pro/shards/review/analysis'
import { reviewFixture } from '../../../main/pro/shards/review/test-fixtures'
import type { BaselineMetric, Insights } from '../progress'
import { reviewFindings } from './findings'
import type { ReviewReport } from './index'

function report(): ReviewReport {
  const { summary, details } = reviewFixture()
  return {
    id: 'current',
    player: { serverId: 'EUW1', puuid: 'player' },
    createdAt: 1,
    summary,
    details,
    analysis: analyzeMatch(summary, details, 'player')
  }
}
function history(
  id: BaselineMetric['id'],
  current: number,
  values = [70, 80, 90, 100, 110]
): Insights {
  return {
    scanned: values.length,
    truncated: false,
    metrics: [
      {
        id,
        current,
        median: 90,
        q1: 80,
        q3: 100,
        excluded: 0,
        samples: values.map((value, index) => ({
          reportId: `previous-${index}`,
          gameId: index + 2,
          startedAt: index,
          value
        }))
      }
    ]
  }
}

it('locates the largest observed gold decline without needing historical reports', () => {
  const current = report()
  current.analysis.points.forEach((point, index) => {
    point.goldDiff = index < 10 ? 1000 : index <= 15 ? 1000 - (index - 10) * 200 : 0
  })
  expect(reviewFindings(current)[0]).toEqual({
    kind: 'goldDrop',
    value: 1000,
    evidence: { from: 600_000, to: 900_000, metric: 'goldDiff' }
  })
})

it.each(['gap', 'null'] as const)('does not bridge a %s in economic evidence', (missing) => {
  const current = report()
  current.analysis.points = [
    { timestamp: 0, goldDiff: 1000, gold: 1000, cs: 0, xp: 0, csDiff: 0 },
    { timestamp: 60_000, goldDiff: null, gold: null, cs: null, xp: null, csDiff: null },
    { timestamp: 180_000, goldDiff: 0, gold: 1100, cs: 1, xp: 1, csDiff: 0 }
  ]
  if (missing === 'gap') current.analysis.points.splice(1, 1)
  expect(reviewFindings(current).some((finding) => finding.kind === 'goldDrop')).toBe(false)
})

it('compares a low checkpoint with a representative better historical match', () => {
  const current = report()
  const insights = history('cs10', 60)
  expect(reviewFindings(current, insights)).toContainEqual({
    kind: 'farm',
    value: 60,
    baseline: 90,
    samples: 5,
    evidence: { from: 540_000, to: 600_000, metric: 'cs' },
    comparisonId: 'previous-2'
  })
  insights.metrics[0].samples.pop()
  expect(reviewFindings(current, insights).some((finding) => finding.kind === 'farm')).toBe(false)
})

it('keeps death/objective observations factual and omits recurrence for insufficient samples', () => {
  const current = report()
  const insights = history('deathBeforeObjective', 1, [1, 0, 1, 0, 1])
  const finding = reviewFindings(current, insights).find(
    (finding) => finding.kind === 'deathBeforeObjective'
  )
  expect(finding).toMatchObject({
    value: 590_000,
    samples: 5,
    occurrences: 3,
    evidence: { from: 530_000, to: 650_000 }
  })
  expect(
    reviewFindings(current).find((finding) => finding.kind === 'deathBeforeObjective')?.occurrences
  ).toBeUndefined()
  current.analysis.events = current.analysis.events.filter(
    (event) => event.type !== 'ELITE_MONSTER_KILL'
  )
  expect(reviewFindings(current).some((finding) => finding.kind === 'deathBeforeObjective')).toBe(
    false
  )
})

it('uses available summary metrics without inventing a timeline', () => {
  const current = report()
  current.details = null
  current.analysis.limitations.push('timelineMissing')
  const findings = reviewFindings(current, history('csPerMin', 3, [4, 5, 6, 7, 8]))
  expect(findings).toHaveLength(1)
  expect(findings[0]).toMatchObject({ kind: 'farm', value: 3 })
  expect(findings[0].evidence).toBeUndefined()
})

it('still analyzes available summary farm when timeline checkpoints are missing', () => {
  const current = report()
  current.analysis.checkpoints = []
  const finding = reviewFindings(current, history('csPerMin', 3)).find(
    (item) => item.kind === 'farm'
  )
  expect(finding).toMatchObject({ value: 3, baseline: 90 })
  expect(finding?.evidence).toBeUndefined()
})

it('avoids diagnosing unsupported modes, remakes and ordinary matches', () => {
  const current = report()
  current.analysis.events = []
  expect(reviewFindings(current)).toEqual([])
  current.analysis.limitations.push('unsupportedMode')
  expect(reviewFindings(current, history('cs10', 60))).toEqual([])
  current.analysis.limitations = []
  current.analysis.metrics.outcome = 'remake'
  expect(reviewFindings(current, history('cs10', 60))).toEqual([])
})

it('caps the result at three distinct findings and only counts valid history', () => {
  const current = report()
  current.analysis.points.forEach((point) => {
    point.goldDiff = -300
  })
  const insights = history('cs15', 60)
  insights.metrics.push(...history('goldDeficit10', 1, [0, 1, 1, 1, 0]).metrics)
  const findings = reviewFindings(current, insights)
  expect(findings).toHaveLength(3)
  expect(findings.find((finding) => finding.kind === 'goldDeficit')).toMatchObject({
    value: 300,
    occurrences: 3,
    samples: 5
  })
})
