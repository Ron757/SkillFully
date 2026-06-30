import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { loadConfig } from './config.js'
import { firstMeaningfulLine, parseMarkdownWithFrontmatter, toBoolean, toOptionalString, toStringArray } from './frontmatter.js'
import type { DangerLevel, RuntimeConfig, SkillConfig, SkillDefinition, SkillEntry, SkillEntryType, SkillRegistry, SkillSecurity } from './types.js'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ensureEntry(entry: Partial<SkillEntry> | undefined, frontmatter: Record<string, unknown>): SkillEntry {
  const frontmatterType = toOptionalString(frontmatter.entry_type)
  const frontmatterCommand = toOptionalString(frontmatter.entry_command)
    ?.split(/\s+/)
    .filter(Boolean)

  const type = entry?.type ?? (frontmatterType as SkillEntry['type'] | undefined) ?? 'prompt'
  const command = entry?.command ?? frontmatterCommand ?? []
  const cwd = entry?.cwd

  return { type, command, cwd }
}

function mergeConfig(
  markdownFrontmatter: Record<string, unknown>,
  manifest: SkillConfig,
  fallbackId: string,
  skillDir: string,
  skillMdPath: string,
  root: string,
  rootPriority: number,
  cwd: string,
): SkillDefinition {
  const id = manifest.id ?? toOptionalString(markdownFrontmatter.name) ?? fallbackId
  const parsedMarkdown = parseMarkdownWithFrontmatter(readFileSync(skillMdPath, 'utf8'))
  const description =
    manifest.description ??
    toOptionalString(markdownFrontmatter.description) ??
    (firstMeaningfulLine(parsedMarkdown.body) || 'No description provided.')
  const { body } = parsedMarkdown
  const entry = ensureEntry(manifest.entry, markdownFrontmatter)

  const securityRequiresTools =
    manifest.security?.requiresTools ?? toStringArray(markdownFrontmatter.security_requires_tools)
  const securityAllowedCommands = manifest.security?.allowedCommands ?? toStringArray(
    markdownFrontmatter.security_allowed_commands,
  )
  const securityDeniedCommands = manifest.security?.deniedCommands ?? toStringArray(
    markdownFrontmatter.security_denied_commands,
  )
  const frontmatterDanger = markdownFrontmatter.security_danger_level
  const securityDangerLevel: DangerLevel =
    manifest.security?.dangerLevel ??
    (typeof frontmatterDanger === 'string'
      ? (frontmatterDanger as DangerLevel)
      : undefined) ??
    entryDangerLevel(entry.type)

  const security: SkillSecurity = {
    requiresTools:
      securityRequiresTools.length > 0
        ? securityRequiresTools
        : entryDefaultTools(entry.type),
    allowedCommands: securityAllowedCommands.length > 0 ? securityAllowedCommands : undefined,
    deniedCommands: securityDeniedCommands.length > 0 ? securityDeniedCommands : undefined,
    dangerLevel: securityDangerLevel,
  }

  return {
    id,
    name: manifest.name ?? toOptionalString(markdownFrontmatter.name) ?? id,
    description,
    instructions: body,
    tags: manifest.tags ?? toStringArray(markdownFrontmatter.tags),
    capabilities: manifest.capabilities ?? toStringArray(markdownFrontmatter.capabilities),
    triggers: manifest.triggers ?? toStringArray(markdownFrontmatter.triggers),
    examples: manifest.examples ?? toStringArray(markdownFrontmatter.examples),
    domains: manifest.domains ?? toStringArray(markdownFrontmatter.domains),
    consumes: manifest.consumes ?? toStringArray(markdownFrontmatter.consumes),
    produces: manifest.produces ?? toStringArray(markdownFrontmatter.produces),
    paths: manifest.paths ?? toStringArray(markdownFrontmatter.paths),
    safe: manifest.safe ?? toBoolean(markdownFrontmatter.safe, true),
    chainable: manifest.chainable ?? toBoolean(markdownFrontmatter.chainable, true),
    entry,
    security,
    skillDir,
    skillMdPath,
    manifestPath: existsSync(join(skillDir, 'skill.json')) ? join(skillDir, 'skill.json') : undefined,
    root,
    rootPriority,
    source: relative(cwd, skillDir) || skillDir,
  }
}

