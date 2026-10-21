import { describe, expect, it } from 'vitest'

import { selectProRelease } from './release-loader'

const release = (tag: string) => ({
  tag_name: tag,
  draft: false,
  published_at: '2026-10-21T00:00:00Z',
  body: 'Changes',
  assets: [
    {
      name: 'league-akari-win-x64.7z',
      size: 100,
      content_type: 'application/x-7z-compressed',
      browser_download_url: `https://github.com/susanforme/LeagueAkari/releases/download/${tag}/league-akari-win-x64.7z`,
      digest: `sha256:${'a'.repeat(64)}`
    }
  ]
})
describe('Pro update channel', () => {
  it('selects the newest installable Pro version, excluding upstream, CI and drafts', () => {
    const result = selectProRelease([
      release('v9.0.0'),
      release('ci-1234'),
      { ...release('v1.5.1-pro.12'), draft: true },
      { ...release('v1.5.1-pro.11'), assets: [] },
      release('v1.5.1-pro.2'),
      release('v1.5.1-pro.10')
    ])
    expect(result.version).toBe('1.5.1-pro.10')
    expect(result.artifacts[0].sha256).toBe('a'.repeat(64))
  })
  it('rejects assets from other repositories and never falls back to official releases', () => {
    const other = release('v1.5.1-pro.1')
    other.assets[0].browser_download_url =
      'https://github.com/LeagueAkari/LeagueAkari/releases/download/v1/file.7z'
    expect(() => selectProRelease([other, release('v9.0.0')])).toThrow('No installable Pro release')
  })
})
