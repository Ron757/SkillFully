# SkillFully

A skill orchestration layer for coding agents. Loads skills from disk, routes tasks to them, executes script-backed skills, and gates everything through a permission system.

Works as an **MCP server** (any MCP host: Cursor, Codex, Gemini CLI) or as a **standalone CLI**.

---

## Installation

```bash
npm install -g @ron757/skillfully
```

Or without installing:

```bash
npx -p @ron757/skillfully skillfully-mcp
```

Requires [Node.js 18+](https://nodejs.org) or [Bun](https://bun.sh).

## One-command setup

```bash
npx -p @ron757/skillfully skillfully --setup
```

This prints the MCP config snippet for your host (Cursor, Codex, Gemini CLI, etc.):

```
──────── Cursor / VS Code (.cursor/mcp.json) ────────
{
  "mcpServers": {
    "skillfully": {
      "command": "npx",
      "args": ["-p", "@ron757/skillfully", "skillfully-mcp"]
    }
  }
}
```

Paste that into your MCP config file. Done.

## Usage

### MCP server

```bash
npx skillfully-mcp
```

The host calls tools, the server responds. Supported tools:

| Tool | What it does |
|------|-------------|
| `skills_init` | Call at chat/thread start — returns guardrails, skills, config state |
| `skills_list` | List all loaded skills |
| `skills_get` | Get one skill by id (instructions + metadata) |
| `skills_plan` | Find best skill(s) for a task from local registry |
| `skills_run` | Plan + execute a task |
| `skills_search_sh` | Search skills.sh catalog |
| `skills_auto_fetch` | Auto-download best-matching skill from skills.sh |
| `skills_permissions` | Check current policy, test a tool or skill |
| `skills_import_from_skills_sh` | Import skills via skills.sh CLI |

### CLI

```bash
# List loaded skills
skillfully skills list

# Find a skill for a task
skillfully plan "research topic and draft notes"

# Run a task end-to-end
skillfully run "emit a status report"

# Search skills.sh
skillfully search "frontend design system"

# Auto-fetch best-matching skill
skillfully auto-fetch "generate SVG icons"

# Install a skill from disk
skillfully install /path/to/skill

# Import from other skill sources
skillfully import all
skillfully import skills.sh vercel-labs/agent-skills --list
skillfully import skills.sh vercel-labs/agent-skills --skill frontend-design
```

`skillfully` and `skills` are both available — use whichever you prefer.

---

## For Cursor / Codex / Gemini CLI

Run `npx -p @ron757/skillfully skillfully --setup` once per project — it prints the exact config snippet to paste into your MCP settings. No absolute paths needed.

At the **start of every chat thread**, the host calls `skills_init` to set up guardrails and confirm readiness. This returns:

```json
{
  "guardrails": { "mode": "full-access", "deny": 0, "allow": 0 },
  "skills": { "count": 17, "roots": ["..."], "dangerSummary": { "none": 17 } },
  "autoFetch": { "enabled": false }
}
```

The host can pass an optional `mode` override to restrict permissions for a specific session:

```
skills_init({ mode: "read-only" })
```

This makes guardrails **universally applied** — every MCP host gets the same enforcement.

---

## Permissions & Guardrails

Four modes, ordered from least to most permissive:

| Mode | What's allowed |
|------|---------------|
| `read-only` | Read files and search only |
| `workspace-write` | Read + write files; no shell/network |
| `full-access` | All tools, all operations |
| `prompt` | Everything requires approval (MCP limitation: returns `needs-approval`, no interactive prompt) |

**Tool requirements** (hardcoded):

| Tool | Needs mode |
|------|-----------|
| `bash`, `shell`, `exec`, `network`, `mcp` | `full-access` |
| `write_file`, `edit_file`, `file:write` | `workspace-write` |
| `read_file`, `grep`, `glob`, `file:read` | `read-only` |

**Custom rules** in `skill-layer.config.json`:

```json
{
  "permissions": {
    "mode": "full-access",
    "deny": ["bash(rm *)", "bash(> *)"],
    "allow": ["bash(git *)"],
    "ask": ["bash(deploy *)"]
  }
}
```

Rules are evaluated first-match: deny → allow → ask. Custom rules take priority over hardcoded tool requirements.

**Skill-level security** is embedded in each skill's `SKILL.md` frontmatter or `skill.json`:

```yaml
security_danger_level: moderate
security_requires_tools:
  - bash
```

Entry types get automatic defaults: `shell` → moderate, `node`/`bun` → low, `prompt` → none.

Execution is gated through `PermissionEnforcer.checkSkill()` — if a skill's required tools exceed the session mode, it's blocked with a reason.

---

## Auto-Fetch from skills.sh

When the local registry doesn't have a matching skill, call `skills_auto_fetch`:

```
skills_auto_fetch({ task: "optimize images in a directory" })
```

What it does:

1. Searches skills.sh API (v1 with OIDC token if available, legacy public API otherwise)
2. Scores results by relevance + install count
3. Skips already-installed skills (by name, id, or source match)
4. Downloads top matches into `./skills/`

**No repeated downloads:**
- Search results cached for 60s per query
- Already-downloaded skills tracked per session (`DOWNLOADED_SET`)
- Already-installed skills skipped via registry check

**Rate-limited:** same query within 60s returns cached results — no API call.

---

## Skill Format

```
skills/my-skill/
  SKILL.md
```

Example `SKILL.md`:

```markdown
---
name: my-skill
description: Short summary
tags: [research]
capabilities: [gather_information]
triggers: [research]
---

Use this skill when you need to gather information and return concise notes.
```

Optional `skill.json` alongside the markdown file for execution metadata:

```json
{
  "entry": {
    "type": "shell",
    "command": ["/bin/sh", "scripts/run.sh"]
  },
  "security": {
    "dangerLevel": "moderate",
    "requiresTools": ["bash"]
  }
}
```

Skill scan order (configurable in `skill-layer.config.json`):

- `./skills`
- `./.agents/skills`
- `./.codex/skills`
- `./.claude/skills`
- `./.claw/skills`

Override with `SKILL_LAYER_SKILL_ROOTS=/path/a,/path/b` or `SKILL_LAYER_INCLUDE_HOME_ROOTS=true` for `~/.codex/skills` etc.

---

## Configuration

All in `skill-layer.config.json` at the project root:

```json
{
  "skillRoots": ["./skills", "./.agents/skills"],
  "plannerTopK": 8,
  "maxPlanSteps": 3,
  "autoFetch": {
    "enabled": false,
    "threshold": 20,
    "maxResults": 5,
    "knownSources": ["vercel-labs/agent-skills"]
  },
  "permissions": {
    "mode": "full-access",
    "allow": [],
    "deny": [],
    "ask": [],
    "trustedRoots": []
  }
}
```

Env overrides:

| Env var | Overrides |
|---------|-----------|
| `SKILL_LAYER_SKILL_ROOTS` | Comma-separated extra skill roots |
| `SKILL_LAYER_INCLUDE_HOME_ROOTS` | `true` to add `~/.config/agents/skills` etc. |
| `SKILL_LAYER_PERMISSION_MODE` | Permission mode override |
| `SKILLS_SH_OIDC_TOKEN` | OIDC token for skills.sh v1 API |
| `VERCEL_OIDC_TOKEN` | Alternate OIDC token |

---

## Security Boundaries

### Threat model

The permission system assumes the **MCP host (agent)** may send malicious or
incorrect tool calls. It does **not** protect against:

- A compromised Host → can call any tool the server exposes
- A malicious skill author → can embed dangerous instructions that the host
  follows blindly
- Side-channel data exfiltration through allowed tools (e.g. reading files
  is allowed in `read-only` mode, so file content can be leaked through the
  host's response)

What it does protect against:

| Threat | How it's blocked |
|--------|-----------------|
| Agent deletes files | Deny rule `bash(rm *)` or restrict to `workspace-write` |
| Agent runs arbitrary shell | Requires `full-access` mode |
| Skill with dangerous tools executes in low-permission session | `checkSkill()` gates by required tool level + danger level |
| Unfettered internet access | `network` requires `full-access` |

### Mode lifecycle

1. Default mode loaded from `skill-layer.config.json` (or env override)
2. Host can **further restrict** mode per-session via `skills_init({ mode })`
3. Attempts to escalate mode are ignored — the session starts at the most
   restrictive of (config, env, host override)

### Enforcing at the boundary

The permission check runs server-side, **before** any tool or skill
execution. The host cannot bypass the check — it only learns the `decision`
(`allowed` / `denied` / `needs-approval`).

---

## Architecture

```
Host (Cursor/Codex/Gemini CLI)
  │ MCP stdio
  ▼
skills-mvp (MCP server)
  ├─ loadConfig()     ← skill-layer.config.json + env
  ├─ loadRegistry()   ← scans roots, parses SKILL.md + skill.json
  ├─ PermissionEnforcer → gates every tool call and skill execution
  ├─ buildPlan()      ← scores skills by metadata relevance
  ├─ executePlan()    ← runs script skills, returns prompt skills
  └─ auto-fetch       ← skills.sh API search + download
```

See also:
- [docs/skill-schema.md](docs/skill-schema.md) — full skill field reference
- [docs/importing-skills.md](docs/importing-skills.md) — importing from OpenClaude / Claw
- [docs/codex-mcp.md](docs/codex-mcp.md) — connecting to Codex specifically
