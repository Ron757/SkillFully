import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { loadRegistry } from '../src/registry.js'

test('loads fixture skills from a local root', () => {
  const cwd = process.cwd()
  const root = join(cwd, 'tests', 'fixtures', 'skills')
  const registry = loadRegistry(cwd, {
    skillRoots: [root],
    plannerTopK: 8,
    maxPlanSteps: 3,
  })

  expect(registry.skills.length).toBe(4)
  expect(registry.byId.has('research-web')).toBe(true)
  expect(registry.byId.has('summarize-notes')).toBe(true)
  expect(registry.byId.has('draft-brief')).toBe(true)
})
