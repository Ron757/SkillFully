import { loadConfig } from './config.js'
import { needsAutoFetch, rankSkills } from './router.js'
import type { PlannedStep, RankOptions, RankedSkill, RuntimeConfig, SkillDefinition, SkillRegistry, TaskPlan } from './types.js'

function canChain(accumulatedOutputs: Set<string>, nextSkill: SkillDefinition): boolean {
  if (nextSkill.consumes.length === 0) {
    return true
  }
  return nextSkill.consumes.every(item => accumulatedOutputs.has(item))
}

function hasChainIntent(task: string): boolean {
  return /\b(and then|then|after|before|chain|pipeline|workflow|research .* draft|scrape .* summarize|analyze .* write)\b/i.test(task)
}

function buildStep(candidate: RankedSkill): PlannedStep {
  return {
    skill: candidate.skill,
    rankScore: candidate.score,
    reasons: candidate.reasons,
  }
}

function scorePlan(steps: RankedSkill[], chainIntent: boolean): number {
  let score = 0
  for (let index = 0; index < steps.length; index += 1) {
    const candidate = steps[index]
    const weight = index === steps.length - 1 ? 1.15 : 0.9
    score += candidate.score * weight
  }
  if (steps.length > 1) {
    score += (steps.length - 1) * (chainIntent ? 18 : 4)
  }
  if (!chainIntent) {
    score -= (steps.length - 1) * 8
  }
  return score
}

export function buildPlan(
  task: string,
  registry: SkillRegistry,
  options: RankOptions = {},
  config: RuntimeConfig = loadConfig(process.cwd()),
): TaskPlan {
  if (registry.skills.length > 0) {
    const ranked = rankSkills(task, registry.skills, options)
    if (!needsAutoFetch(ranked, config.autoFetch?.threshold)) {
      const candidates = ranked.slice(0, config.plannerTopK)
      return buildPlanFromCandidates(task, candidates, config)
    }
  }

  return {
    task,
    score: 0,
    steps: [],
    candidateSkills: [],
    reasoning: ['No matching skills found. Enable auto-fetch or install skills first.'],
  }
}

function buildPlanFromCandidates(
  task: string,
  candidates: RankedSkill[],
  config: RuntimeConfig,
): TaskPlan {

  if (candidates.length === 0) {
    return {
      task,
      score: 0,
      steps: [],
      candidateSkills: [],
      reasoning: ['No matching skills found.'],
    }
  }

  const chainIntent = hasChainIntent(task)
  let bestSteps: RankedSkill[] = [candidates[0]!]
  let bestScore = scorePlan(bestSteps, chainIntent)

  for (const first of candidates) {
    if (first.skill.consumes.length === 0) {
      const outputsAfterFirst = new Set(first.skill.produces)
      const pair = [first]
      const pairScore = scorePlan(pair, chainIntent)
      if (pairScore > bestScore) {
        bestScore = pairScore
        bestSteps = pair
      }

      for (const second of candidates) {
        if (second.skill.id === first.skill.id || !canChain(outputsAfterFirst, second.skill)) {
          continue
        }
        const pairSteps = [first, second]
        const pairPlanScore = scorePlan(pairSteps, chainIntent)
        if (pairPlanScore > bestScore) {
          bestScore = pairPlanScore
          bestSteps = pairSteps
        }

        if (config.maxPlanSteps < 3) {
          continue
        }

        const outputsAfterSecond = new Set([...outputsAfterFirst, ...second.skill.produces])
        for (const third of candidates) {
          if (
            third.skill.id === first.skill.id ||
            third.skill.id === second.skill.id ||
            !canChain(outputsAfterSecond, third.skill)
          ) {
            continue
          }
          const triple = [first, second, third]
          const tripleScore = scorePlan(triple, chainIntent)
          if (tripleScore > bestScore) {
            bestScore = tripleScore
            bestSteps = triple
          }
        }
      }
    }
  }

  const reasoning = [
    `Selected ${bestSteps.length} step${bestSteps.length === 1 ? '' : 's'} from ${candidates.length} ranked candidates.`,
    chainIntent
      ? 'Task wording suggests a chained workflow, so linked skills were favored.'
      : 'Task wording does not strongly imply a chain, so extra steps were penalized.',
  ]

  return {
    task,
    score: bestScore,
    steps: bestSteps.map(buildStep),
    candidateSkills: candidates,
    reasoning,
  }
}
