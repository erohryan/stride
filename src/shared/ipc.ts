import type { ParsedRun } from './planner'
import type { AppState, GoalOptions, Location, PredictionTimes, Profile, Race, Run, Session, Settings } from './types'

/** Where main asks the window to go (a reminder clicked, a tray item chosen). */
export interface NavigateRequest {
  screen: 'home' | 'week' | 'history' | 'race' | 'settings'
  /** Open Log a run for this session (null: a blank log). Undefined: just switch screens. */
  logSession?: Session | null
}

/** The API the preload script exposes on `window.stride`. */
export interface StrideApi {
  platform: NodeJS.Platform
  getState(): Promise<AppState>
  saveProfile(p: Profile): Promise<void>
  /** Saves settings; re-plans when a race exists. */
  saveSettings(s: Settings): Promise<void>
  /** Saves the race and builds (or rebuilds) its plan. */
  saveRace(r: Race): Promise<void>
  /** Predicts race times and goal options for a race that may not be saved yet. */
  predict(r: Race): Promise<{ prediction: PredictionTimes; goalOptions: GoalOptions }>
  refresh(): Promise<void>
  undo(changeSetId: string): Promise<void>
  searchPlaces(q: string): Promise<Location[]>

  /** Copies images into Stride's screenshot folder; returns the stored paths. */
  importScreenshots(files: { name: string; data: ArrayBuffer }[]): Promise<string[]>
  /** Deletes stored screenshots that weren't saved with a run. */
  discardScreenshots(paths: string[]): Promise<void>
  /** Reads screenshots and returns the runs in them, grouped by run. */
  parseScreenshots(paths: string[]): Promise<ParsedRun[]>
  saveRun(r: Run): Promise<void>
  deleteRun(id: string): Promise<void>
  skipSession(id: string): Promise<void>
  setBenchmark(runId: string | null): Promise<void>
  /** Changes the goal and re-plans the rest of the training around it. */
  saveGoal(goalSeconds: number): Promise<void>

  /** Subscribes Calendar to the live plan feed. */
  addToCalendar(): Promise<void>
  /** Asks where to save, then writes the plan as CSV. Resolves to the path, or null if cancelled. */
  exportCsv(): Promise<string | null>
  setOpenAtLogin(on: boolean): Promise<void>

  /** The menu bar panel tells main how tall its content is. */
  trayResize(height: number): Promise<void>
  /** From the menu bar panel: open the main window (optionally at a screen or log). */
  openMain(n: NavigateRequest | null): Promise<void>

  onState(cb: (s: AppState) => void): () => void
  onNavigate(cb: (n: NavigateRequest) => void): () => void
}

export const IPC = {
  getState: 'state:get',
  stateChanged: 'state:changed',
  navigate: 'app:navigate',
  saveProfile: 'profile:save',
  saveSettings: 'settings:save',
  saveRace: 'race:save',
  predict: 'plan:predict',
  refresh: 'plan:refresh',
  undo: 'plan:undo',
  searchPlaces: 'geo:search',
  importScreenshots: 'shots:import',
  discardScreenshots: 'shots:discard',
  parseScreenshots: 'shots:parse',
  saveRun: 'run:save',
  deleteRun: 'run:delete',
  skipSession: 'session:skip',
  setBenchmark: 'run:benchmark',
  saveGoal: 'race:goal',
  addToCalendar: 'export:calendar',
  exportCsv: 'export:csv',
  setOpenAtLogin: 'app:login-item',
  trayResize: 'tray:resize',
  openMain: 'tray:open-main'
} as const
