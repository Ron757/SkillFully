---
name: "openclaude:claude-in-chrome"
description: "Automates your Chrome browser to interact with web pages - clicking elements, filling forms, capturing screenshots, reading console logs, and navigating sites. Opens pages in new tabs within your existing Chrome session. Requires site-level permissions before executing (configured in the extension)."
tags:
  - imported
  - openclaude
  - bundled
capabilities:
  - skill_activation_message
triggers:
  - claude in chrome
safe: true
chainable: true
---

Imported from OpenClaude bundled skill source: openclaude-main/src/skills/bundled/claudeInChrome.ts
When to use: When the user wants to interact with web pages, automate browser tasks, capture screenshots, read console logs, or perform any browser-based actions. Always invoke BEFORE attempting to use any mcp__claude-in-chrome__* tools.
## SKILL_ACTIVATION_MESSAGE

Now that this skill is invoked, you have access to Chrome browser automation tools. You can now use the mcp__claude-in-chrome__* tools to interact with web pages.

IMPORTANT: Start by calling mcp__claude-in-chrome__tabs_context_mcp to get information about the user's current browser tabs.
Review the original TypeScript source if you need the exact runtime behavior.
