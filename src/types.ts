export type SkillEntryType = 'prompt' | 'shell' | 'node' | 'bun'

export interface SkillEntry {
  type: SkillEntryType
  command: string[]
  cwd?: string
}

export type DangerLevel = 'none' | 'low' | 'moderate' | 'high' | 'critical'

export interface SkillSecurity {
  requiresTools: string[]
  allowedCommands?: string[]
  deniedCommands?: string[]
  dangerLevel: DangerLevel
}

export interface SkillConfig {
  id?: string
  name?: string
  description?: string
  tags?: string[]
  capabilities?: string[]
  triggers?: string[]
  examples?: string[]
  domains?: string[]
  consumes?: string[]
  produces?: string[]
  paths?: string[]
  safe?: boolean
  chainable?: boolean
  entry?: Partial<SkillEntry>
  security?: Partial<SkillSecurity>
}

export interface SkillDefinition {
  id: string
  name: string
  description: string
  instructions: string
  tags: string[]
  capabilities: string[]
  triggers: string[]
  examples: string[]
  domains: string[]
  consumes: string[]
  produces: string[]
  paths: string[]
  safe: boolean
  chainable: boolean
  entry: SkillEntry
  security: SkillSecurity
  skillDir: string
  skillMdPath: string
  manifestPath?: string
  root: string
  rootPriority: number
  source: string
}

export type PermissionMode = 'read-only' | 'workspace-write' | 'full-access' | 'prompt'

export type PermissionAction = 'allow' | 'deny' | 'ask'

export interface PermissionRule {
  pattern: string
  action: PermissionAction
}

export interface PermissionConfig {
  mode: PermissionMode
  allow: string[]
  deny: string[]
  ask: string[]
  trustedRoots: string[]
}

export type PermissionDecision = 'allowed' | 'denied' | 'needs-approval'

export interface PermissionResult {
  decision: PermissionDecision
  reason: string
  rule?: string
}

export interface SkillRegistry {
  roots: string[]
  skills: SkillDefinition[]
  byId: Map<string, SkillDefinition>
}

export interface RankOptions {
  touchedPaths?: string[]
}

export interface RankedSkill {
  skill: SkillDefinition
  score: number
  reasons: string[]
}

export interface PlannedStep {
  skill: SkillDefinition
  rankScore: number
  reasons: string[]
}

export interface TaskPlan {
  task: string
  score: number
  steps: PlannedStep[]
  candidateSkills: RankedSkill[]
  reasoning: string[]
}

export interface ExecutionContext {
  cwd: string
  task: string
  artifacts: Record<string, unknown>
}

export interface ExecutionStepResult {
  step: PlannedStep
  status: 'executed' | 'manual' | 'blocked' | 'failed'
  stdout?: string
  stderr?: string
  output?: unknown
  artifactsProduced?: Record<string, unknown>
  delegatePrompt?: string
  error?: string
}

export interface ExecutionResult {
  plan: TaskPlan
  context: ExecutionContext
  steps: ExecutionStepResult[]
}

export interface AutoFetchConfig {
  enabled: boolean
  threshold: number
  maxResults: number
  knownSources: string[]
  vercelOidcToken?: string
}

export interface DiscoveredSkill {
  id: string
  name: string
  installs: number
  source: string
  skillId: string
}

export interface AutoFetchResult {
  query: string
  apiTier: 'legacy' | 'v1'
  found: DiscoveredSkill[]
  downloaded: string[]
  skipped: string[]
  errors: string[]
  permissionsBlocked?: string[]
}

export interface RuntimeConfig {
  skillRoots: string[]
  plannerTopK: number
  maxPlanSteps: number
  autoFetch?: Partial<AutoFetchConfig>
  permissions?: Partial<PermissionConfig>
}
