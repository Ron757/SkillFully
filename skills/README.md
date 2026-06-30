# Drop Skills Here

Put local skills in this directory using the standard layout:

```text
skills/<skill-name>/SKILL.md
```

Optional:

```text
skills/<skill-name>/skill.json
skills/<skill-name>/scripts/*
```

If you use `skills.sh`, point it at this folder if it supports custom install destinations.

You can also copy a skill into this folder with:

```bash
bun run src/cli.ts install /absolute/path/to/skill
```
