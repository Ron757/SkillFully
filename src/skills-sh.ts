import { spawn } from 'node:child_process'

function hasFlag(args: string[], flags: string[]): boolean {
  return args.some(arg => flags.includes(arg) || flags.some(flag => arg.startsWith(`${flag}=`)))
}

function hasRepeatedValueFlag(args: string[], longFlag: string, shortFlag: string): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (arg === longFlag || arg === shortFlag) {
      return Boolean(args[index + 1])
    }
    if (arg.startsWith(`${longFlag}=`) || arg.startsWith(`${shortFlag}=`)) {
      return true
    }
  }
  return false
}

export interface SkillsShRunResult {
  stdout: string
  stderr: string
}

export async function downloadSkill(
  source: string,
  skillName: string,
  cwd: string,
): Promise<SkillsShRunResult> {
  return await runSkillsShAddCommand(source, ['--skill', skillName, '--copy', '-y', '-a', 'codex'], cwd)
}

export function buildSkillsShAddCommand(source: string, forwardedArgs: string[]): string[] {
  const trimmedSource = source.trim()
  if (!trimmedSource) {
    throw new Error('Provide a skills.sh source such as vercel-labs/agent-skills.')
  }

  const listOnly = hasFlag(forwardedArgs, ['--list', '-l'])
  const installsSkills = !listOnly
  const hasExplicitSkill = hasRepeatedValueFlag(forwardedArgs, '--skill', '-s')
  const installsAllSkills =
    hasFlag(forwardedArgs, ['--all']) || forwardedArgs.some(arg => arg === '--skill=*')

  if (installsSkills && !hasExplicitSkill && !installsAllSkills) {
    throw new Error(
      'Specify --skill <name> or --all when importing from skills.sh. Use --list first to discover available skills.',
    )
  }

  const command = ['skills', 'add', trimmedSource]

  if (installsSkills && !hasRepeatedValueFlag(forwardedArgs, '--agent', '-a')) {
    command.push('-a', 'codex')
  }
  if (installsSkills && !hasFlag(forwardedArgs, ['--copy'])) {
    command.push('--copy')
  }
  if (installsSkills && !hasFlag(forwardedArgs, ['--yes', '-y'])) {
    command.push('-y')
  }

  command.push(...forwardedArgs)
  return command
}

export async function runSkillsShAddCommand(
  source: string,
  forwardedArgs: string[],
  cwd: string,
): Promise<SkillsShRunResult> {
  const command = buildSkillsShAddCommand(source, forwardedArgs)

  return await new Promise<SkillsShRunResult>((resolve, reject) => {
    const child = spawn('npx', ['-y', ...command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(`skills.sh command exited with code ${code}.\n${stdout}\n${stderr}`.trim()))
    })
  })
}
