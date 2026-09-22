import '@kitware/vtk.js/Rendering/Profiles/Geometry'
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow'
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor'
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper'
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData'
import vtkPoints from '@kitware/vtk.js/Common/Core/Points'
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray'

import type { CoordMode, GalvoItem } from '../types'
import { isCancelledLoadError, loadLayerFast, type LayerRequestMode } from '../services/tauri'
import { parsePackedLayer, type PackedGalvoGeometry } from './packedLayer'
import {
  buildGridSegments,
  createGlobalAxesHandles,
  createLineActor,
  createLocalCoordinateActors,
  niceGridSpacing,
  transformedRegionBounds,
  updateGlobalAxes,
  updateLineActor,
  setActorHexColor,
  transformToMat4,
} from './geometry'

type GeometrySlot = {
  points: any
  lines: any
  polyData: any
}

type ActorEntry = {
  actor: any
  mapper: any
  slots: [GeometrySlot, GeometrySlot]
  activeSlot: 0 | 1
  loadedLayer: number | null
}

const SCRUB_FRAME_MS = 50

function createGeometrySlot(): GeometrySlot {
  const points = vtkPoints.newInstance()
  const lines = vtkCellArray.newInstance()
  const polyData = vtkPolyData.newInstance()
  polyData.setPoints(points)
  polyData.setLines(lines)
  return { points, lines, polyData }
}

/**
 * VTK 场景采用“前台保持 + 后台准备 + 单帧交换”。
 *
 * - 当前层在新层完整准备好前始终保留，避免白屏/闪烁。
 * - 每个振镜拥有两个复用的 PolyData 槽位，交替作为前/后缓冲。
 * - Actor/Mapper/Points/CellArray/PolyData 全程复用，减少 JS 对象分配和
 *   vtk.js OpenGL 管线反复创建；底层 VBO 是否原地复用由 vtk.js/WebGL 决定。
 * - 快速拖动采用 50ms 动态预览 + latest-wins；松手后立即精确加载最终层。
 */
export class VtkScene {
  private generic = vtkGenericRenderWindow.newInstance({ background: [1, 1, 1] })
  private renderer = this.generic.getRenderer()
  private renderWindow = this.generic.getRenderWindow()
  private actorEntries = new Map<string, ActorEntry>()
  private container: HTMLElement | null = null
  private gridMinor = createLineActor('#edf1f5', 1.0, 1)
  private gridMajor = createLineActor('#d9e0e8', 1.2, 1)
  private globalAxes = createGlobalAxesHandles()
  private localAxisActors: any[] = []
  private cameraSubscription: any = null
  private guideRaf: number | null = null
  private root: string | null = null
  private totalLayers = 0
  private galvos: GalvoItem[] = []
  private currentLayer = 0
  private coordMode: CoordMode = 'off'
  private gridVisible = true
  private disposed = false

  // 所有交互请求使用前端序列号做最终兜底，过期响应绝不会覆盖新画面。
  private requestSerial = 0

  // 拖动预览：限制为约 20 FPS，始终追随最新目标层。
  private scrubTimer: number | null = null
  private pendingScrubLayer: number | null = null
  private lastScrubDispatchAt = 0

  // 自动播放：不堆积请求。当前帧加载期间只保留“最新下一帧”。
  private playbackBusy = false
  private queuedPlaybackLayer: number | null = null

  // 视图交互状态（左键拖拽平移 / 滚轮缩放 / 右键拖拽缩放）。
  private panStart: { x: number; y: number } | null = null
  private zoomStartY: number | null = null

  mount(container: HTMLElement) {
    this.disposed = false
    this.container = container
    this.generic.setContainer(container)
    this.generic.resize()

    this.setupInteractions()

    const camera = this.renderer.getActiveCamera()
    camera.setParallelProjection(true)
    camera.setPosition(0, 0, 4000)
    camera.setFocalPoint(0, 0, 0)
    camera.setViewUp(0, 1, 0)

    this.renderer.addActor(this.gridMinor.actor)
    this.renderer.addActor(this.gridMajor.actor)
    this.renderer.addActor(this.globalAxes.x.actor)
    this.renderer.addActor(this.globalAxes.y.actor)
    this.globalAxes.x.actor.setVisibility(false)
    this.globalAxes.y.actor.setVisibility(false)

    this.cameraSubscription = camera.onModified(() => this.scheduleViewportGuidesUpdate())
    window.addEventListener('resize', this.resize)
    this.fit()
  }

