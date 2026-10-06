import type { StrideApi } from '@shared/ipc'

declare global {
  interface Window {
    stride: StrideApi
  }
}
