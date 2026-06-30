---
name: guardrails-check
description: Check the current permission mode, trusted roots, and active rules.
tags:
  - security
  - permissions
capabilities:
  - audit
triggers:
  - guardrails
  - permissions
  - mode
consumes:
  - task
produces:
  - guardrails_report
safe: true
chainable: true
---

Run this skill when you need to verify the current permission boundaries before executing sensitive operations. Review the session mode (`read-only`, `workspace-write`, `full-access`, or `prompt`), trusted root directories, and any custom allow/deny/ask rules.

Return a structured report with the current mode, what tools are available, and any session-level restrictions.
