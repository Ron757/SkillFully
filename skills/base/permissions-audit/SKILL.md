---
name: permissions-audit
description: Review the allow, deny, and ask rules for the current session.
tags:
  - security
  - audit
capabilities:
  - audit
triggers:
  - audit
  - rules
  - policy
consumes:
  - task
produces:
  - audit_report
safe: true
chainable: true
---

Use this skill when asked to review or audit the permission policy. Check the current deny rules, allow rules, and ask rules in effect. For each active rule, note whether it applies to specific tool patterns (e.g. `bash(rm *)`). Identify any gaps or overly permissive configurations.

Return a structured audit of the current policy and recommendations.