function loadManifest(skillDir: string): SkillConfig {
  const manifestPath = join(skillDir, 'skill.json')
  if (!existsSync(manifestPath)) {
    return {}
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as SkillConfig
}

function collectSkillFiles(root: string): string[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return []
  }

  const results: string[] = []
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (existsSync(join(fullPath, 'SKILL.md'))) {
          results.push(join(fullPath, 'SKILL.md'))
          continue
        }
        visit(fullPath)
        continue
      }
      if (entry.isFile() && entry.name === 'SKILL.md') {
        results.push(fullPath)
      }
    }
  }

  visit(root)
  return results.sort()
}

function inferSkillId(skillMdPath: string, root: string): string {
  const skillDir = dirname(skillMdPath)
  const rel = relative(root, skillDir)
  return rel.split(/[\\/]+/).filter(Boolean).join(':') || basename(skillDir)
}

export function loadRegistry(cwd: string, config: RuntimeConfig = loadConfig(cwd)): SkillRegistry {
  const roots = config.skillRoots
    .map(root => (isAbsolute(root) ? root : resolve(cwd, root)))
    .filter((root, index, values) => values.indexOf(root) === index)

  const skills: SkillDefinition[] = []
  const byId = new Map<string, SkillDefinition>()

  for (const [rootPriority, root] of roots.entries()) {
    for (const skillMdPath of collectSkillFiles(root)) {
      const skillDir = dirname(skillMdPath)
      const fallbackId = inferSkillId(skillMdPath, root)
      const markdown = readFileSync(skillMdPath, 'utf8')
      const { frontmatter } = parseMarkdownWithFrontmatter(markdown)
      const skill = mergeConfig(
        frontmatter,
        loadManifest(skillDir),
        fallbackId,
        skillDir,
        skillMdPath,
        root,
        rootPriority,
        cwd,
      )
      if (byId.has(skill.id)) {
        continue
      }
      byId.set(skill.id, skill)
      skills.push(skill)
    }
  }

  return { roots, skills, byId }
}

function copyRecursive(source: string, destination: string): void {
  const sourceStats = statSync(source)
  if (sourceStats.isDirectory()) {
    mkdirSync(destination, { recursive: true })
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      copyRecursive(join(source, entry.name), join(destination, entry.name))
    }
    return
  }
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
}

export function installSkill(sourcePath: string, cwd: string, config: RuntimeConfig = loadConfig(cwd)): {
  installedTo: string
  root: string
} {
  const resolvedSource = resolve(cwd, sourcePath)
  if (!existsSync(resolvedSource)) {
    throw new Error(`Skill source does not exist: ${resolvedSource}`)
  }

  const targetRoot = resolve(cwd, config.skillRoots[0] ?? './skills')
  mkdirSync(targetRoot, { recursive: true })

  const stats = statSync(resolvedSource)
  const targetName = slugify(basename(stats.isDirectory() ? resolvedSource : resolvedSource.replace(extname(resolvedSource), '')))
  const targetDir = join(targetRoot, targetName)

  if (existsSync(targetDir)) {
    throw new Error(`Target skill already exists: ${targetDir}`)
  }

  if (stats.isDirectory()) {
    copyRecursive(resolvedSource, targetDir)
  } else {
    mkdirSync(targetDir, { recursive: true })
    copyRecursive(resolvedSource, join(targetDir, 'SKILL.md'))
  }

  return { installedTo: targetDir, root: targetRoot }
}

function entryDefaultTools(type: SkillEntryType): string[] {
  switch (type) {
    case 'shell': return ['shell']
    case 'node': return ['file:write']
    case 'bun': return ['file:write']
    default: return []
  }
}

function entryDangerLevel(type: SkillEntryType): DangerLevel {
  switch (type) {
    case 'shell': return 'moderate'
    case 'node': return 'low'
    case 'bun': return 'low'
    default: return 'none'
  }
}
