import { cwd } from 'node:process'
import { autoFetchSkills, searchSkillsSh } from './auto-fetch.js'
import { loadConfig } from './config.js'
import { executePlan } from './executor.js'
import {
  importClawCompatibleSkills,
  importOpenClaudeBundledSkills,
} from './importers.js'
import { buildPlan } from './planner.js'
import { installSkill, loadRegistry } from './registry.js'
import { runSkillsShAddCommand } from './skills-sh.js'

type ParsedArgs = {
  positional: string[]
  paths: string[]
  json: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  const paths: string[] = []
  let json = false

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!
    if (value === '--json') {
      json = true
      continue
    }
    if (value === '--path') {
      const next = argv[index + 1]
      if (next) {
        paths.push(next)
        index += 1
      }
      continue
    }
    if (value.startsWith('--path=')) {
      paths.push(value.slice('--path='.length))
      continue
    }
    positional.push(value)
  }

  return { positional, paths, json }
}

function usage(): string {
  return [
    'Usage:',
    '  bun run src/cli.ts skills list',
    '  bun run src/cli.ts skills inspect <skill-id>',
    '  bun run src/cli.ts route "<task>" [--path file.ts]',
    '  bun run src/cli.ts plan "<task>" [--path file.ts] [--json]',
    '  bun run src/cli.ts run "<task>" [--json]',
    '  bun run src/cli.ts search "<query>"',
    '  bun run src/cli.ts auto-fetch "<task>"',
    '  bun run src/cli.ts install /path/to/skill',
    '  bun run src/cli.ts import openclaude',
    '  bun run src/cli.ts import claw-compatible',
    '  bun run src/cli.ts import all',
    '  bun run src/cli.ts import skills.sh <source> --list',
    '  bun run src/cli.ts import skills.sh <source> --skill <name>',
  ].join('\n')
}

function printSkills(): void {
  const registry = loadRegistry(cwd())
  if (registry.skills.length === 0) {
    console.log('No skills found.')
    return
  }

  console.log('Skill roots:')
  for (const root of registry.roots) {
    console.log(`- ${root}`)
  }
  console.log('')
  console.log('Skills:')
  for (const skill of registry.skills) {
    console.log(`- ${skill.id}: ${skill.description}`)
  }
}

function inspectSkill(skillId: string): void {
  const registry = loadRegistry(cwd())
  const skill = registry.byId.get(skillId)
  if (!skill) {
    throw new Error(`Unknown skill: ${skillId}`)
  }
  console.log(
    JSON.stringify(
      {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        entry: skill.entry,
        consumes: skill.consumes,
        produces: skill.produces,
        tags: skill.tags,
        capabilities: skill.capabilities,
        triggers: skill.triggers,
        paths: skill.paths,
        source: skill.source,
      },
      null,
      2,
    ),
  )
}

