import { cwd } from 'node:process'
import { autoFetchSkills, searchSkillsSh } from './auto-fetch.js'
import { loadConfig } from './config.js'
import { executePlan } from './executor.js'
import { PermissionEnforcer, PermissionPolicy } from './permissions.js'
import type { PermissionMode } from './types.js'
import { buildPlan } from './planner.js'
import { loadRegistry } from './registry.js'
import { runSkillsShAddCommand } from './skills-sh.js'

type JsonRpcId = string | number | null

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

function encodeMessage(message: unknown): string {
  const json = JSON.stringify(message)
  return `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`
}

function writeMessage(message: unknown): void {
  process.stdout.write(encodeMessage(message))
}

function writeResult(id: JsonRpcId, result: unknown): void {
  writeMessage({ jsonrpc: '2.0', id, result })
}

function writeError(id: JsonRpcId, code: number, message: string): void {
  writeMessage({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  })
}

function toolDefinitions() {
  return [
    {
      name: 'skills_list',
      description: 'List all loaded skills from the skills MVP registry.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'skills_get',
      description: 'Get one skill by id, including its instructions and metadata.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
    {
      name: 'skills_plan',
      description: 'Build a short skill plan for a task using the local registry.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          touched_paths: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['task'],
        additionalProperties: false,
      },
    },
    {
      name: 'skills_run',
      description: 'Plan and execute a task through the skills MVP. Prompt skills return delegate prompts; script skills execute directly.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
        },
        required: ['task'],
        additionalProperties: false,
      },
    },
    {
      name: 'skills_import_from_skills_sh',
      description: 'Use skills.sh to list or import external skills into the current project, then refresh the local skills registry.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          args: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['source'],
        additionalProperties: false,
      },
    },
    {
      name: 'skills_search_sh',
      description: 'Search the skills.sh catalog for skills matching a query.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    {
      name: 'skills_auto_fetch',
      description: 'Search skills.sh, find the best-matching skill for a task, download it, and refresh the registry.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
        },
        required: ['task'],
        additionalProperties: false,
      },
    },
    {
      name: 'skills_permissions',
      description: 'Get the current permission policy configuration and check whether a skill or tool is allowed.',
      inputSchema: {
        type: 'object',
        properties: {
          skill_id: { type: 'string' },
          tool: { type: 'string' },
          tool_input: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'skills_init',
      description: 'Initialize or verify the skills MVP session. Call at start of every chat/thread in Cursor/Codex/Gemini CLI to set up guardrails and confirm readiness. Returns current permission mode, config status, and skill registry state.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['read-only', 'workspace-write', 'full-access', 'prompt'],
            description: 'Optional permission mode override for this session. Overrides config file and env var.',
          },
        },
        additionalProperties: false,
      },
    },
  ]
}

let sessionModeOverride: PermissionMode | undefined

