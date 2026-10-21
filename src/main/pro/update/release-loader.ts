import type { AkariApiMainContext } from '@main/shards/akari-api/context'
import { AkariReleaseSchema } from '@shared/shards/akari-api'
import axios from 'axios'
import { rcompare, valid } from 'semver'
import { z } from 'zod'

const repository = 'susanforme/LeagueAkari'
const releasesSchema = z.array(
  z.object({
    tag_name: z.string(),
    draft: z.boolean(),
    published_at: z.string().nullable(),
    body: z.string().nullable(),
    assets: z.array(
      z.object({
        name: z.string(),
        size: z.number().int().nonnegative(),
        content_type: z.string(),
        browser_download_url: z.url(),
        digest: z.string().nullable().optional()
      })
    )
  })
)
export function selectProRelease(input: unknown) {
  const releases = releasesSchema
    .parse(input)
    .filter(
      (release) =>
        !release.draft &&
        valid(release.tag_name) &&
        /^v?\d+\.\d+\.\d+-pro\.\d+$/.test(release.tag_name)
    )
  releases.sort((a, b) => rcompare(a.tag_name, b.tag_name))
  for (const release of releases) {
    const artifacts = release.assets.flatMap((asset) => {
      const match = /^league-akari-(win-x64\.7z|mac-arm64\.(?:dmg|zip))$/.exec(asset.name)
      const prefix = `https://github.com/${repository}/releases/download/${release.tag_name}/`
      if (!match || !asset.browser_download_url.startsWith(prefix)) return []
      return [
        {
          platform: asset.name.includes('-win-') ? 'win32' : 'darwin',
          arch: asset.name.includes('-win-') ? 'x64' : 'arm64',
          fileName: asset.name,
          size: asset.size,
          contentType: asset.content_type,
          sha256: asset.digest?.match(/^sha256:([a-f0-9]{64})$/)?.[1] ?? null,
          downloadUrl: asset.browser_download_url
        }
      ]
    })
    if (!release.published_at || !artifacts.some((a) => a.platform === 'win32')) continue
    return AkariReleaseSchema.parse({
      version: release.tag_name.replace(/^v/, ''),
      publishedAt: release.published_at,
      description: release.body ?? '',
      artifacts
    })
  }
  throw new Error('No installable Pro release available')
}
export async function loadProRelease(context: AkariApiMainContext) {
  const proxy = context.appCommon.settings.httpProxy
  const { data } = await axios.get(`https://api.github.com/repos/${repository}/releases`, {
    params: { per_page: 100 },
    timeout: 30_000,
    headers: { Accept: 'application/vnd.github+json' },
    proxy:
      proxy.strategy === 'disable'
        ? false
        : proxy.strategy === 'force'
          ? { host: proxy.host, port: proxy.port }
          : undefined
  })
  return selectProRelease(data)
}
