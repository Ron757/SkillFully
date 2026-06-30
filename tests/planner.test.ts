import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { buildPlan } from '../src/planner.js'
import { loadRegistry } from '../src/registry.js'

test('builds a short chain for research and drafting tasks', () => {
  const cwd = process.cwd()
  const registry = loadRegistry(cwd, {
    skillRoots: [join(cwd, 'tests', 'fixtures', 'skills')],
    plannerTopK: 8,
    maxPlanSteps: 3,
  })

  const plan = buildPlan(
    'research the market and then draft a short brief',
    registry,
    {},
    { skillRoots: [], plannerTopK: 8, maxPlanSteps: 3 },
  )

  expect(plan.steps.length).toBeGreaterThanOrEqual(2)
  expect(plan.steps[0]?.skill.id).toBe('research-web')
  expect(plan.steps[plan.steps.length - 1]?.skill.id).toBe('draft-brief')
})
