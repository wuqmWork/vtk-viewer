import { useEffect, useRef } from 'react'
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

  useEffect(() => {
    if (!host.current) return
    const vtkScene = new VtkScene()
    vtkScene.mount(host.current)
    scene.current = vtkScene
    return () => {
      vtkScene.unmount()
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

  return <div ref={host} className="vtk-host" />
}
