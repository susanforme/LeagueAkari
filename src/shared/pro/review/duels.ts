import type { ReviewAnalysis, ReviewEvent } from './index'

// An explicit empty assist list proves "unassisted", not the absence of nearby enemies or tower damage.
export function unassistedKill(event: ReviewEvent, analysis: ReviewAnalysis) {
  if (event.type !== 'CHAMPION_KILL' || event.assistingParticipantIds?.length !== 0) return false
  const killer = analysis.participants.find((p) => p.id === event.killerId)
  const victim = analysis.participants.find((p) => p.id === event.victimId)
  return !!killer && !!victim && killer.id > 0 && victim.id > 0 && killer.teamId !== victim.teamId
}

export function personalDuels(analysis: ReviewAnalysis) {
  const events = analysis.events.filter((event) => unassistedKill(event, analysis))
  return {
    kills: events.filter((event) => event.killerId === analysis.participantId),
    deaths: events.filter((event) => event.victimId === analysis.participantId),
    unknown: analysis.events.filter(
      (event) =>
        event.type === 'CHAMPION_KILL' &&
        (event.killerId === analysis.participantId || event.victimId === analysis.participantId) &&
        event.assistingParticipantIds === undefined
    ).length
  }
}
