import { spawn } from 'node:child_process'
import { loadConfig } from './config.js'
import { PermissionEnforcer, PermissionPolicy } from './permissions.js'
import { buildPlan } from './planner.js'
import type { ExecutionContext, ExecutionResult, ExecutionStepResult, PermissionConfig, PlannedStep, SkillDefinition, SkillRegistry } from './types.js'

function renderPrompt(skill: SkillDefinition, task: string, artifacts: Record<string, unknown>): string {
  const expectedOutputs = skill.produces.length > 0 ? skill.produces.join(', ') : 'none declared'
  return [
    `Skill: ${skill.id}`,
    `Description: ${skill.description}`,
    `Expected outputs: ${expectedOutputs}`,
    '',
    'Task:',
    task,
    '',
    'Current artifacts:',
    JSON.stringify(artifacts, null, 2),
    '',
    'Instructions:',
    skill.instructions,
  ].join('\n')
}

function normalizeArtifacts(skill: SkillDefinition, output: unknown): Record<string, unknown> {
  if (skill.produces.length === 0) {
    return {}
  }

  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const objectOutput = output as Record<string, unknown>
    const picked = Object.fromEntries(
      skill.produces
        .filter(key => key in objectOutput)
        .map(key => [key, objectOutput[key]]),
    )
    if (Object.keys(picked).length > 0) {
      return picked
    }
  }

  if (skill.produces.length === 1) {
    return { [skill.produces[0]!]: output }
  }

  return { [skill.id]: output }
}

async function runScriptStep(
  step: PlannedStep,
  context: ExecutionContext,
  stepIndex: number,
): Promise<ExecutionStepResult> {
  const { skill } = step
  const entry = skill.entry
  const baseCommand =
    entry.type === 'node'
      ? ['node', ...entry.command]
      : entry.type === 'bun'
        ? ['bun', ...entry.command]
        : entry.command

  if (baseCommand.length === 0) {
    return {
      step,
      status: 'failed',
      error: `Skill ${skill.id} has no executable command.`,
    }
  }

  return new Promise(resolve => {
    const child = spawn(baseCommand[0]!, baseCommand.slice(1), {
      cwd: entry.cwd ?? skill.skillDir,
      env: {
        ...process.env,
        SKILL_NAME: skill.id,
        SKILL_TASK: context.task,
        SKILL_STEP_INDEX: String(stepIndex),
        SKILL_INPUT_JSON: JSON.stringify({
          task: context.task,
          consumes: skill.consumes,
          produces: skill.produces,
        }),
        SKILL_ARTIFACTS_JSON: JSON.stringify(context.artifacts),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })

    child.on('close', code => {
      if (code !== 0) {
        resolve({
          step,
          status: 'failed',
          stdout,
          stderr,
          error: `Skill exited with code ${code}.`,
        })
        return
      }

      const trimmed = stdout.trim()
      const output = trimmed ? safeJsonParse(trimmed) : {}
      const artifactsProduced = normalizeArtifacts(skill, output)
      resolve({
        step,
        status: 'executed',
        stdout,
        stderr,
        output,
        artifactsProduced,
      })
    })
  })
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function hasAllInputs(skill: SkillDefinition, artifacts: Record<string, unknown>): boolean {
  return skill.consumes.every(item => item in artifacts)
}

export async function executePlan(
  registry: SkillRegistry,
  task: string,
  cwd: string,
  permissions?: PermissionConfig,
): Promise<ExecutionResult> {
  const config = loadConfig(cwd)
  const plan = buildPlan(task, registry, {}, config)
  const enforcer = new PermissionEnforcer(new PermissionPolicy(permissions ?? config.permissions))
  const context: ExecutionContext = {
    cwd,
    task,
    artifacts: {},
  }

  const steps: ExecutionStepResult[] = []

  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index]!

    const permission = enforcer.checkSkill(step.skill)
    if (permission.decision !== 'allowed') {
      steps.push({
        step,
        status: 'blocked',
        error: `Permission denied: ${permission.reason}`,
      })
      continue
    }

    if (!hasAllInputs(step.skill, context.artifacts)) {
      steps.push({
        step,
        status: 'blocked',
        error: `Missing required artifacts: ${step.skill.consumes.filter(item => !(item in context.artifacts)).join(', ')}`,
      })
      continue
    }

    if (step.skill.entry.type === 'prompt') {
      steps.push({
        step,
        status: 'manual',
        delegatePrompt: renderPrompt(step.skill, task, context.artifacts),
      })
      continue
    }

    const result = await runScriptStep(step, context, index)
    if (result.artifactsProduced) {
      Object.assign(context.artifacts, result.artifactsProduced)
    }
    steps.push(result)
  }

  return { plan, context, steps }
}
