import { expect, test } from 'bun:test'
import { PermissionEnforcer, PermissionPolicy, buildRules } from '../src/permissions.js'
import type { SkillDefinition } from '../src/types.js'

function makeSkill(overrides?: Partial<SkillDefinition>): SkillDefinition {
  return {
    id: 'test-skill',
    name: 'Test Skill',
    description: 'A test skill',
    instructions: 'Do the thing',
    tags: [],
    capabilities: [],
    triggers: [],
    examples: [],
    domains: [],
    consumes: [],
    produces: [],
    paths: [],
    safe: true,
    chainable: true,
    entry: { type: 'prompt', command: [] },
    security: { requiresTools: [], dangerLevel: 'none' },
    skillDir: '',
    skillMdPath: '',
    root: '',
    rootPriority: 0,
    source: '',
    ...overrides,
  }
}

// ── Mode hierarchy ──

test('read-only allows read_file, denies bash', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'read-only', allow: [], deny: [], ask: [], trustedRoots: [] }))
  expect(e.checkTool('read_file', 'x.txt').decision).toBe('allowed')
  expect(e.checkTool('bash', 'ls').decision).toBe('denied')
})

test('workspace-write allows write_file, denies bash', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'workspace-write', allow: [], deny: [], ask: [], trustedRoots: [] }))
  expect(e.checkTool('write_file', 'x.txt').decision).toBe('allowed')
  expect(e.checkTool('read_file', 'x.txt').decision).toBe('allowed')
  expect(e.checkTool('bash', 'ls').decision).toBe('denied')
})

test('full-access allows bash', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'full-access', allow: [], deny: [], ask: [], trustedRoots: [] }))
  expect(e.checkTool('bash', 'ls').decision).toBe('allowed')
  expect(e.checkTool('write_file', 'x.txt').decision).toBe('allowed')
  expect(e.checkTool('read_file', 'x.txt').decision).toBe('allowed')
})

test('prompt mode returns needs-approval for everything', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'prompt', allow: [], deny: [], ask: [], trustedRoots: [] }))
  expect(e.checkTool('read_file', 'x.txt').decision).toBe('needs-approval')
  expect(e.checkTool('bash', 'ls').decision).toBe('needs-approval')
})

// ── Custom rules ──

test('deny rule blocks matching tool', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'full-access', allow: [], deny: ['bash(rm *)'], ask: [], trustedRoots: [] }))
  expect(e.checkTool('bash', 'rm -rf /').decision).toBe('denied')
  expect(e.checkTool('bash', 'git status').decision).toBe('allowed')
})

test('allow rule overrides deny', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({
    mode: 'full-access',
    deny: ['bash(rm *)'],
    allow: ['bash(git *)'],
    ask: [],
    trustedRoots: [],
  }))
  expect(e.checkTool('bash', 'git push').decision).toBe('allowed')
  expect(e.checkTool('bash', 'rm file').decision).toBe('denied')
})

test('ask rule returns needs-approval', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'full-access', allow: [], deny: [], ask: ['bash(deploy *)'], trustedRoots: [] }))
  expect(e.checkTool('bash', 'deploy prod').decision).toBe('needs-approval')
})

test('wildcard * matches prefix', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'full-access', allow: [], deny: ['bash(rm *)'], ask: [], trustedRoots: [] }))
  expect(e.checkTool('bash', 'rm -f /etc/passwd').decision).toBe('denied')
  expect(e.checkTool('bash', 'mv file').decision).toBe('allowed')
})

test('pattern with :* prefix matching', () => {
  const e2 = new PermissionEnforcer(new PermissionPolicy({ mode: 'full-access', allow: [], deny: ['bash(git:*)'], ask: [], trustedRoots: [] }))
  expect(e2.checkTool('bash', 'git: push').decision).toBe('denied')
  expect(e2.checkTool('bash', 'git:status').decision).toBe('denied')
  expect(e2.checkTool('bash', 'npm install').decision).toBe('allowed')
})

test('empty input matches tool-only rules', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'full-access', allow: [], deny: ['bash'], ask: [], trustedRoots: [] }))
  expect(e.checkTool('bash', '').decision).toBe('denied')
})

test('ask rule format with wildcard', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'full-access', allow: [], deny: [], ask: ['bash(*)'], trustedRoots: [] }))
  expect(e.checkTool('bash', 'anything').decision).toBe('needs-approval')
})

// ── Unknown tools ──

test('unknown tools have no requirement and are allowed', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'read-only', allow: [], deny: [], ask: [], trustedRoots: [] }))
  expect(e.checkTool('unknown_tool', '').decision).toBe('allowed')
  expect(e.checkTool('some_random_tool', 'data').decision).toBe('allowed')
})

// ── Skill authorization ──

