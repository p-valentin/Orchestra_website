import { readJson, readJsonCached, writeJson } from './store'
import { VERSION } from './release'

export interface Release {
  version: string
  notes: string
  createdAt: string
  publishedAt: string | null
}

const KEY = 'site/releases.json'

interface ReleasesFile {
  releases: Release[]
}

// Cached: the admin page asks for the release list and the live version
// separately, and /downloads and /releases each read it more than once per
// render. One object, one fetch per request. The write paths below deliberately
// keep using the uncached readJson.
export async function listReleases(): Promise<Release[]> {
  const data = await readJsonCached<ReleasesFile>(KEY, { releases: [] })
  return [...data.releases].sort((a, b) => compareVersions(b.version, a.version))
}

export async function publishedReleases(): Promise<Release[]> {
  return (await listReleases()).filter(r => r.publishedAt)
}

// The version the public site serves. Drafts stay invisible until shipped;
// before the first shipped release, the hardcoded fallback keeps working.
export async function liveVersion(): Promise<string> {
  const published = await publishedReleases()
  return published[0]?.version ?? VERSION
}

export async function saveRelease(version: string, notes: string): Promise<boolean> {
  const data = await readJson<ReleasesFile>(KEY, { releases: [] })
  const existing = data.releases.find(r => r.version === version)
  if (existing) {
    existing.notes = notes
  } else {
    data.releases.push({ version, notes, createdAt: new Date().toISOString(), publishedAt: null })
  }
  return writeJson(KEY, data)
}

export async function setPublished(version: string, published: boolean): Promise<boolean> {
  const data = await readJson<ReleasesFile>(KEY, { releases: [] })
  const release = data.releases.find(r => r.version === version)
  if (!release) return false
  release.publishedAt = published ? new Date().toISOString() : null
  return writeJson(KEY, data)
}

export async function deleteRelease(version: string): Promise<boolean> {
  const data = await readJson<ReleasesFile>(KEY, { releases: [] })
  data.releases = data.releases.filter(r => r.version !== version)
  return writeJson(KEY, data)
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n) || 0)
  const pb = b.split('.').map(n => parseInt(n) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  }
  return 0
}
