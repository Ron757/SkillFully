import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { parseMarkdownWithFrontmatter, toStringArray } from './frontmatter.js'

type ImportedSkillRecord = {
  id: string
  name: string
  sourcePath: string
  targetDir: string
}

export interface ImportResult {
  source: 'openclaude' | 'claw-compatible'
  imported: ImportedSkillRecord[]
  skipped: string[]
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ensureCleanDir(path: string): void {
  rmSync(path, { recursive: true, force: true })
  mkdirSync(path, { recursive: true })
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"`]|['"`]$/g, '')
}

function readQuotedValue(
  source: string,
  quoteIndex: number,
): { value: string; endIndex: number } | undefined {
  const quote = source[quoteIndex]
  if (!quote || ![`'`, '"', '`'].includes(quote)) {
    return undefined
  }

  let value = ''
  let escaped = false

  for (let index = quoteIndex + 1; index < source.length; index += 1) {
    const char = source[index]!

    if (escaped) {
      value += char
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (char === quote) {
      return { value, endIndex: index }
    }

    value += char
  }

  return undefined
}

function extractObjectLiteralValue(source: string, property: string): string | undefined {
  const propertyMatch = source.match(new RegExp(`${property}:`, 'm'))
  if (!propertyMatch || propertyMatch.index === undefined) {
    return undefined
  }

  for (let index = propertyMatch.index + propertyMatch[0].length; index < source.length; index += 1) {
    const char = source[index]!
    if (char === "'" || char === '"' || char === '`') {
      return readQuotedValue(source, index)?.value.trim()
    }
    if (char === ',' || char === '\n') {
      continue
    }
  }

  return undefined
}

function extractTemplateConstants(source: string): { name: string; value: string }[] {
  const results: { name: string; value: string }[] = []
  const matcher = /const\s+([A-Z0-9_]+)\s*=\s*/g

  for (const match of source.matchAll(matcher)) {
    const name = match[1]!
    const start = (match.index ?? 0) + match[0].length
    const quoteIndex = source.slice(start).search(/['"`]/)
    if (quoteIndex === -1) {
      continue
    }

    const parsed = readQuotedValue(source, start + quoteIndex)
    if (!parsed) {
      continue
    }

    if (parsed.value.trim().length > 40) {
      results.push({ name, value: parsed.value.trim() })
    }
  }

  return results
}

function createMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const lines = ['---']
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) {
        lines.push(`  - ${String(item)}`)
      }
      continue
    }
    lines.push(`${key}: ${JSON.stringify(value)}`)
  }
  lines.push('---', '', body.trim(), '')
  return lines.join('\n')
}

function collectOpenClaudeBundledFiles(openClaudeRoot: string): string[] {
  const bundledDir = join(openClaudeRoot, 'src', 'skills', 'bundled')
  if (!existsSync(bundledDir)) {
    return []
  }
  return readdirSync(bundledDir)
    .filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'index.ts')
    .map(name => join(bundledDir, name))
    .filter(path => readFileSync(path, 'utf8').includes('registerBundledSkill({'))
    .sort()
}