test('read-only mode denies shell skill', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'read-only', allow: [], deny: [], ask: [], trustedRoots: [] }))
  const skill = makeSkill({ entry: { type: 'shell', command: ['sh', 'script.sh'] }, security: { requiresTools: ['bash'], dangerLevel: 'moderate' } })
  expect(e.checkSkill(skill).decision).toBe('denied')
})

test('read-only mode allows prompt skill', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'read-only', allow: [], deny: [], ask: [], trustedRoots: [] }))
  const skill = makeSkill({ entry: { type: 'prompt', command: [] }, security: { requiresTools: [], dangerLevel: 'none' } })
  expect(e.checkSkill(skill).decision).toBe('allowed')
})

test('full-access mode allows all skills', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'full-access', allow: [], deny: [], ask: [], trustedRoots: [] }))
  const shell = makeSkill({ entry: { type: 'shell', command: ['sh', 'run.sh'] }, security: { requiresTools: ['bash'], dangerLevel: 'high' } })
  const prompt = makeSkill({ entry: { type: 'prompt', command: [] }, security: { requiresTools: [], dangerLevel: 'none' } })
  expect(e.checkSkill(shell).decision).toBe('allowed')
  expect(e.checkSkill(prompt).decision).toBe('allowed')
})

test('danger level affects required mode', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'workspace-write', allow: [], deny: [], ask: [], trustedRoots: [] }))
  const moderate = makeSkill({ security: { requiresTools: [], dangerLevel: 'moderate' } })
  const critical = makeSkill({ security: { requiresTools: [], dangerLevel: 'critical' } })
  expect(e.checkSkill(moderate).decision).toBe('allowed')
  expect(e.checkSkill(critical).decision).toBe('denied')
})

test('skill with bash requires full-access', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'workspace-write', allow: [], deny: [], ask: [], trustedRoots: [] }))
  const skill = makeSkill({ security: { requiresTools: ['bash'], dangerLevel: 'low' } })
  expect(e.checkSkill(skill).decision).toBe('denied')
})

// ── filterSkills ──

test('filterSkills removes denied skills', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'read-only', allow: [], deny: [], ask: [], trustedRoots: [] }))
  const skills = [
    makeSkill({ id: 'safe', security: { requiresTools: [], dangerLevel: 'none' } }),
    makeSkill({ id: 'risky', entry: { type: 'shell', command: ['sh', 'x.sh'] }, security: { requiresTools: ['bash'], dangerLevel: 'moderate' } }),
  ]
  const filtered = e.filterSkills(skills)
  expect(filtered.length).toBe(1)
  expect(filtered[0]!.id).toBe('safe')
})

test('filterRanked filters by skill', () => {
  const e = new PermissionEnforcer(new PermissionPolicy({ mode: 'read-only', allow: [], deny: [], ask: [], trustedRoots: [] }))
  const ranked = [
    { skill: makeSkill({ id: 'a', security: { requiresTools: [], dangerLevel: 'none' } }), score: 100, reasons: [] },
    { skill: makeSkill({ id: 'b', entry: { type: 'shell', command: ['sh', 'x.sh'] }, security: { requiresTools: ['bash'], dangerLevel: 'moderate' } }), score: 50, reasons: [] },
  ]
  const filtered = e.filterRanked(ranked)
  expect(filtered.length).toBe(1)
  expect(filtered[0]!.skill.id).toBe('a')
})

// ── Trusted roots ──

test('trustedRoots check works', () => {
  const p = new PermissionPolicy({ mode: 'full-access', allow: [], deny: [], ask: [], trustedRoots: ['/home/projects'] })
  expect(p.isWorkspaceTrusted('/home/projects/my-app')).toBe(true)
  expect(p.isWorkspaceTrusted('/tmp/other')).toBe(false)
  expect(p.isWorkspaceTrusted('/home/other')).toBe(false)
})

test('empty trustedRoots trusts everything', () => {
  const p = new PermissionPolicy({ mode: 'full-access', allow: [], deny: [], ask: [], trustedRoots: [] })
  expect(p.isWorkspaceTrusted('/any/path')).toBe(true)
})

// ── buildRules ──

test('buildRules creates rules with correct actions', () => {
  const denyRules = buildRules(['bash(rm *)', 'bash(rmdir *)'], 'deny')
  const allowRules = buildRules(['bash(git *)'], 'allow')
  const askRules = buildRules(['bash(deploy *)'], 'ask')
  expect(denyRules.every(r => r.action === 'deny')).toBe(true)
  expect(denyRules.length).toBe(2)
  expect(allowRules.length).toBe(1)
  expect(allowRules[0]!.pattern).toBe('bash(git *)')
  expect(askRules.length).toBe(1)
  expect(askRules[0]!.action).toBe('ask')
})
