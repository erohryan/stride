import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { join } from 'path'
import { IPC, type NavigateRequest } from '@shared/ipc'
import type { AppState, Profile, Race, Run, Session, Settings } from '@shared/types'
import { todayISO } from '@shared/dates'
import { formatDistanceWithUnit } from '@shared/format'
import { sessionDayName } from '@shared/plan-view'
import { killAll } from './claude'
import { Store } from './db'
import { searchPlaces } from './geo'
import { Planner } from './planner'
import { Reminders } from './reminders'
import { Runs } from './runs'
import { registerScheme, Screenshots } from './screenshots'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let store: Store
let planner: Planner
let runs: Runs
let shots: Screenshots
let reminders: Reminders
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
          await win!.webContents.executeJavaScript(process.env.STRIDE_CAPTURE_JS).catch((e) => console.error('capture script failed:', e))
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

function navigate(n: NavigateRequest): void {
  showWindow()
  // A freshly created window needs to load before it can listen.
  if (win!.webContents.isLoading()) win!.webContents.once('did-finish-load', () => win?.webContents.send(IPC.navigate, n))
  else win!.webContents.send(IPC.navigate, n)
}

const openLog = (session: Session | null): void => navigate({ screen: 'history', logSession: session })

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('Stride')
  updateTray(state())
}

function updateTray(s: AppState): void {
  if (!tray) return
  const toLog = reminders?.pending() ?? []
  const today = todayISO()
  // Stage 5 adds today's session here ("8 km · 19°"). For now, flag runs waiting to be logged.
  tray.setTitle(toLog.length ? `${toLog.length} to log` : '')
  tray.setToolTip(toLog.length ? `Stride · ${toLog.length} run${toLog.length > 1 ? 's' : ''} to log` : 'Stride')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Stride', click: showWindow },
      { label: 'Log a run…', click: () => openLog(null) },
      ...(toLog.length
        ? [
            { type: 'separator' as const },
            ...toLog.map((x) => ({
              label: `Log ${sessionDayName(x, today)} · ${formatDistanceWithUnit(x.distanceKm, s.settings.units)}`,
              click: () => openLog(x)
            }))
          ]
        : []),
      { type: 'separator' },
      { label: s.refresh.running ? 'Refreshing…' : 'Refresh now', enabled: !s.refresh.running, click: () => void runRefresh() },
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
    const before = store.getSettings()
    store.setSettings(s)
    broadcast()
    // Only the training week changes the plan; units and reminders are display matters.
    const replan = before.longRunDay !== s.longRunDay || before.runDays.join() !== s.runDays.join()
    if (replan && store.getWeeks().length) void planner.refresh('settings_changed').catch(() => undefined)
  })
  ipcMain.handle(IPC.saveRace, async (_, r: Race) => {
    const previous = store.getActiveRace()
    if (previous && previous.id !== r.id) store.resetPlanFrom(todayISO())
    store.setActiveRace(r)
    broadcast()
    await planner.buildPlan()
  })
  ipcMain.handle(IPC.predict, (_, r: Race) => planner.predict(r))
  ipcMain.handle(IPC.refresh, () => runRefresh())
  ipcMain.handle(IPC.undo, (_, id: string) => planner.undo(id))
  ipcMain.handle(IPC.searchPlaces, (_, q: string) => searchPlaces(q))
  ipcMain.handle(IPC.importScreenshots, (_, files: { name: string; data: ArrayBuffer }[]) => shots.import(files))
  ipcMain.handle(IPC.discardScreenshots, (_, paths: string[]) => shots.remove(paths))
  ipcMain.handle(IPC.parseScreenshots, (_, paths: string[]) => {
    if (!paths.every((p) => shots.owns(p))) throw new Error('Screenshots must be imported first.')
    return planner.parseScreenshots(paths)
  })
  ipcMain.handle(IPC.saveRun, (_, r: Run) => runs.save(r))
  ipcMain.handle(IPC.deleteRun, (_, id: string) => runs.delete(id))
  ipcMain.handle(IPC.skipSession, (_, id: string) => runs.skip(id))
  ipcMain.handle(IPC.setBenchmark, (_, id: string | null) => runs.setBenchmark(id))
  ipcMain.handle(IPC.saveGoal, (_, sec: number) => runs.saveGoal(sec))
}

// Dev aid: keep test data away from the real database.
if (process.env.STRIDE_DATA_DIR) app.setPath('userData', process.env.STRIDE_DATA_DIR)
app.setName('Stride')
if (process.platform === 'win32') app.setAppUserModelId('Stride')
registerScheme()

app.whenReady().then(() => {
  const data = app.getPath('userData')
  store = new Store(join(data, 'stride.db'))
  planner = new Planner({
    store,
    skillFile: join(app.getAppPath(), 'skills/stride-planner/SKILL.md'),
    workDir: join(data, 'planner'),
    onChange: broadcast
  })
  shots = new Screenshots(join(data, 'screenshots'))
  shots.registerProtocol()
  void shots.prune(new Set(store.getRuns().flatMap((r) => r.screenshotPaths ?? [])))
  runs = new Runs(store, planner, shots, broadcast)
  reminders = new Reminders(store, openLog, broadcast)
  registerIpc()
  createWindow()
  createTray()
  reminders.start()
  // A build interrupted by quitting picks up where it left off.
  if (store.getActiveRace() && store.getWeeks().length === 0) void runRefresh()
  app.on('activate', showWindow)
})

app.on('before-quit', () => {
  quitting = true
  killAll()
})
