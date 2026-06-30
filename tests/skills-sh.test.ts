import { expect, test } from 'bun:test'
import { buildSkillsShAddCommand } from '../src/skills-sh.js'

test('builds a codex-scoped skills.sh install command with safe defaults', () => {
  const command = buildSkillsShAddCommand('vercel-labs/agent-skills', [
    '--skill',
    'frontend-design',
  ])

  expect(command).toEqual([
    'skills',
    'add',
    'vercel-labs/agent-skills',
    '-a',
    'codex',
    '--copy',
    '-y',
    '--skill',
    'frontend-design',
  ])
})

test('preserves explicit flags when provided', () => {
  const command = buildSkillsShAddCommand('openai/skills', [
    '--all',
    '--agent',
    'codex',
    '--copy',
    '--yes',
  ])

  expect(command).toEqual([
    'skills',
    'add',
    'openai/skills',
    '--all',
    '--agent',
    'codex',
    '--copy',
    '--yes',
  ])
})

test('requires an explicit skill selection unless listing', () => {
  expect(() => buildSkillsShAddCommand('vercel-labs/agent-skills', [])).toThrow(
    'Specify --skill <name> or --all when importing from skills.sh. Use --list first to discover available skills.',
  )
})

test('allows list mode without install-only defaults', () => {
  const command = buildSkillsShAddCommand('vercel-labs/agent-skills', ['--list'])

  expect(command).toEqual(['skills', 'add', 'vercel-labs/agent-skills', '--list'])
})
