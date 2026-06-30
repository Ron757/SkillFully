import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AutoFetchConfig, PermissionConfig, RuntimeConfig } from './types.js'

const DEFAULT_CONFIG: RuntimeConfig = {
  skillRoots: [
    './skills',
    './.agents/skills',
    './.codex/skills',
    './.claude/skills',
    './.claw/skills',
  ],
  plannerTopK: 8,
  maxPlanSteps: 3,
}

const DEFAULT_AUTO_FETCH: AutoFetchConfig = {
  enabled: false,
  threshold: 20,
  maxResults: 5,
  knownSources: ['vercel-labs/agent-skills'],
}

const DEFAULT_PERMISSIONS: PermissionConfig = {
  mode: 'full-access',
  allow: [],
  deny: [],
  ask: [],
  trustedRoots: [],
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      result.push(value)
    }
  }
  return result
}

export function loadConfig(cwd: string): RuntimeConfig {
  const configPath = resolve(cwd, 'skill-layer.config.json')
  const parsed = existsSync(configPath)
    ? (JSON.parse(readFileSync(configPath, 'utf8')) as Partial<RuntimeConfig>)
    : {}

  const envRoots = process.env.SKILL_LAYER_SKILL_ROOTS
    ? process.env.SKILL_LAYER_SKILL_ROOTS.split(',').map(part => part.trim()).filter(Boolean)
    : []

  const homeRoots =
    process.env.SKILL_LAYER_INCLUDE_HOME_ROOTS === 'true'
      ? [
          join(homedir(), '.config', 'agents', 'skills'),
          join(homedir(), '.codex', 'skills'),
          join(homedir(), '.claude', 'skills'),
          join(homedir(), '.claw', 'skills'),
        ]
      : []

  const autoFetch: AutoFetchConfig = {
    ...DEFAULT_AUTO_FETCH,
    ...parsed.autoFetch,
    vercelOidcToken:
      process.env.SKILLS_SH_OIDC_TOKEN ??
      process.env.VERCEL_OIDC_TOKEN ??
      parsed.autoFetch?.vercelOidcToken,
  }

  const envMode = process.env.SKILL_LAYER_PERMISSION_MODE as PermissionConfig['mode'] | undefined

  const permissions: PermissionConfig = {
    ...DEFAULT_PERMISSIONS,
    ...parsed.permissions,
    mode: envMode ?? parsed.permissions?.mode ?? DEFAULT_PERMISSIONS.mode,
  }

  return {
    skillRoots: unique([
      ...(parsed.skillRoots ?? DEFAULT_CONFIG.skillRoots),
      ...envRoots,
      ...homeRoots,
    ]),
    plannerTopK: parsed.plannerTopK ?? DEFAULT_CONFIG.plannerTopK,
    maxPlanSteps: parsed.maxPlanSteps ?? DEFAULT_CONFIG.maxPlanSteps,
    autoFetch,
    permissions,
  }
}
