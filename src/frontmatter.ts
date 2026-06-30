function parseInlineArray(raw: string): string[] | undefined {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return undefined
  }

  const body = trimmed.slice(1, -1).trim()
  if (!body) {
    return []
  }

  return body
    .split(',')
    .map(part => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

function parseScalar(raw: string): unknown {
  const trimmed = raw.trim()
  const arrayValue = parseInlineArray(trimmed)
  if (arrayValue) {
    return arrayValue
  }
  if (trimmed === 'true') {
    return true
  }
  if (trimmed === 'false') {
    return false
  }
  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10)
  }
  return trimmed.replace(/^['"]|['"]$/g, '')
}

export function parseMarkdownWithFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const lines = markdown.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: {}, body: markdown.trim() }
  }

  const frontmatter: Record<string, unknown> = {}
  let index = 1
  let currentListKey: string | null = null

  while (index < lines.length) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    if (trimmed === '---') {
      index += 1
      break
    }

    if (!trimmed) {
      currentListKey = null
      index += 1
      continue
    }

    if (currentListKey && trimmed.startsWith('- ')) {
      const list = Array.isArray(frontmatter[currentListKey])
        ? (frontmatter[currentListKey] as unknown[])
        : []
      list.push(parseScalar(trimmed.slice(2)))
      frontmatter[currentListKey] = list
      index += 1
      continue
    }

    const match = line.match(/^([A-Za-z0-9_-]+):(.*)$/)
    if (!match) {
      currentListKey = null
      index += 1
      continue
    }

    const [, key, rawValue] = match
    const value = rawValue.trim()
    if (!value) {
      frontmatter[key] = []
      currentListKey = key
      index += 1
      continue
    }

    frontmatter[key] = parseScalar(value)
    currentListKey = null
    index += 1
  }

  return { frontmatter, body: lines.slice(index).join('\n').trim() }
}

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
  }

  return []
}

export function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    if (value === 'true') {
      return true
    }
    if (value === 'false') {
      return false
    }
  }
  return fallback
}

export function firstMeaningfulLine(body: string): string {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    if (trimmed.startsWith('#')) {
      continue
    }
    return trimmed
  }
  return ''
}
