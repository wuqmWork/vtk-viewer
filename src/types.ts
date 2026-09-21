export type GalvoGroupName = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
export type CoordMode = 'off' | 'global' | 'local'
export type ThemeMode = 'system' | 'light' | 'dark'
export type Locale = 'zh-CN' | 'en-US'

export type Transform2D = {
  a: number
  b: number
  tx: number
  ty: number
  rotationDeg: number
}

export type GalvoFolderInfo = {
  folder: number
  id: string
  layerCount: number
  minLayer: number | null
  maxLayer: number | null
  transform: Transform2D
}

export type DatasetInfo = {
  root: string
  totalLayers: number
  availableLayers: number[]
  galvos: GalvoFolderInfo[]
  warnings: string[]
}

export type GalvoItem = {
  id: string
  group: GalvoGroupName
  visible: boolean
  color: string
  folder?: number
  transform?: Transform2D
}
