import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { DatasetInfo } from '../types'

export type PerformanceConfig = {
  ioThreads: number
  preloadLayers: number
  maxCacheMb: number
}

export type CacheStats = {
  entries: number
  bytes: number
  maxBytes: number
  hits: number
  misses: number
}

export type LayerRequestMode = 'scrub' | 'exact' | 'playback'

const CANCELLED_MARKER = '__VTK_CANCELLED__'

export function isCancelledLoadError(error: unknown): boolean {
  return String(error).includes(CANCELLED_MARKER)
}

export async function selectDatasetFolder(title = '选择24振镜VTK总文件夹'): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, title })
  return typeof result === 'string' ? result : null
}

export async function scanDataset(root: string): Promise<DatasetInfo> {
  return invoke<DatasetInfo>('scan_dataset', { root })
}

export async function loadLayerFast(
  root: string,
  layer: number,
  totalLayers: number,
  requestMode: LayerRequestMode = 'exact',
): Promise<ArrayBuffer> {
  const data = await invoke<ArrayBuffer | Uint8Array>('load_layer_fast', {
    root,
    layer,
    totalLayers,
    requestMode,
  })
  if (data instanceof ArrayBuffer) return data
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

export async function getPerformanceConfig(): Promise<PerformanceConfig> {
  return invoke<PerformanceConfig>('get_performance_config')
}

export async function setPerformanceConfig(config: PerformanceConfig): Promise<void> {
  return invoke('set_performance_config', { config })
}

export async function clearGeometryCache(): Promise<void> {
  return invoke('clear_geometry_cache')
}

export async function getCacheStats(): Promise<CacheStats> {
  return invoke<CacheStats>('get_cache_stats')
}
