import { useEffect, useRef, useState } from 'react'
import type { CoordMode, GalvoItem } from '../types'
import { VtkScene } from '../viewer/VtkScene'
import type { LayerRequestMode } from '../services/tauri'

type Props = {
  root: string | null
  galvos: GalvoItem[]
  gridVisible: boolean
  coordMode: CoordMode
  layer: number
  fitSignal: number
  totalLayers: number
  layerRequestMode: LayerRequestMode
}

export function ViewerPanel({
  root,
  galvos,
  gridVisible,
  coordMode,
  layer,
  fitSignal,
  totalLayers,
  layerRequestMode,
}: Props) {
  const host = useRef<HTMLDivElement | null>(null)
  const scene = useRef<VtkScene | null>(null)
  const [viewerError, setViewerError] = useState<string | null>(null)

  useEffect(() => {
    if (!host.current) return
    let vtkScene: VtkScene | null = null
    try {
      vtkScene = new VtkScene()
      vtkScene.mount(host.current)
      scene.current = vtkScene
      setViewerError(null)
    } catch (error) {
      console.error('VTK Viewer 初始化失败', error)
      setViewerError(error instanceof Error ? error.message : String(error))
    }
    return () => {
      vtkScene?.unmount()
      scene.current = null
    }
  }, [])

  useEffect(() => {
    scene.current?.setDataset(root, galvos, totalLayers)
  }, [root, totalLayers])

  useEffect(() => {
    scene.current?.setGalvos(galvos)
  }, [galvos])

  useEffect(() => {
    scene.current?.setGridVisible(gridVisible)
  }, [gridVisible])

  useEffect(() => {
    scene.current?.setCoordMode(coordMode)
  }, [coordMode])

  useEffect(() => {
    scene.current?.requestLayer(layer, layerRequestMode)
  }, [root, layer, layerRequestMode])

  useEffect(() => {
    if (fitSignal > 0) scene.current?.fit()
  }, [fitSignal])

  return (
    <div className="vtk-host-shell">
      <div ref={host} className="vtk-host" />
      {viewerError && (
        <div className="viewer-error">
          <strong>VTK 渲染器初始化失败</strong>
          <span>{viewerError}</span>
        </div>
      )}
    </div>
  )
}
