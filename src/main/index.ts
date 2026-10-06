import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import type { AppState, Profile, Race, Settings } from '@shared/types'
import { todayISO } from '@shared/dates'
import { killAll } from './claude'
import { Store } from './db'
import { searchPlaces } from './geo'
import { Planner } from './planner'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let store: Store
let planner: Planner
let quitting = false

function state(): AppState {
  const { running, queued, lastRunAt, error } = planner
  return { ...store.snapshot(todayISO()), refresh: { running, queued, lastRunAt, error } }
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
  // STRIDE_CAPTURE_JS runs in the page first (to click through to a state).
  const capture = process.env.STRIDE_CAPTURE
  if (capture) {
    win.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        if (process.env.STRIDE_CAPTURE_JS) {
          await win!.webContents.executeJavaScript(process.env.STRIDE_CAPTURE_JS)
          await new Promise((r) => setTimeout(r, Number(process.env.STRIDE_CAPTURE_WAIT ?? 800)))
        }
        // macOS stops painting occluded windows; bring it forward and force a fresh frame.
        win!.show()
        win!.webContents.invalidate()
        await new Promise((r) => setTimeout(r, 400))
        const img = await win!.webContents.capturePage()
        const text = await win!.webContents.executeJavaScript('document.body.innerText')
        const fs = await import('fs')
        await fs.promises.writeFile(capture, img.toPNG())
        await fs.promises.writeFile(`${capture}.txt`, text)
        killAll()
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

async function runRefresh(): Promise<void> {
  // Failures are already surfaced through state.refresh.error.
  await planner.refresh().catch(() => undefined)
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
    if (store.getActiveRace()) void runRefresh()
  })
  ipcMain.handle(IPC.saveRace, async (_, r: Race) => {
    store.setActiveRace(r)
    broadcast()
    await planner.buildPlan()
  })
  ipcMain.handle(IPC.predict, (_, r: Race) => planner.predict(r))
  ipcMain.handle(IPC.refresh, () => runRefresh())
  ipcMain.handle(IPC.undo, (_, id: string) => planner.undo(id))
  ipcMain.handle(IPC.searchPlaces, (_, q: string) => searchPlaces(q))
}

// Dev aid: keep test data away from the real database.
if (process.env.STRIDE_DATA_DIR) app.setPath('userData', process.env.STRIDE_DATA_DIR)

app.whenReady().then(() => {
  const data = app.getPath('userData')
  store = new Store(join(data, 'stride.db'))
  planner = new Planner({
    store,
    skillFile: join(app.getAppPath(), 'skills/stride-planner/SKILL.md'),
    workDir: join(data, 'planner'),
    onChange: broadcast
  })
  registerIpc()
  createWindow()
  createTray()
  // A build interrupted by quitting picks up where it left off.
  if (store.getActiveRace() && store.getWeeks().length === 0) void runRefresh()
  app.on('activate', showWindow)
})

app.on('before-quit', () => {
  quitting = true
  killAll()
})
