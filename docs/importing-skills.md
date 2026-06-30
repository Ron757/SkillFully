# Importing Skills

This MVP now supports two import paths:

## 1. OpenClaude bundled skills

These are converted from the TypeScript bundled skill definitions in `openclaude-main/src/skills/bundled`.

Run:

```bash
bun run src/cli.ts import openclaude
```

By default, this reads from `../openclaude-main` (a sibling checkout of [openclaude](https://github.com/openclaude/openclaude)). Pass a different path via `SKILL_LAYER_OPENCLAUDE_PATH` if your checkout lives elsewhere.

Imported skills are written into:

```text
skills/imported/openclaude/<skill-name>/
```

## 2. Claw-compatible skill roots

The `claw-code` repo itself mostly contains skill loading logic rather than a shipped skills catalog. Because of that, the MVP imports from Claw-compatible skill roots that actually exist on disk, such as:

- `CODEX_HOME/skills`
- `CLAW_CONFIG_HOME/skills`
- `~/.codex/skills`
- `~/.claw/skills`
- `~/.claude/skills`

Run:

```bash
bun run src/cli.ts import claw-compatible
```

Imported skills are written into:

```text
skills/imported/claw-compatible/<skill-name>/
```

## Import everything

```bash
bun run src/cli.ts import all
```

## Notes

- Imported skills are namespaced in `skill.json` ids so they do not collide with hand-written local skills.
- OpenClaude imports are adapters derived from bundled source code, so some dynamic runtime behavior is summarized rather than perfectly reproduced.
- Claw-compatible imports preserve the original `SKILL.md` and add a small `skill.json` if one is missing.
