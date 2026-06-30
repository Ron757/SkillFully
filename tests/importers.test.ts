import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  importClawCompatibleSkills,
  importOpenClaudeBundledSkills,
} from '../src/importers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('imports bundled OpenClaude skills into a temp project', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'skills-mvp-openclaude-'))
  mkdirSync(join(tempRoot, 'skills'), { recursive: true })

  try {
    const result = importOpenClaudeBundledSkills(
      tempRoot,
      join(__dirname, 'fixtures', 'openclaude-main'),
    )

    expect(result.imported.length).toBe(1)
    expect(
      readFileSync(
        join(
          tempRoot,
          'skills',
          'imported',
          'openclaude',
          'simplify',
          'SKILL.md',
        ),
        'utf8',
      ),
    ).toContain('Imported from OpenClaude bundled skill source')
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('imports claw-compatible skill directories from explicit roots', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'skills-mvp-claw-'))
  const compatRoot = mkdtempSync(join(tmpdir(), 'skills-mvp-compat-root-'))
  mkdirSync(join(tempRoot, 'skills'), { recursive: true })
  mkdirSync(join(compatRoot, 'example-skill'), { recursive: true })
  writeFileSync(
    join(compatRoot, 'example-skill', 'SKILL.md'),
    `---
name: example-skill
description: Example imported skill.
---

Use this example skill.
`,
    'utf8',
  )

  try {
    const result = importClawCompatibleSkills(tempRoot, [compatRoot])
    expect(result.imported.length).toBe(1)
    expect(
      readFileSync(
        join(
          tempRoot,
          'skills',
          'imported',
          'claw-compatible',
          'example-skill',
          'skill.json',
        ),
        'utf8',
      ),
    ).toContain('"claw-compatible:example-skill"')
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
    rmSync(compatRoot, { recursive: true, force: true })
  }
})