export function importOpenClaudeBundledSkills(projectRoot: string, sourceDir: string): ImportResult {
  const resolvedSource = resolve(projectRoot, sourceDir)
  const targetBase = join(projectRoot, 'skills', 'imported', 'openclaude')
  ensureCleanDir(targetBase)

  const imported: ImportedSkillRecord[] = []
  const skipped: string[] = []

  for (const file of collectOpenClaudeBundledFiles(resolvedSource)) {
    const source = readFileSync(file, 'utf8')
    const registrationIndex = source.indexOf('registerBundledSkill({')
    const registrationSection =
      registrationIndex === -1 ? source : source.slice(registrationIndex)
    const rawName = extractObjectLiteralValue(registrationSection, 'name')
    const rawDescription = extractObjectLiteralValue(registrationSection, 'description')

    if (!rawName || !rawDescription) {
      skipped.push(`${file} (missing name/description)`)
      continue
    }

    const skillSlug = slugify(stripQuotes(rawName))
    const skillId = `openclaude:${skillSlug}`
    const targetDir = join(targetBase, skillSlug)
    mkdirSync(targetDir, { recursive: true })

    const whenToUse = extractObjectLiteralValue(registrationSection, 'whenToUse')
    const argumentHint = extractObjectLiteralValue(registrationSection, 'argumentHint')
    const templateBlocks = extractTemplateConstants(source)
    const promptSections = templateBlocks
      .map(block => `## ${block.name}\n\n${block.value}`)
      .join('\n\n')
    const body = [
      `Imported from OpenClaude bundled skill source: ${file}`,
      '',
      whenToUse ? `When to use: ${whenToUse}` : '',
      argumentHint ? `Argument hint: ${argumentHint}` : '',
      promptSections || 'This bundled skill uses dynamic runtime prompt generation in the source file.',
      '',
      'Review the original TypeScript source if you need the exact runtime behavior.',
    ]
      .filter(Boolean)
      .join('\n')

    const markdown = createMarkdown(
      {
        name: skillId,
        description: stripQuotes(rawDescription),
        tags: ['imported', 'openclaude', 'bundled'],
        capabilities: templateBlocks.map(block => block.name.toLowerCase()),
        triggers: [skillSlug.replace(/-/g, ' ')],
        safe: true,
        chainable: true,
      },
      body,
    )

    writeFileSync(join(targetDir, 'SKILL.md'), markdown, 'utf8')
    writeJson(join(targetDir, 'skill.json'), {
      id: skillId,
      name: stripQuotes(rawName),
      description: stripQuotes(rawDescription),
      tags: ['imported', 'openclaude', 'bundled'],
      examples: whenToUse ? [whenToUse] : [],
      entry: { type: 'prompt', command: [] },
      import: {
        source: 'openclaude',
        sourcePath: file,
      },
    })

    imported.push({
      id: skillId,
      name: stripQuotes(rawName),
      sourcePath: file,
      targetDir,
    })
  }

  return { source: 'openclaude', imported, skipped }
}

function discoverClawCompatibleRoots(explicitRoots: string[] = []): string[] {
  if (explicitRoots.length > 0) {
    return [...new Set(explicitRoots.filter(Boolean))].filter(root => existsSync(root))
  }

  const roots = [
    ...explicitRoots,
    process.env.CLAW_CONFIG_HOME ? join(process.env.CLAW_CONFIG_HOME, 'skills') : '',
    process.env.CODEX_HOME ? join(process.env.CODEX_HOME, 'skills') : '',
    join(homedir(), '.claw', 'skills'),
    join(homedir(), '.codex', 'skills'),
    join(homedir(), '.claude', 'skills'),
  ]

  return [...new Set(roots.filter(Boolean))].filter(root => existsSync(root))
}

function collectSkillDirs(root: string): string[] {
  if (!existsSync(root)) {
    return []
  }
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(root, entry.name))
    .filter(dir => existsSync(join(dir, 'SKILL.md')))
}

export function importClawCompatibleSkills(
  projectRoot: string,
  explicitRoots: string[] = [],
): ImportResult {
  const targetBase = join(projectRoot, 'skills', 'imported', 'claw-compatible')
  ensureCleanDir(targetBase)

  const imported: ImportedSkillRecord[] = []
  const skipped: string[] = []

  for (const root of discoverClawCompatibleRoots(explicitRoots)) {
    for (const skillDir of collectSkillDirs(root)) {
      const skillPath = join(skillDir, 'SKILL.md')
      const markdown = readFileSync(skillPath, 'utf8')
      const { frontmatter } = parseMarkdownWithFrontmatter(markdown)
      const originalName = String(frontmatter.name ?? basename(skillDir))
      const skillSlug = slugify(originalName)
      const skillId = `claw-compatible:${skillSlug}`
      const targetDir = join(targetBase, skillSlug)

      if (existsSync(targetDir)) {
        skipped.push(`${skillPath} (duplicate slug ${skillSlug})`)
        continue
      }

      mkdirSync(targetDir, { recursive: true })
      copyFileSync(skillPath, join(targetDir, 'SKILL.md'))
      const existingSkillJson = join(skillDir, 'skill.json')
      const copiedFiles: string[] = ['SKILL.md']

      if (existsSync(existingSkillJson)) {
        copyFileSync(existingSkillJson, join(targetDir, 'skill.json'))
        copiedFiles.push('skill.json')
      } else {
        writeJson(join(targetDir, 'skill.json'), {
          id: skillId,
          name: originalName,
          description: String(frontmatter.description ?? ''),
          tags: [...toStringArray(frontmatter.tags), 'imported', 'claw-compatible'],
          entry: { type: 'prompt', command: [] },
          import: {
            source: 'claw-compatible',
            sourcePath: skillDir,
            discoveredRoot: root,
          },
        })
        copiedFiles.push('skill.json')
      }

      imported.push({
        id: skillId,
        name: originalName,
        sourcePath: skillDir,
        targetDir,
      })
    }
  }

  return { source: 'claw-compatible', imported, skipped }
}
