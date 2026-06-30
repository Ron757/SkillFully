import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { executePlan } from '../src/executor.js'
import { loadRegistry } from '../src/registry.js'

test('executes shell-backed skills and parses JSON output', async () => {
  const cwd = process.cwd()
  const registry = loadRegistry(cwd, {
    skillRoots: [join(cwd, 'tests', 'fixtures', 'skills')],
    plannerTopK: 8,
    maxPlanSteps: 3,
  })

  const result = await executePlan(registry, 'emit a json status report', cwd)
  const executed = result.steps.find(step => step.status === 'executed')

  expect(executed).toBeDefined()
  expect(result.context.artifacts.script_output).toBeDefined()
})
