import { contextBridge, ipcRenderer } from 'electron'
import type { NavigateRequest, StrideApi } from '@shared/ipc'
import { IPC } from '@shared/ipc'
import type { AppState } from '@shared/types'

const on =
  <T,>(channel: string) =>
  (cb: (v: T) => void): (() => void) => {
    const listener = (_: unknown, v: T): void => cb(v)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }

const api: StrideApi = {
  platform: process.platform,
  getState: () => ipcRenderer.invoke(IPC.getState),
  saveProfile: (p) => ipcRenderer.invoke(IPC.saveProfile, p),
  saveSettings: (s) => ipcRenderer.invoke(IPC.saveSettings, s),
  saveRace: (r) => ipcRenderer.invoke(IPC.saveRace, r),
  predict: (r) => ipcRenderer.invoke(IPC.predict, r),
  refresh: () => ipcRenderer.invoke(IPC.refresh),
  rebuildPlan: () => ipcRenderer.invoke(IPC.rebuildPlan),
  undo: (id) => ipcRenderer.invoke(IPC.undo, id),
  searchPlaces: (q) => ipcRenderer.invoke(IPC.searchPlaces, q),
  importScreenshots: (files) => ipcRenderer.invoke(IPC.importScreenshots, files),
  discardScreenshots: (paths) => ipcRenderer.invoke(IPC.discardScreenshots, paths),
  parseScreenshots: (paths) => ipcRenderer.invoke(IPC.parseScreenshots, paths),
  saveRun: (r) => ipcRenderer.invoke(IPC.saveRun, r),
  deleteRun: (id) => ipcRenderer.invoke(IPC.deleteRun, id),
  skipSession: (id) => ipcRenderer.invoke(IPC.skipSession, id),
  setBenchmark: (id) => ipcRenderer.invoke(IPC.setBenchmark, id),
  saveGoal: (sec) => ipcRenderer.invoke(IPC.saveGoal, sec),
  addToCalendar: () => ipcRenderer.invoke(IPC.addToCalendar),
  exportCsv: () => ipcRenderer.invoke(IPC.exportCsv),
  setOpenAtLogin: (on) => ipcRenderer.invoke(IPC.setOpenAtLogin, on),
  trayResize: (h) => ipcRenderer.invoke(IPC.trayResize, h),
  openMain: (n) => ipcRenderer.invoke(IPC.openMain, n),
  onState: on<AppState>(IPC.stateChanged),
  onNavigate: on<NavigateRequest>(IPC.navigate)
}

contextBridge.exposeInMainWorld('stride', api)