function printSetup(): void {
  const projectRoot = cwd()
  const config = loadConfig(projectRoot)
  const registry = loadRegistry(projectRoot, config)

  console.log(`SkillFully — project: ${projectRoot}`)
  console.log(`Skills loaded: ${registry.skills.length}`)
  console.log(`Permission mode: ${config.permissions?.mode ?? 'full-access'}`)
  console.log(`Auto-fetch: ${config.autoFetch?.enabled ? 'enabled' : 'disabled'}`)
  console.log()

  const commonSnippet = {
    command: 'skillfully-mcp',
    args: [],
  }

  const cursorSnippet = {
    mcpServers: {
      skillfully: {
        command: 'npx',
        args: ['skillfully-mcp'],
      },
    },
  }

  console.log('──────── MCP config for any host ────────')
  console.log(JSON.stringify(commonSnippet, null, 2))
  console.log()
  console.log('──────── Cursor / VS Code (.cursor/mcp.json) ────────')
  console.log(JSON.stringify(cursorSnippet, null, 2))
  console.log()
  console.log('──────── Codex (~/.codex/config.toml) ────────')
  console.log(`[mcp_servers.skillfully]
command = "npx"
args = ["skillfully-mcp"]`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  // If a single quoted arg like "plan this" is given, split on first space
  if (args.positional.length === 1 && args.positional[0]!.includes(' ')) {
    const spaceIndex = args.positional[0]!.indexOf(' ')
    const first = args.positional[0]!.slice(0, spaceIndex)
    const second = args.positional[0]!.slice(spaceIndex + 1).trim()
    args.positional = [first, second]
  }

  const [command, ...rest] = args.positional

  if (command === '--setup' || command === 'setup') {
    printSetup()
    return
  }

  if (!command) {
    console.log(usage())
    return
  }

  const subcommand = rest[0]
  const subcommandRest = rest.slice(1)

  if (!command) {
    console.log(usage())
    return
  }

  if (command === 'skills' && subcommand === 'list') {
    printSkills()
    return
  }

  if (command === 'skills' && subcommand === 'inspect') {
    inspectSkill(subcommandRest[0] ?? '')
    return
  }

  if (command === 'install') {
    const source = subcommand
    if (!source) {
      throw new Error('Provide a source path to install.')
    }
    const result = installSkill(source, cwd(), loadConfig(cwd()))
    console.log(`Installed skill into ${result.installedTo}`)
    return
  }

  if (command === 'import') {
    const target = subcommand
    if (!target) {
      throw new Error('Provide an import target: openclaude, claw-compatible, all, or skills.sh.')
    }

    if (target === 'skills.sh') {
      const [source, ...forwardedArgs] = subcommandRest
      const commandResult = await runSkillsShAddCommand(source ?? '', forwardedArgs, cwd())
      if (commandResult.stdout.trim()) {
        console.log(commandResult.stdout.trim())
      }
      if (commandResult.stderr.trim()) {
        console.error(commandResult.stderr.trim())
      }
      return
    }

    const results = []
    if (target === 'openclaude' || target === 'all') {
      results.push(importOpenClaudeBundledSkills(cwd(), '../openclaude-main'))
    }
    if (target === 'claw-compatible' || target === 'all') {
      results.push(importClawCompatibleSkills(cwd()))
    }
    if (results.length === 0) {
      throw new Error(`Unknown import target: ${target}`)
    }

    console.log(JSON.stringify(results, null, 2))
    return
  }

  if (command === 'route' || command === 'plan') {
    const task = [subcommand, ...subcommandRest].filter(Boolean).join(' ').trim()
    if (!task) {
      throw new Error('Provide a task to route.')
    }
    const registry = loadRegistry(cwd())
    const plan = buildPlan(task, registry, { touchedPaths: args.paths }, loadConfig(cwd()))
    if (args.json || command === 'plan') {
      console.log(JSON.stringify(plan, null, 2))
      return
    }
    console.log(`Best plan for: ${task}`)
    for (const step of plan.steps) {
      console.log(`- ${step.skill.id}: ${step.skill.description}`)
    }
    return
  }

  if (command === 'run') {
    const task = [subcommand, ...subcommandRest].filter(Boolean).join(' ').trim()
    if (!task) {
      throw new Error('Provide a task to run.')
    }
    const result = await executePlan(loadRegistry(cwd()), task, cwd())
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (command === 'search') {
    const query = [subcommand, ...subcommandRest].filter(Boolean).join(' ').trim()
    if (!query) {
      throw new Error('Provide a search query.')
    }
    const config = loadConfig(cwd())
    const { apiTier, skills } = await searchSkillsSh(query, 10, config.autoFetch?.vercelOidcToken)
    console.log(`API: ${apiTier}, found ${skills.length} skills`)
    for (const skill of skills) {
      console.log(`- ${skill.id} (${skill.installs} installs)`)
    }
    console.log(`\nUse \`skills auto-fetch "${query}"\` to download the best match.`)
    return
  }

  if (command === 'auto-fetch') {
    const task = [subcommand, ...subcommandRest].filter(Boolean).join(' ').trim()
    if (!task) {
      throw new Error('Provide a task to auto-fetch skills for.')
    }
    const config = loadConfig(cwd())
    const registry = loadRegistry(cwd(), config)
    const result = await autoFetchSkills(task, registry, config.autoFetch!, cwd())
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log(usage())
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
