import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import type { AppState, Profile, Race, RefreshState, Settings } from '@shared/types'
import { todayISO } from '@shared/dates'
import { Store } from './db'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let store: Store
let quitting = false
const refresh: RefreshState = { running: false, queued: 0, lastRunAt: null, error: null }

function state(): AppState {
  return { ...store.snapshot(todayISO()), refresh: { ...refresh } }
}

function broadcast(): void {
  const s = state()
  win?.webContents.send(IPC.stateChanged, s)
  updateTray(s)
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor: '#F6F0E7',
    title: 'Stride',
    // Custom 64pt top bar; keep the system traffic lights centred in it.
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 22, y: 26 },
    titleBarOverlay: isMac ? undefined : { color: '#F6F0E7', symbolColor: '#2D2621', height: 64 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win?.show())

  // Dev aid: STRIDE_CAPTURE=out.png renders the window to a PNG and exits.
  const capture = process.env.STRIDE_CAPTURE
  if (capture) {
    win.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        const img = await win!.webContents.capturePage()
        await import('fs').then((fs) => fs.promises.writeFile(capture, img.toPNG()))
        app.exit(0)
      }, 1500)
    )
  }

  // Closing the window keeps Stride alive in the menu bar.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win?.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showWindow(): void {
  if (!win) createWindow()
  win!.show()
  win!.focus()
}

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('Stride')
  updateTray(state())
}

function updateTray(s: AppState): void {
  if (!tray) return
  // Stage 5 shows today's session here ("8 km · 19°").
  tray.setTitle(process.platform === 'darwin' ? '' : 'Stride')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Stride', click: showWindow },
      { label: s.refresh.running ? 'Refreshing…' : 'Refresh now', enabled: !s.refresh.running, click: () => void runRefresh() },
      { type: 'separator' },
      { label: 'Quit Stride', role: 'quit' }
    ])
  )
}

// Placeholder until the planner skill lands (stage 2).
async function runRefresh(): Promise<void> {
  if (refresh.running) {
    refresh.queued++
    broadcast()
    return
  }
  refresh.running = true
  refresh.error = null
  broadcast()
  try {
    await new Promise((r) => setTimeout(r, 800))
    refresh.lastRunAt = new Date().toISOString()
  } catch (e) {
    refresh.error = e instanceof Error ? e.message : String(e)
  } finally {
    refresh.running = false
    broadcast()
    if (refresh.queued > 0) {
      refresh.queued--
      void runRefresh()
    }
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getState, () => state())
  ipcMain.handle(IPC.saveProfile, (_, p: Profile) => {
    store.setProfile(p)
    broadcast()
  })
  ipcMain.handle(IPC.saveSettings, (_, s: Settings) => {
    store.setSettings(s)
    broadcast()
  })
  ipcMain.handle(IPC.saveRace, (_, r: Race) => {
    store.setActiveRace(r)
    broadcast()
  })
  ipcMain.handle(IPC.refresh, () => runRefresh())
}

app.whenReady().then(() => {
  store = new Store(join(app.getPath('userData'), 'stride.db'))
  registerIpc()
  createWindow()
  createTray()
  app.on('activate', showWindow)
})

app.on('before-quit', () => {
  quitting = true
})
