---
name: emit-json-script
description: Emit a JSON object for testing script execution.
tags:
  - json
  - script
capabilities:
  - emit_json
triggers:
  - json
  - status
  - report
produces:
  - script_output
safe: true
chainable: true
---

Use this skill when you want a script-backed skill that produces JSON output.
