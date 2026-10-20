import type { ChampSelectSession } from '@shared/types/league-client/champ-select'
import { expect, it } from 'vitest'

import { quickContext } from './quick-context'

it('uses only our selected/hovered champion and opponents that have been revealed', () => {
  const session = {
    id: 'selection',
    gameId: 1,
    localPlayerCellId: 0,
    isSpectating: false,
    myTeam: [{ cellId: 0, championId: 0, championPickIntent: 103 }],
    theirTeam: [
      { championId: 0, championPickIntent: 64 },
      { championId: 1, championPickIntent: 2 }
    ]
  } as ChampSelectSession
  expect(quickContext(true, 'ChampSelect', session)).toEqual({
    championId: 103,
    opponents: [1],
    sessionId: 'selection:1'
  })
  expect(quickContext(false, 'ChampSelect', session)).toBeNull()
  expect(quickContext(true, 'Lobby', session)).toBeNull()
  expect(quickContext(true, 'ChampSelect', { ...session, isSpectating: true })).toBeNull()
  session.myTeam[0].championId = 64
  expect(quickContext(true, 'ChampSelect', session)?.championId).toBe(64)
  expect(quickContext(true, 'ChampSelect', null)).toBeNull()
})
