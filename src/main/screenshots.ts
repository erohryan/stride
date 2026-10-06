import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdir, readdir, stat, unlink, writeFile } from 'fs/promises'
import { extname, join, normalize, sep } from 'path'
import { net, protocol } from 'electron'
import { pathToFileURL } from 'url'

/** Screenshots live in <userData>/screenshots and never leave the machine. */
export class Screenshots {
  constructor(readonly dir: string) {}

  /** Saves dropped or pasted images; returns their stored paths in the same order. */
  async import(files: { name: string; data: ArrayBuffer }[]): Promise<string[]> {
    await mkdir(this.dir, { recursive: true })
    return Promise.all(
      files.map(async (f) => {
        const ext = (extname(f.name) || '.png').toLowerCase()
        if (!IMAGE_EXT.includes(ext)) throw new Error(`${f.name} isn't an image Stride can read (PNG, JPEG, HEIC, WebP or GIF).`)
        const path = join(this.dir, `${randomUUID()}${ext}`)
        await writeFile(path, Buffer.from(f.data))
        // Claude reads PNG, JPEG, WebP and GIF; iPhone HEIC screenshots get converted.
        return ext === '.heic' ? toJpeg(path) : path
      })
    )
  }

  /** Deletes stored screenshots that are no longer needed (a cancelled log, a deleted run). */
  async remove(paths: string[]): Promise<void> {
    await Promise.all(paths.filter((p) => this.owns(p)).map((p) => unlink(p).catch(() => undefined)))
  }

  /** Deletes screenshots no run refers to that are over a day old (logs abandoned mid-review). */
  async prune(referenced: Set<string>): Promise<void> {
    const names = await readdir(this.dir).catch(() => [] as string[])
    const dayAgo = Date.now() - 86_400_000
    for (const n of names) {
      const path = join(this.dir, n)
      if (referenced.has(path)) continue
      const info = await stat(path).catch(() => null)
      if (info?.isFile() && info.mtimeMs < dayAgo) await unlink(path).catch(() => undefined)
    }
  }

  owns(path: string): boolean {
    return normalize(path).startsWith(normalize(this.dir) + sep)
  }

  /** stride-shot://<file name> serves a stored screenshot to the renderer, and nothing else. */
  registerProtocol(): void {
    protocol.handle('stride-shot', (req) => {
      const name = decodeURIComponent(new URL(req.url).hostname || new URL(req.url).pathname.replace(/^\/+/, ''))
      const path = join(this.dir, name)
      if (!this.owns(path) || name.includes('/') || name.includes('\\')) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(path).toString())
    })
  }
}

/** Converts with macOS's built-in sips; deletes the HEIC afterwards. */
function toJpeg(path: string): Promise<string> {
  const out = path.replace(/\.heic$/i, '.jpg')
  return new Promise((resolve, reject) =>
    execFile('sips', ['-s', 'format', 'jpeg', path, '--out', out], (err) => {
      if (err) return reject(new Error("Couldn't convert this HEIC screenshot. Try a PNG or JPEG."))
      unlink(path).catch(() => undefined)
      resolve(out)
    })
  )
}

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.heic', '.webp', '.gif']

/** Must run before app ready. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: 'stride-shot', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
}