  unmount() {
    this.disposed = true
    this.requestSerial += 1
    this.playbackBusy = false
    this.queuedPlaybackLayer = null
    this.pendingScrubLayer = null
    window.removeEventListener('resize', this.resize)
    this.cameraSubscription?.unsubscribe?.()
    this.cameraSubscription = null
    if (this.guideRaf !== null) cancelAnimationFrame(this.guideRaf)
    this.guideRaf = null
    this.container = null
    if (this.scrubTimer !== null) window.clearTimeout(this.scrubTimer)
    this.scrubTimer = null
    this.generic.delete()
  }

  /**
   * 平行投影下的自定义鼠标交互：
   * - 左键拖拽：平移视口（修改相机 focal/position 的 x,y）。
   * - 滚轮：缩放（修改 parallelScale，平行投影的视野高度）。
   * - 右键拖拽：垂直拖动缩放。
   */
  private setupInteractions() {
    const interactor = this.generic.getInteractor()
    // 移除 GenericRenderWindow 默认挂载的 TrackballCamera 交互风格
    // （左键轨道旋转会导致画面倾斜），交互完全由下方自定义事件处理。
    interactor.setInteractorStyle(null)

    interactor.onLeftButtonPress((callData: any) => {
      this.panStart = { x: callData.position.x, y: callData.position.y }
    })
    interactor.onLeftButtonRelease(() => {
      this.panStart = null
    })

    // 滚轮缩放：向上滚放大（spinY < 0 → parallelScale 减小）。
    interactor.onMouseWheel((callData: any) => {
      this.zoomByFactor(Math.exp(callData.spinY * 0.22))
    })

    // 右键拖拽缩放（向下拖动放大）。
    interactor.onRightButtonPress((callData: any) => {
      this.zoomStartY = callData.position.y
    })
    interactor.onRightButtonRelease(() => {
      this.zoomStartY = null
    })

    // 按下左键/右键期间，MouseMove 分别驱动平移/缩放。
    interactor.onMouseMove((callData: any) => {
      if (this.zoomStartY !== null) {
        const dyPx = callData.position.y - this.zoomStartY
        if (dyPx === 0) return
        this.zoomStartY = callData.position.y
        this.zoomByFactor(Math.exp(-dyPx * 0.008))
        return
      }
      if (this.panStart === null || !this.container) return
      const pos = callData.position
      const dxPx = pos.x - this.panStart.x
      const dyPx = pos.y - this.panStart.y
      this.panStart = { x: pos.x, y: pos.y }
      if (dxPx === 0 && dyPx === 0) return

      const camera = this.renderer.getActiveCamera()
      const worldPerPixel = (2 * Math.max(1, camera.getParallelScale())) / Math.max(1, this.container.clientHeight)
      const offsetX = -dxPx * worldPerPixel
      const offsetY = -dyPx * worldPerPixel
      const focal = camera.getFocalPoint()
      const position = camera.getPosition()
      camera.setFocalPoint(focal[0] + offsetX, focal[1] + offsetY, focal[2])
      camera.setPosition(position[0] + offsetX, position[1] + offsetY, position[2])
      this.updateViewportGuides()
      this.renderWindow.render()
    })
  }

