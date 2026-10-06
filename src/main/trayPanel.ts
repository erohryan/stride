import { BrowserWindow, screen, type Rectangle } from 'electron'
import { join } from 'path'

const WIDTH = 340

/** The menu bar panel (1e, restyled): a small frameless window under the tray icon. */
export class TrayPanel {
  private win: BrowserWindow | null = null
  private height = 420
  private hiddenAt = 0

  constructor(private preload: string) {}

  get webContents(): Electron.WebContents | null {
    return this.win?.webContents ?? null
  }

  private create(): BrowserWindow {
    const win = new BrowserWindow({
      width: WIDTH,
      height: this.height,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      transparent: true,
      hasShadow: true,
      webPreferences: { preload: this.preload, sandbox: false }
    })
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.on('blur', () => this.hide())
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#tray`)
    else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'tray' })
    return win
  }

  toggle(trayBounds: Rectangle): void {
    // A click on the icon blurs (and hides) the panel just before the click arrives; don't reopen it.
    if (this.win?.isVisible() || Date.now() - this.hiddenAt < 250) {
      this.hide()
      return
    }
    this.win ??= this.create()
    this.place(trayBounds)
    this.win.show()
    this.win.focus()
  }

  hide(): void {
    if (this.win?.isVisible()) {
      this.win.hide()
      this.hiddenAt = Date.now()
    }
  }

  /** The panel reports its content height so the window fits it. */
  resize(height: number): void {
    this.height = Math.max(200, Math.min(640, Math.ceil(height)))
    if (!this.win) return
    const [x, y] = this.win.getPosition()
    this.win.setBounds({ x, y, width: WIDTH, height: this.height })
  }

  private place(tray: Rectangle): void {
    const display = screen.getDisplayNearestPoint({ x: tray.x, y: tray.y })
    const area = display.workArea
    const x = Math.round(Math.min(Math.max(tray.x + tray.width / 2 - WIDTH / 2, area.x + 8), area.x + area.width - WIDTH - 8))
    // Menu bar at the top (macOS): drop below it. Taskbar at the bottom: rise above it.
    const below = tray.y < display.bounds.y + display.bounds.height / 2
    const y = below ? tray.y + tray.height + 4 : tray.y - this.height - 4
    this.win!.setBounds({ x, y: Math.round(y), width: WIDTH, height: this.height })
  }
}