function effectiveConfig(projectCwd: string) {
  const config = loadConfig(projectCwd)
  if (sessionModeOverride) {
    config.permissions = { ...config.permissions, mode: sessionModeOverride }
  }
  return config
}

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  const projectCwd = cwd()
  const config = effectiveConfig(projectCwd)
  const registry = loadRegistry(projectCwd, config)

  if (name === 'skills_list') {
    return {
      roots: registry.roots,
      skills: registry.skills.map(skill => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
      })),
    }
  }

  if (name === 'skills_get') {
    const id = String(args.id ?? '')
    const skill = registry.byId.get(id)
    if (!skill) {
      throw new Error(`Unknown skill: ${id}`)
    }
    return skill
  }

  if (name === 'skills_plan') {
    return buildPlan(String(args.task ?? ''), registry, {
      touchedPaths: Array.isArray(args.touched_paths)
        ? args.touched_paths.map(value => String(value))
        : [],
    })
  }

  if (name === 'skills_run') {
    return executePlan(registry, String(args.task ?? ''), projectCwd, config.permissions)
  }

  if (name === 'skills_search_sh') {
    const query = String(args.query ?? '').trim()
    const limit = typeof args.limit === 'number' ? args.limit : 10
    const { apiTier, skills } = await searchSkillsSh(query, limit, config.autoFetch?.vercelOidcToken)
    return { query, apiTier, skills, count: skills.length }
  }

  if (name === 'skills_auto_fetch') {
    const enforcer = new PermissionEnforcer(new PermissionPolicy(config.permissions))
    const fetchCheck = enforcer.checkTool('network', `skills.sh auto-fetch`)
    if (fetchCheck.decision !== 'allowed') {
      throw new Error(`skills_auto_fetch blocked: ${fetchCheck.reason}`)
    }
    const task = String(args.task ?? '').trim()
    const result = await autoFetchSkills(task, registry, config.autoFetch!, projectCwd, config.permissions)
    return result
  }

  if (name === 'skills_permissions') {
    const enforcer = new PermissionEnforcer(new PermissionPolicy(config.permissions))
    const response: Record<string, unknown> = {
      mode: enforcer.policy.mode,
      trustedRoots: enforcer.policy.trustedRoots,
      skillCount: registry.skills.length,
    }

    const skillId = String(args.skill_id ?? '')
    if (skillId && registry.byId.has(skillId)) {
      const skill = registry.byId.get(skillId)!
      response.skillCheck = {
        id: skill.id,
        security: skill.security,
        result: enforcer.checkSkill(skill),
      }
    }

    if (args.tool) {
      response.toolCheck = enforcer.checkTool(String(args.tool), String(args.tool_input ?? ''))
    }

    return response
  }

  if (name === 'skills_init') {
    const modeOverride = String(args.mode ?? '').trim()
    const validModes: readonly string[] = ['read-only', 'workspace-write', 'full-access', 'prompt'] as const
    sessionModeOverride = modeOverride && validModes.includes(modeOverride)
      ? (modeOverride as PermissionMode)
      : undefined
    const effectiveMode = sessionModeOverride ?? (config.permissions?.mode || 'full-access')
    const enforcer = new PermissionEnforcer(new PermissionPolicy({
      ...config.permissions,
      mode: effectiveMode as PermissionMode,
    }))

    const guardrails = {
      mode: effectiveMode,
      deny: config.permissions?.deny?.length ?? 0,
      allow: config.permissions?.allow?.length ?? 0,
      ask: config.permissions?.ask?.length ?? 0,
    }

    const dangerSummary = { none: 0, low: 0, moderate: 0, high: 0, critical: 0 }
    for (const skill of registry.skills) {
      const level = skill.security?.dangerLevel ?? 'none'
      dangerSummary[level] = (dangerSummary[level] ?? 0) + 1
    }

    return {
      ready: true,
      guardrails,
      skills: {
        count: registry.skills.length,
        roots: registry.roots,
        dangerSummary,
      },
      autoFetch: {
        enabled: config.autoFetch?.enabled ?? false,
        maxResults: config.autoFetch?.maxResults ?? 5,
      },
      server: {
        name: 'skills-mvp',
        version: '0.1.0',
      },
    }
  }

  if (name === 'skills_import_from_skills_sh') {
    const enforcer = new PermissionEnforcer(new PermissionPolicy(config.permissions))
    const importCheck = enforcer.checkTool('network', `skills.sh ${args.source}`)
    if (importCheck.decision !== 'allowed') {
      throw new Error(`skills_import_from_skills_sh blocked: ${importCheck.reason}`)
    }
    const source = String(args.source ?? '').trim()
    const forwardedArgs = Array.isArray(args.args) ? args.args.map(value => String(value)) : []
    const beforeIds = new Set(registry.skills.map(skill => skill.id))
    const commandResult = await runSkillsShAddCommand(source, forwardedArgs, projectCwd)
    const refreshed = loadRegistry(projectCwd, loadConfig(projectCwd))
    const addedSkills = refreshed.skills
      .filter(skill => !beforeIds.has(skill.id))
      .map(skill => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
      }))

    return {
      source,
      args: forwardedArgs,
      roots: refreshed.roots,
      skillCountBefore: registry.skills.length,
      skillCountAfter: refreshed.skills.length,
      addedSkills,
      commandStdout: commandResult.stdout,
      commandStderr: commandResult.stderr,
    }
  }

  throw new Error(`Unknown tool: ${name}`)
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  const id = request.id ?? null

  try {
    switch (request.method) {
      case 'initialize':
        process.stderr.write('SkillFully ready — run `npx skillfully --setup` for MCP config\n')
        writeResult(id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            experimental: {
              permissions: true,
              autoFetch: true,
            },
          },
          serverInfo: {
            name: 'skillfully',
            version: '0.1.0',
          },
        })
        return
      case 'notifications/initialized':
        return
      case 'ping':
        writeResult(id, {})
        return
      case 'tools/list':
        writeResult(id, { tools: toolDefinitions() })
        return
      case 'tools/call': {
        const params = request.params ?? {}
        const name = String(params.name ?? '')
        const args = (params.arguments as Record<string, unknown> | undefined) ?? {}
        const result = await handleToolCall(name, args)
        writeResult(id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        })
        return
      }
      default:
        if (id !== null) {
          writeError(id, -32601, `Method not found: ${request.method}`)
        }
    }
  } catch (error) {
    writeError(id, -32000, error instanceof Error ? error.message : String(error))
  }
}

let buffer = Buffer.alloc(0)

process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, Buffer.from(chunk)])

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) {
      return
    }

    const headerText = buffer.slice(0, headerEnd).toString('utf8')
    const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i)
    if (!contentLengthMatch) {
      buffer = Buffer.alloc(0)
      return
    }

    const contentLength = Number.parseInt(contentLengthMatch[1]!, 10)
    const messageStart = headerEnd + 4
    const messageEnd = messageStart + contentLength
    if (buffer.length < messageEnd) {
      return
    }

    const payload = buffer.slice(messageStart, messageEnd).toString('utf8')
    buffer = buffer.slice(messageEnd)

    const request = JSON.parse(payload) as JsonRpcRequest
    void handleRequest(request)
  }
})
