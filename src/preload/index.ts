import { contextBridge, ipcRenderer } from 'electron'
import type { StrideApi } from '@shared/ipc'
import { IPC } from '@shared/ipc'
import type { AppState } from '@shared/types'

const api: StrideApi = {
  platform: process.platform,
  getState: () => ipcRenderer.invoke(IPC.getState),
  saveProfile: (p) => ipcRenderer.invoke(IPC.saveProfile, p),
  saveSettings: (s) => ipcRenderer.invoke(IPC.saveSettings, s),
  saveRace: (r) => ipcRenderer.invoke(IPC.saveRace, r),
  refresh: () => ipcRenderer.invoke(IPC.refresh),
  onState: (cb) => {
    const listener = (_: unknown, s: AppState): void => cb(s)
    ipcRenderer.on(IPC.stateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.stateChanged, listener)
  }
}

contextBridge.exposeInMainWorld('stride', api)
