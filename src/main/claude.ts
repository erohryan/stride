import { execFile, spawn, type ChildProcess } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

let cachedPath: string | null = null
const live = new Set<ChildProcess>()

/** Stops any planner runs still going (on quit). */
export function killAll(): void {
  for (const c of live) c.kill('SIGTERM')
}

/**
 * Finds the claude CLI. Apps launched from Finder don't inherit the shell PATH,
 * so ask a login shell first, then try the usual install locations.
 */
export async function findClaude(): Promise<string> {
  if (cachedPath) return cachedPath
  const fromEnv = process.env.STRIDE_CLAUDE_PATH
  if (fromEnv && existsSync(fromEnv)) return (cachedPath = fromEnv)

  if (process.platform !== 'win32') {
    const shell = process.env.SHELL || '/bin/zsh'
    const found = await new Promise<string | null>((resolve) =>
      execFile(shell, ['-lc', 'command -v claude'], { timeout: 5000 }, (err, out) => resolve(err ? null : out.trim() || null))
    )
    if (found && existsSync(found)) return (cachedPath = found)
  }

  const candidates = [
    join(homedir(), '.local/bin/claude'),
    join(homedir(), '.claude/local/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    join(homedir(), 'AppData/Roaming/npm/claude.cmd')
  ]
  const hit = candidates.find((p) => existsSync(p))
  if (!hit) throw new Error("Couldn't find the claude command. Install Claude Code or set STRIDE_CLAUDE_PATH.")
  return (cachedPath = hit)
}

/** The skill file minus its frontmatter, used as the system prompt. */
export function loadSkill(skillFile: string): string {
  return readFileSync(skillFile, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '')
}

export interface ClaudeCall {
  systemPrompt: string
  input: string
  schema: object
  /** Directories Claude may read (enables the Read tool). */
  readDirs?: string[]
  /** Where to keep the last request and response, for debugging. */
  logDir: string
  logName: string
  effort?: 'low' | 'medium' | 'high'
  timeoutMs?: number
}

/** Runs `claude -p` headless with structured output and returns the parsed object. */
export async function callClaude<T>(call: ClaudeCall): Promise<T> {
  const bin = await findClaude()
  const args = [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(call.schema),
    '--system-prompt', call.systemPrompt,
    '--no-session-persistence',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--setting-sources', '',
    '--model', process.env.STRIDE_CLAUDE_MODEL || 'sonnet',
    '--effort', call.effort ?? 'medium'
  ]
  if (call.readDirs?.length) {
    args.push('--tools', 'Read', '--allowedTools', 'Read', '--add-dir', ...call.readDirs)
  } else {
    args.push('--tools', '')
  }

  await mkdir(call.logDir, { recursive: true })
  await writeFile(join(call.logDir, `${call.logName}.request.json`), call.input)

  const stdout = await new Promise<string>((resolve, reject) => {
    // Run from an empty folder so no project CLAUDE.md or settings leak into the planner.
    const child = spawn(bin, args, { cwd: call.logDir, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })
    live.add(child)
    child.on('exit', () => live.delete(child))
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Planning took too long and was stopped.'))
    }, call.timeoutMs ?? 6 * 60_000)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(`claude exited with ${code}: ${(err || out).trim().slice(0, 500)}`))
    })
    child.stdin.end(call.input)
  })

  await writeFile(join(call.logDir, `${call.logName}.response.json`), stdout)
  let parsed: { is_error?: boolean; result?: string; structured_output?: T }
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error(`claude returned something that isn't JSON: ${stdout.slice(0, 200)}`)
  }
  if (parsed.is_error || !parsed.structured_output) {
    throw new Error(`The planner didn't return a plan: ${String(parsed.result ?? '').slice(0, 300)}`)
  }
  return parsed.structured_output
}
