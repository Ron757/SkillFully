# Skill Schema

The MVP supports two layers of skill metadata:

1. `SKILL.md` frontmatter for simple portable skills
2. `skill.json` for structured execution details

## Supported frontmatter fields

- `name`
- `description`
- `tags`
- `capabilities`
- `triggers`
- `examples`
- `domains`
- `consumes`
- `produces`
- `paths`
- `safe`
- `chainable`
- `entry_type`
- `entry_command`

Example:

```md
---
name: summarize-notes
description: Turn raw notes into a short structured summary.
capabilities:
  - summarize
  - distill_notes
consumes:
  - research_notes
produces:
  - summary
safe: true
chainable: true
---

Summarize raw notes into concise bullet points and preserve factual claims.
```

## Supported `skill.json` fields

```json
{
  "id": "summarize-notes",
  "name": "Summarize Notes",
  "description": "Turn raw notes into a short summary.",
  "tags": ["summary", "writing"],
  "capabilities": ["summarize", "distill_notes"],
  "triggers": ["summarize", "condense notes"],
  "examples": ["Summarize these findings into 5 bullets"],
  "domains": ["research", "content"],
  "consumes": ["research_notes"],
  "produces": ["summary"],
  "paths": ["docs/**"],
  "safe": true,
  "chainable": true,
  "entry": {
    "type": "prompt",
    "command": []
  }
}
```

## Entry types

- `prompt`
  The system loads the skill instructions and returns a Codex-ready handoff block.
- `shell`
  Executes the listed command directly.
- `node`
  Reserved for Node-backed scripts.
- `bun`
  Reserved for Bun-backed scripts.

For executable skills, the runtime passes:

- `SKILL_TASK`
- `SKILL_NAME`
- `SKILL_INPUT_JSON`
- `SKILL_ARTIFACTS_JSON`
- `SKILL_STEP_INDEX`

If stdout is valid JSON, it is parsed and converted into artifacts automatically.