  private zoomByFactor(factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) return
    const camera = this.renderer.getActiveCamera()
    const next = Math.max(5, Math.min(200000, camera.getParallelScale() * factor))
    if (next === camera.getParallelScale()) return
    camera.setParallelScale(next)
    this.updateViewportGuides()
    this.renderWindow.render()
  }
  private resize = () => {
    if (this.disposed) return
    this.generic.resize()
    this.scheduleViewportGuidesUpdate()
    this.renderWindow.render()
  }

  setDataset(root: string | null, galvos: GalvoItem[], totalLayers = 0) {
    const rootChanged = this.root !== root
    this.root = root
    this.galvos = galvos
    this.totalLayers = totalLayers
    if (rootChanged) {
      this.requestSerial += 1
      this.playbackBusy = false
      this.queuedPlaybackLayer = null
      this.pendingScrubLayer = null
      if (this.scrubTimer !== null) window.clearTimeout(this.scrubTimer)
      this.scrubTimer = null
    }
    this.syncActorStyles()
    this.rebuildCoordinateActors()
  }

  setGridVisible(visible: boolean) {
    this.gridVisible = visible
    this.gridMinor.actor.setVisibility(visible)
    this.gridMajor.actor.setVisibility(visible)
    this.renderWindow.render()
  }

  setCoordMode(mode: CoordMode) {
    this.coordMode = mode
    this.rebuildCoordinateActors()
  }

  setGalvos(galvos: GalvoItem[]) {
    this.galvos = galvos
    this.syncActorStyles()
    if (this.coordMode === 'local') this.rebuildCoordinateActors()
    this.renderWindow.render()
  }

  private ensureActor(galvo: GalvoItem): ActorEntry {
    const existing = this.actorEntries.get(galvo.id)
    if (existing) return existing

    const mapper = vtkMapper.newInstance()
    mapper.setScalarVisibility(false)
    const actor = vtkActor.newInstance()
    actor.setMapper(mapper)
    actor.getProperty().setLighting(false)
    actor.getProperty().setLineWidth(1.5)
    actor.setPickable(false)
    this.renderer.addActor(actor)

    const slots: [GeometrySlot, GeometrySlot] = [createGeometrySlot(), createGeometrySlot()]
    mapper.setInputData(slots[0].polyData)

    const entry: ActorEntry = {
      actor,
      mapper,
      slots,
      activeSlot: 0,
      loadedLayer: null,
    }
    this.actorEntries.set(galvo.id, entry)
    return entry
  }

  private syncActorStyles() {
    for (const galvo of this.galvos) {
      const entry = this.ensureActor(galvo)
      entry.actor.setVisibility(galvo.visible && entry.loadedLayer !== null)
      setActorHexColor(entry.actor, galvo.color)
      if (galvo.transform) entry.actor.setUserMatrix(transformToMat4(galvo.transform))
    }
  }

  /**
   * 请求显示某一层。
   * - scrub: 快速拖动预览，50ms 节流，并允许 Rust 取消过时解析。
   * - exact: 松手/按钮操作，立即精确加载并恢复预加载。
   * - playback: 串行消费，慢于设定速度时自动丢弃积压帧而不打断当前帧。
   */
  requestLayer(layer: number, mode: LayerRequestMode = 'exact') {
    const clamped = Math.max(0, Math.min(Math.max(0, this.totalLayers - 1), layer))
    this.currentLayer = clamped

    if (mode === 'scrub') {
      this.requestScrubLayer(clamped)
      return
    }

    this.flushScrubTimer()

    if (mode === 'playback') {
      this.requestPlaybackLayer(clamped)
      return
    }

    // 精确请求必须抢占预览/播放旧任务。
    this.queuedPlaybackLayer = null
    void this.dispatchLayer(clamped, 'exact')
  }

  private requestScrubLayer(layer: number) {
    this.pendingScrubLayer = layer
    const elapsed = performance.now() - this.lastScrubDispatchAt

    if (elapsed >= SCRUB_FRAME_MS && this.scrubTimer === null) {
      const target = this.pendingScrubLayer
      this.pendingScrubLayer = null
      if (target !== null) {
        this.lastScrubDispatchAt = performance.now()
        void this.dispatchLayer(target, 'scrub')
      }
      return
    }

    if (this.scrubTimer !== null) return
    const delay = Math.max(0, SCRUB_FRAME_MS - elapsed)
    this.scrubTimer = window.setTimeout(() => {
      this.scrubTimer = null
      const target = this.pendingScrubLayer
      this.pendingScrubLayer = null
      if (target === null) return
      this.lastScrubDispatchAt = performance.now()
      void this.dispatchLayer(target, 'scrub')
    }, delay)
  }

  private requestPlaybackLayer(layer: number) {
    if (this.playbackBusy) {
      // 不堆积 10/20 个等待帧，只保留最近目标，视觉上仍连续但不会越播越卡。
      this.queuedPlaybackLayer = layer
      return
    }

    this.playbackBusy = true
    void this.dispatchLayer(layer, 'playback').finally(() => {
      this.playbackBusy = false
      const queued = this.queuedPlaybackLayer
      this.queuedPlaybackLayer = null
      if (queued !== null && queued !== layer) this.requestPlaybackLayer(queued)
    })
  }

  private flushScrubTimer() {
    if (this.scrubTimer !== null) {
      window.clearTimeout(this.scrubTimer)
      this.scrubTimer = null
    }
    this.pendingScrubLayer = null
  }

  private async dispatchLayer(layer: number, mode: LayerRequestMode) {
    if (this.disposed) return
    if (!this.root) {
      this.renderWindow.render()
      return
    }

    const serial = ++this.requestSerial
    try {
      const buffer = await loadLayerFast(this.root, layer, this.totalLayers, mode)
      if (this.disposed || serial !== this.requestSerial) return

      const packed = parsePackedLayer(buffer)
      // 新数据全部写入后缓冲；不 render，当前画面继续保持旧层。
      this.stagePackedLayer(packed.layer, packed.geometries)

      // 等到浏览器下一帧统一切换 Mapper 输入并 render，24 振镜不会逐个闪变。
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (this.disposed || serial !== this.requestSerial) return
      this.commitStagedLayer(packed.layer, packed.geometries)
    } catch (error) {
      if (this.disposed || isCancelledLoadError(error)) return
      // 查看器加载失败时保留上一层，不清空画面。
      console.error(`加载图层 ${layer} 失败`, error)
    }
  }

  private staged = new Map<string, { slot: 0 | 1; present: boolean }>()

  private stagePackedLayer(layer: number, geometries: PackedGalvoGeometry[]) {
    this.staged.clear()
    const byFolder = new Map(this.galvos.filter(g => g.folder != null).map(g => [g.folder!, g]))

    for (const geometry of geometries) {
      const galvo = byFolder.get(geometry.folder)
      if (!galvo) continue

      const entry = this.ensureActor(galvo)
      const inactiveSlot = (entry.activeSlot === 0 ? 1 : 0) as 0 | 1
      const slot = entry.slots[inactiveSlot]

      // 复用 VTK 数据对象，仅替换 TypedArray。Actor/Mapper/PolyData 不重新创建。
      slot.points.setData(geometry.points, 3)
      slot.lines.setData(geometry.lineValues)
      slot.points.modified()
      slot.lines.modified()
      slot.polyData.modified()

      this.staged.set(galvo.id, { slot: inactiveSlot, present: true })
    }

    for (const galvo of this.galvos) {
      if (!this.staged.has(galvo.id)) this.staged.set(galvo.id, { slot: 0, present: false })
    }
  }

  private commitStagedLayer(layer: number, geometries: PackedGalvoGeometry[]) {
    // commit 不创建任何几何，只切换已经准备完成的后缓冲。
    const presentFolders = new Set(geometries.map(g => g.folder))

    for (const galvo of this.galvos) {
      const entry = this.ensureActor(galvo)
      const state = this.staged.get(galvo.id)
      const present = galvo.folder != null && presentFolders.has(galvo.folder)

      if (present && state?.present) {
        entry.activeSlot = state.slot
        entry.mapper.setInputData(entry.slots[state.slot].polyData)
        entry.loadedLayer = layer
        entry.actor.setVisibility(galvo.visible)
        if (galvo.transform) entry.actor.setUserMatrix(transformToMat4(galvo.transform))
      } else {
        entry.loadedLayer = null
        entry.actor.setVisibility(false)
      }
    }

    this.renderWindow.render()
  }

  fit() {
    const bounds = this.contentBounds()
    const [minX, maxX, minY, maxY] = bounds
    const width = Math.max(1, maxX - minX)
    const height = Math.max(1, maxY - minY)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const aspect = Math.max(0.25, (this.container?.clientWidth ?? 1) / Math.max(1, this.container?.clientHeight ?? 1))

    const camera = this.renderer.getActiveCamera()
    camera.setParallelProjection(true)
    camera.setFocalPoint(centerX, centerY, 0)
    camera.setPosition(centerX, centerY, 4000)
    camera.setViewUp(0, 1, 0)
    camera.setParallelScale(Math.max(height * 0.56, width / aspect * 0.56, 100))
    this.renderer.resetCameraClippingRange()
    this.updateViewportGuides()
    this.renderWindow.render()
  }

  private contentBounds(): [number, number, number, number] {
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const galvo of this.galvos) {
      if (!galvo.transform) continue
      const [gx0, gx1, gy0, gy1] = transformedRegionBounds(galvo.transform)
      minX = Math.min(minX, gx0)
      maxX = Math.max(maxX, gx1)
      minY = Math.min(minY, gy0)
      maxY = Math.max(maxY, gy1)
    }

    if (!Number.isFinite(minX)) return [-1600, 1750, -460, 220]
    return [minX, maxX, minY, maxY]
  }

  private visibleWorldBounds(): [number, number, number, number] {
    const camera = this.renderer.getActiveCamera()
    const focal = camera.getFocalPoint()
    const halfH = Math.max(1, camera.getParallelScale())
    const width = Math.max(1, this.container?.clientWidth ?? 1)
    const height = Math.max(1, this.container?.clientHeight ?? 1)
    const halfW = halfH * (width / height)
    const pad = 1.03
    return [
      focal[0] - halfW * pad,
      focal[0] + halfW * pad,
      focal[1] - halfH * pad,
      focal[1] + halfH * pad,
    ]
  }

  private scheduleViewportGuidesUpdate() {
    if (this.disposed || this.guideRaf !== null) return
    this.guideRaf = requestAnimationFrame(() => {
      this.guideRaf = null
      this.updateViewportGuides()
      if (!this.disposed) this.renderWindow.render()
    })
  }

  private updateViewportGuides() {
    if (this.disposed || !this.container) return
    const bounds = this.visibleWorldBounds()
    const camera = this.renderer.getActiveCamera()
    const worldPerPixel = (2 * Math.max(1, camera.getParallelScale())) / Math.max(1, this.container.clientHeight)
    const minorSpacing = niceGridSpacing(worldPerPixel * 24)
    const grid = buildGridSegments(bounds, minorSpacing, 5)

    updateLineActor(this.gridMinor, grid.minor, -0.40)
    updateLineActor(this.gridMajor, grid.major, -0.35)
    this.gridMinor.actor.setVisibility(this.gridVisible)
    this.gridMajor.actor.setVisibility(this.gridVisible)

    updateGlobalAxes(this.globalAxes, bounds)
    const globalVisible = this.coordMode === 'global'
    this.globalAxes.x.actor.setVisibility(globalVisible)
    this.globalAxes.y.actor.setVisibility(globalVisible)
  }

  private rebuildCoordinateActors() {
    this.localAxisActors.forEach(actor => this.renderer.removeActor(actor))
    this.localAxisActors = []

    if (this.coordMode === 'local') {
      // 几何位置仍使用 C3 全局坐标；这里只叠加 24 个振镜各自的局部坐标区域与 XY 轴。
      for (const galvo of this.galvos) {
        if (!galvo.transform) continue
        const actors = createLocalCoordinateActors(galvo.transform)
        this.localAxisActors.push(...actors)
        actors.forEach(actor => this.renderer.addActor(actor))
      }
    }

    this.updateViewportGuides()
    this.renderWindow.render()
  }

}
