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
  predict: (r) => ipcRenderer.invoke(IPC.predict, r),
  refresh: () => ipcRenderer.invoke(IPC.refresh),
  undo: (id) => ipcRenderer.invoke(IPC.undo, id),
  searchPlaces: (q) => ipcRenderer.invoke(IPC.searchPlaces, q),
  onState: (cb) => {
    const listener = (_: unknown, s: AppState): void => cb(s)
    ipcRenderer.on(IPC.stateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.stateChanged, listener)
  }
}

contextBridge.exposeInMainWorld('stride', api)
