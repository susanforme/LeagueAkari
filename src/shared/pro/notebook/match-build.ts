import { toFrames } from '@shared/data-adapter/match-history/frames'
import { toBasicInfo } from '@shared/data-adapter/match-history/match-basic'
import { toParticipants } from '@shared/data-adapter/match-history/participants'
import type { LcuOrSgpGameDetails, LcuOrSgpGameSummary } from '@shared/data-adapter/wrapper'

import { type NotebookContent, blankContent } from '.'

export function buildFromMatch(
  summary: LcuOrSgpGameSummary,
  source: NonNullable<NotebookContent['source']>,
  details: LcuOrSgpGameDetails | null
) {
  const player = toParticipants(summary, toBasicInfo(summary)).find((p) => p.puuid === source.puuid)
  if (!player) throw new Error('Match player unavailable')
  const content = blankContent(player.championId, 'build')
  content.source = source
  // The summary contains the final inventory, not the purchase sequence.
  const items = new Map<number, number>()
  for (const id of player.items) if (id > 0) items.set(id, (items.get(id) ?? 0) + 1)
  content.groups = [{ name: '', items: [...items].map(([id, count]) => ({ id, count })) }]
  if (details && details.gameId === summary.gameId && details.source === summary.source) {
    const events: {
      type: string
      participantId?: number
      timestamp: number
      skillSlot?: number
    }[] = []
    for (const frame of toFrames(details)) events.push(...frame.events)
    content.skillOrder = events
      .filter(
        (event) => event.type === 'SKILL_LEVEL_UP' && event.participantId === player.participantId
      )
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((event) => event.skillSlot ?? 0)
      .filter((slot) => slot >= 1 && slot <= 4)
      .slice(0, 30)
  }
  return content
}
