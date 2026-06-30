import type {
  DangerLevel,
  PermissionAction,
  PermissionConfig,
  PermissionDecision,
  PermissionMode,
  PermissionResult,
  PermissionRule,
  SkillDefinition,
} from './types.js'

const MODE_ORDER: Record<PermissionMode, number> = {
  'read-only': 0,
  'workspace-write': 1,
  'full-access': 2,
  'prompt': 3,
  'allow': 4,
}

const DEFAULT_PERMISSIONS: PermissionConfig = {
  mode: 'full-access',
  allow: [],
  deny: [],
  ask: [],
  trustedRoots: [],
}

const TOOL_REQUIREMENTS: Record<string, PermissionMode> = {
  bash: 'full-access',
  shell: 'full-access',
  mcp: 'full-access',
  network: 'full-access',
  exec: 'full-access',
  'file:write': 'workspace-write',
  write_file: 'workspace-write',
  edit_file: 'workspace-write',
  'file:read': 'read-only',
  read_file: 'read-only',
  grep: 'read-only',
  glob: 'read-only',
}

function toolRequirement(requiresTools: string[]): PermissionMode {
  if (requiresTools.some(t => t === 'bash' || t === 'network' || t === 'mcp' || t === 'shell')) {
    return 'full-access'
  }
  if (requiresTools.some(t => t === 'file:write' || t === 'write_file')) {
    return 'workspace-write'
  }
  return 'read-only'
}

function dangerRequirement(level: DangerLevel | undefined): PermissionMode {
  switch (level) {
    case 'critical': return 'full-access'
    case 'high': return 'full-access'
    case 'moderate': return 'workspace-write'
    case 'low': return 'read-only'
    case 'none': return 'read-only'
    default: return 'read-only'
  }
}

function modeAtLeast(actual: PermissionMode, required: PermissionMode): boolean {
  return MODE_ORDER[actual] >= MODE_ORDER[required]
}

function parseRule(raw: string): PermissionRule | null {
  const parenIndex = raw.indexOf('(')
  if (parenIndex === -1) {
    return { pattern: raw.trim(), action: 'allow' }
  }
  return { pattern: raw.trim(), action: 'allow' }
}

function matchRule(pattern: string, toolName: string, input: string): boolean {
  const parenIndex = pattern.indexOf('(')
  if (parenIndex === -1) {
    return pattern === toolName
  }

  const name = pattern.slice(0, parenIndex).trim()
  if (name !== toolName) return false

  const rest = pattern.slice(parenIndex + 1)
  const matcher = rest.endsWith(')') ? rest.slice(0, -1) : rest
  if (!matcher || matcher === '*') return true

  if (matcher.endsWith(':*')) {
    const prefix = matcher.slice(0, -2)
    return input.startsWith(prefix)
  }

  if (matcher.endsWith('*')) {
    const prefix = matcher.slice(0, -1)
    return input.startsWith(prefix)
  }

  return input.includes(matcher)
}

export function buildRules(raw: string[], action: PermissionAction): PermissionRule[] {
  return raw.map(pattern => {
    const parenIndex = pattern.indexOf('(')
    return {
      pattern,
      action,
      ...(parenIndex === -1 ? {} : {}),
    }
  })
}

export class PermissionPolicy {
  private rules: PermissionRule[] = []

  constructor(private config: PermissionConfig = DEFAULT_PERMISSIONS) {
    for (const pattern of config.deny) {
      this.rules.push({ pattern, action: 'deny' })
    }
    for (const pattern of config.allow) {
      this.rules.push({ pattern, action: 'allow' })
    }
    for (const pattern of config.ask) {
      this.rules.push({ pattern, action: 'ask' })
    }
  }

  get mode(): PermissionMode {
    return this.config.mode
  }

  get trustedRoots(): string[] {
    return this.config.trustedRoots
  }

  isWorkspaceTrusted(cwd: string): boolean {
    if (this.config.trustedRoots.length === 0) return true
    return this.config.trustedRoots.some(root => cwd.startsWith(root))
  }

  authorize(toolName: string, input: string = ''): PermissionResult {
    if (this.config.mode === 'allow') {
      return { decision: 'allowed', reason: 'allow mode' }
    }

    for (const rule of this.rules) {
      if (matchRule(rule.pattern, toolName, input)) {
        if (rule.action === 'deny') {
          return { decision: 'denied', reason: `denied by rule: ${rule.pattern}`, rule: rule.pattern }
        }
        if (rule.action === 'allow') {
          return { decision: 'allowed', reason: `allowed by rule: ${rule.pattern}`, rule: rule.pattern }
        }
        if (rule.action === 'ask') {
          return { decision: 'needs-approval', reason: `requires approval by rule: ${rule.pattern}`, rule: rule.pattern }
        }
      }
    }

    const required = TOOL_REQUIREMENTS[toolName]
    if (required && !modeAtLeast(this.config.mode, required)) {
      return {
        decision: 'denied',
        reason: `${toolName} requires ${required} mode, session is ${this.config.mode}`,
      }
    }

    if (this.config.mode === 'prompt') {
      return { decision: 'needs-approval', reason: 'prompt mode requires approval for all operations' }
    }

    return { decision: 'allowed', reason: `allowed by ${this.config.mode} mode` }
  }

  authorizeSkill(skill: SkillDefinition): PermissionResult {
    const requiredMode = this.requiredMode(skill)
    if (!modeAtLeast(this.config.mode, requiredMode)) {
      return {
        decision: 'denied',
        reason: `skill requires ${requiredMode} (${skill.security.dangerLevel}) but session is ${this.config.mode}`,
      }
    }

    for (const tool of skill.security.requiresTools) {
      const result = this.authorize(tool)
      if (result.decision !== 'allowed') return result
    }

    return { decision: 'allowed', reason: 'skill requirements within session permissions' }
  }

  private requiredMode(skill: SkillDefinition): PermissionMode {
    const fromTools = toolRequirement(skill.security.requiresTools)
    const fromDanger = dangerRequirement(skill.security.dangerLevel)
    return MODE_ORDER[fromTools] > MODE_ORDER[fromDanger] ? fromTools : fromDanger
  }
}

export class PermissionEnforcer {
  constructor(public policy: PermissionPolicy) {}

  checkSkill(skill: SkillDefinition): PermissionResult {
    return this.policy.authorizeSkill(skill)
  }

  checkTool(toolName: string, input?: string): PermissionResult {
    return this.policy.authorize(toolName, input ?? '')
  }

  filterSkills(skills: SkillDefinition[]): SkillDefinition[] {
    return skills.filter(skill => this.checkSkill(skill).decision === 'allowed')
  }

  filterRanked<T extends { skill: SkillDefinition }>(ranked: T[]): T[] {
    return ranked.filter(item => this.checkSkill(item.skill).decision === 'allowed')
  }
}

export function defaultPermissionConfig(): PermissionConfig {
  return { ...DEFAULT_PERMISSIONS }
}
