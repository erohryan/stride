import type { AppState, GoalOptions, Location, PredictionTimes, Profile, Race, Settings } from './types'

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
  onState(cb: (s: AppState) => void): () => void
}

export const IPC = {
  getState: 'state:get',
  stateChanged: 'state:changed',
  saveProfile: 'profile:save',
  saveSettings: 'settings:save',
  saveRace: 'race:save',
  predict: 'plan:predict',
  refresh: 'plan:refresh',
  undo: 'plan:undo',
  searchPlaces: 'geo:search'
} as const
