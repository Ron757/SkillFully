---
name: shell-runner
description: Execute shell commands against the workspace.
tags:
  - shell
  - terminal
  - commands
capabilities:
  - execute_commands
triggers:
  - shell
  - terminal
  - command
consumes:
  - task
produces:
  - shell_output
safe: false
chainable: true
security_danger_level: high
security_requires_tools:
  - bash
---

Use this skill when the task requires running shell commands, terminal operations, or CLI tool execution. Determine the appropriate command from the task description, execute it against the workspace, and return the output. Prefer safe read-only commands where possible.
