import type { RankOptions, RankedSkill, SkillDefinition } from './types.js'

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(token => token.trim())
    .filter(token => token.length > 1)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function globToRegex(glob: string): RegExp {
  const pattern = escapeRegex(glob)
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*')
  return new RegExp(`^${pattern}$`, 'i')
}

function pathMatches(patterns: string[], touchedPaths: string[]): boolean {
  if (patterns.length === 0 || touchedPaths.length === 0) {
    return false
  }
  return patterns.some(pattern => {
    const regex = globToRegex(pattern)
    return touchedPaths.some(path => regex.test(path))
  })
}

function skillText(skill: SkillDefinition): string {
  return [
    skill.id,
    skill.name,
    skill.description,
    ...skill.tags,
    ...skill.capabilities,
    ...skill.triggers,
    ...skill.examples,
    ...skill.domains,
    ...skill.consumes,
    ...skill.produces,
  ]
    .join(' ')
    .toLowerCase()
}

export function rankSkills(
  task: string,
  skills: SkillDefinition[],
  options: RankOptions = {},
): RankedSkill[] {
  const taskTokens = tokenize(task)
  return skills
    .map(skill => {
      let score = 0
      const reasons: string[] = []
      const corpus = skillText(skill)

      if (skill.id.toLowerCase() === task.trim().toLowerCase()) {
        score += 60
        reasons.push('exact skill id match')
      }

      if (skill.name.toLowerCase() === task.trim().toLowerCase()) {
        score += 60
        reasons.push('exact skill name match')
      }

      for (const token of taskTokens) {
        if (skill.id.toLowerCase().includes(token)) {
          score += 20
        }
        if (skill.name.toLowerCase().includes(token)) {
          score += 18
        }
        if (skill.tags.some(tag => tag.toLowerCase().includes(token))) {
          score += 12
          reasons.push(`tag matched "${token}"`)
        }
        if (skill.capabilities.some(capability => capability.toLowerCase().includes(token))) {
          score += 14
          reasons.push(`capability matched "${token}"`)
        }
        if (skill.triggers.some(trigger => trigger.toLowerCase().includes(token))) {
          score += 15
          reasons.push(`trigger matched "${token}"`)
        }
        if (skill.examples.some(example => example.toLowerCase().includes(token))) {
          score += 8
        }
        if (corpus.includes(token)) {
          score += 4
        }
      }

      if (pathMatches(skill.paths, options.touchedPaths ?? [])) {
        score += 25
        reasons.push('path pattern matched touched files')
      }

      const precedenceBonus = Math.max(0, 18 - skill.rootPriority * 4)
      if (precedenceBonus > 0) {
        score += precedenceBonus
        reasons.push('preferred skill root precedence')
      }

      return { skill, score, reasons: [...new Set(reasons)] }
    })
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.id.localeCompare(right.skill.id))
}

export function needsAutoFetch(ranked: RankedSkill[], threshold: number = 20): boolean {
  if (ranked.length === 0) return true
  return ranked[0]!.score < threshold
}
