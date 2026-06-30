---
name: "openclaude:loop"
description: "Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo, defaults to 10m)"
tags:
  - imported
  - openclaude
  - bundled
capabilities:
  - usage_message
triggers:
  - loop
safe: true
chainable: true
---

Imported from OpenClaude bundled skill source: openclaude-main/src/skills/bundled/loop.ts
When to use: When the user wants to set up a recurring task, poll for status, or run something repeatedly on an interval (e.g. "check the deploy every 5 minutes", "keep running /babysit-prs"). Do NOT invoke for one-off tasks.
Argument hint: [interval] <prompt>
## USAGE_MESSAGE

Usage: /loop [interval] <prompt>

Run a prompt or slash command on a recurring interval.

Intervals: Ns, Nm, Nh, Nd (e.g. 5m, 30m, 2h, 1d). Minimum granularity is 1 minute.
If no interval is specified, defaults to ${DEFAULT_INTERVAL}.

Examples:
  /loop 5m /babysit-prs
  /loop 30m check the deploy
  /loop 1h /standup 1
  /loop check the deploy          (defaults to ${DEFAULT_INTERVAL})
  /loop check the deploy every 20m
Review the original TypeScript source if you need the exact runtime behavior.
