import type { AutoFetchConfig, AutoFetchResult, DiscoveredSkill, PermissionConfig, SkillRegistry } from './types.js'
import { PermissionEnforcer, PermissionPolicy } from './permissions.js'
import { downloadSkill } from './skills-sh.js'

const LEGACY_API_BASE = 'https://skills.sh'
const V1_API_BASE = 'https://skills.sh/api/v1'
const SEARCH_CACHE_TTL = 60_000
const DOWNLOADED_SET = new Set<string>()

interface SearchCacheEntry {
  skills: DiscoveredSkill[]
  apiTier: 'legacy' | 'v1'
  timestamp: number
}

const searchCache = new Map<string, SearchCacheEntry>()

interface LegacySearchResponse {
  query: string
  searchType: string
  skills: Array<{
    id: string
    skillId: string
    name: string
    installs: number
    source: string
  }>
  count: number
  duration_ms: number
}

interface V1Skill {
  id: string
  slug: string
  name: string
  source: string
  installs: number
  sourceType: string
  installUrl: string | null
  url: string
}

interface V1SearchResponse {
  data: V1Skill[]
  query: string
  searchType: string
  count: number
  durationMs: number
}

function toDiscovered(legacy: LegacySearchResponse['skills'][number]): DiscoveredSkill
function toDiscovered(v1: V1Skill): DiscoveredSkill
function toDiscovered(skill: LegacySearchResponse['skills'][number] | V1Skill): DiscoveredSkill {
  if ('skillId' in skill) {
    return {
      id: skill.id,
      name: skill.name,
      installs: skill.installs,
      source: skill.source,
      skillId: skill.skillId,
    }
  }
  return {
    id: skill.id,
    name: skill.name,
    installs: skill.installs,
    source: skill.source,
    skillId: skill.slug,
  }
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(token => token.trim())
    .filter(token => token.length > 1)
}

function relevanceScore(task: string, skill: DiscoveredSkill): number {
  const tokens = tokenize(task)
  const corpus = [skill.name, skill.skillId, skill.source, skill.id].join(' ').toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (skill.name.toLowerCase().includes(token)) score += 20
    if (skill.skillId.toLowerCase().includes(token)) score += 15
    if (skill.source.toLowerCase().includes(token)) score += 10
    if (corpus.includes(token)) score += 5
  }
  return score
}

function installWeight(installs: number): number {
  if (installs > 50000) return 30
  if (installs > 10000) return 20
  if (installs > 1000) return 10
  if (installs > 100) return 5
  return 1
}

export async function searchSkillsSh(
  query: string,
  limit: number = 10,
  oidcToken?: string,
): Promise<{ apiTier: 'legacy' | 'v1'; skills: DiscoveredSkill[] }> {
  if (oidcToken) {
    try {
      const url = `${V1_API_BASE}/skills/search?q=${encodeURIComponent(query)}&limit=${limit}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${oidcToken}` },
      })
      if (res.ok) {
        const data = (await res.json()) as V1SearchResponse
        return { apiTier: 'v1', skills: data.data.map(toDiscovered) }
      }
    } catch {
      // fall through to legacy
    }
  }

  const url = `${LEGACY_API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`skills.sh search failed (${res.status}): ${res.statusText}`)
  }
  const data = (await res.json()) as LegacySearchResponse
  return { apiTier: 'legacy', skills: data.skills.map(toDiscovered) }
}

function isAlreadyInstalled(skill: DiscoveredSkill, registry: SkillRegistry): boolean {
  for (const existing of registry.skills) {
    if (existing.name.toLowerCase() === skill.name.toLowerCase()) return true
    if (existing.id === skill.id) return true
    if (existing.source && existing.source.includes(skill.source)) return true
  }
  return false
}

export function clearFetchCache(): void {
  searchCache.clear()
  DOWNLOADED_SET.clear()
}

export async function autoFetchSkills(
  task: string,
  registry: SkillRegistry,
  config: AutoFetchConfig,
  cwd: string,
  permissionConfig?: PermissionConfig,
): Promise<AutoFetchResult> {
  const cacheKey = task.toLowerCase().trim()

  let apiTier: 'legacy' | 'v1'
  let skills: DiscoveredSkill[]

  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL) {
    apiTier = cached.apiTier
    skills = cached.skills
  } else {
    const result = await searchSkillsSh(task, config.maxResults, config.vercelOidcToken)
    apiTier = result.apiTier
    skills = result.skills
    searchCache.set(cacheKey, { skills, apiTier, timestamp: Date.now() })
  }

  const result: AutoFetchResult = {
    query: task,
    apiTier,
    found: skills,
    downloaded: [],
    skipped: [],
    errors: [],
  }

  const enforcer = permissionConfig
    ? new PermissionEnforcer(new PermissionPolicy(permissionConfig))
    : undefined

  const scored = skills
    .map(skill => ({ skill, score: relevanceScore(task, skill) + installWeight(skill.installs) }))
    .sort((a, b) => b.score - a.score)

  for (const { skill } of scored) {
    if (result.downloaded.length >= config.maxResults) break

    if (DOWNLOADED_SET.has(skill.id)) {
      result.skipped.push(`${skill.id} (already downloaded this session)`)
      continue
    }

    if (isAlreadyInstalled(skill, registry)) {
      DOWNLOADED_SET.add(skill.id)
      result.skipped.push(`${skill.id} (already installed)`)
      continue
    }

    try {
      await downloadSkill(skill.source, skill.skillId, cwd)
      DOWNLOADED_SET.add(skill.id)
      result.downloaded.push(skill.id)
    } catch (error) {
      result.errors.push(`${skill.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return result
}

export function needsAutoFetch(
  ranked: Array<{ score: number }>,
  threshold: number = 20,
): boolean {
  if (ranked.length === 0) return true
  return ranked[0]!.score < threshold
}
