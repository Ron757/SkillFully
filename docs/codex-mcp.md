# MCP Integration

The MCP server lives at [`src/mcp-server.ts`](../src/mcp-server.ts). It communicates over stdio and exposes tools for any MCP-compatible host (Codex, Cursor, Gemini CLI, etc.).

## Tools

| Tool | What it does |
|------|-------------|
| `skills_init` | Start-of-session bootstrap — returns guardrails, registry, config state |
| `skills_list` | List all loaded skills |
| `skills_get` | Get one skill by id (full instructions + metadata) |
| `skills_plan` | Find best skill(s) for a task from local registry |
| `skills_run` | Plan and execute a task through the skill layer |
| `skills_search_sh` | Search the skills.sh catalog |
| `skills_auto_fetch` | Auto-download the best-matching skill from skills.sh |
| `skills_permissions` | Check current policy or test a tool/skill |
| `skills_import_from_skills_sh` | Import skills via the skills.sh CLI |

## Start the server

```bash
bun run src/mcp-server.ts
```

## Add it to your MCP host

### Cursor / VS Code (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "skills-mvp": {
      "command": "bun",
      "args": ["run", "src/mcp-server.ts"]
    }
  }
}
```

### Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.skills_mvp]
command = "bun"
args = ["run", "src/mcp-server.ts"]
cwd = "/absolute/path/to/skills-mvp"
```

Adjust `cwd` to wherever the project lives on your machine.

### Generic stdio MCP config

```json
{
  "command": "bun",
  "args": ["run", "src/mcp-server.ts"]
}
```

## Session flow

Every MCP host follows the same pattern:

1. **Initialize** — server responds with protocol version and capabilities
2. **Call `skills_init`** — at start of every chat/thread to load guardrails and confirm readiness
3. **Plan & execute** — use `skills_plan` to find skills, `skills_run` to execute, `skills_auto_fetch` to pull from skills.sh on demand

Guardrails apply universally — every host gets the same permission enforcement.
