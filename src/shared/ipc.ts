import type { AppState, Profile, Race, Settings } from './types'

/** The API the preload script exposes on `window.stride`. */
export interface StrideApi {
  platform: NodeJS.Platform
  getState(): Promise<AppState>
  saveProfile(p: Profile): Promise<void>
  saveSettings(s: Settings): Promise<void>
  saveRace(r: Race): Promise<void>
  refresh(): Promise<void>
  onState(cb: (s: AppState) => void): () => void
}

export const IPC = {
  getState: 'state:get',
  stateChanged: 'state:changed',
  saveProfile: 'profile:save',
  saveSettings: 'settings:save',
  saveRace: 'race:save',
  refresh: 'plan:refresh'
} as const
