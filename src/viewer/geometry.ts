import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor'
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper'
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData'
import vtkPoints from '@kitware/vtk.js/Common/Core/Points'
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray'
import type { Transform2D } from '../types'

export type LineActorHandle = {
  actor: any
  mapper: any
  points: any
  lines: any
  polyData: any
}

function hexToRgb01(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  const n = Number.parseInt(normalized, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function createLineActor(color: string, width = 1, opacity = 1): LineActorHandle {
  const points = vtkPoints.newInstance()
  const lines = vtkCellArray.newInstance()
  const polyData = vtkPolyData.newInstance()
  polyData.setPoints(points)
  polyData.setLines(lines)

  const mapper = vtkMapper.newInstance()
  mapper.setInputData(polyData)

  const actor = vtkActor.newInstance()
  actor.setMapper(mapper)
  actor.getProperty().setColor(...hexToRgb01(color))
  actor.getProperty().setLineWidth(width)
  actor.getProperty().setOpacity(opacity)
  actor.getProperty().setLighting(false)
  actor.setPickable(false)
  return { actor, mapper, points, lines, polyData }
}

export function updateLineActor(
  handle: LineActorHandle,
  segments: Array<[number, number, number, number]>,
  z = -0.2,
) {
  const pointData = new Float32Array(segments.length * 6)
  const cells = new Uint32Array(segments.length * 3)

  segments.forEach(([x1, y1, x2, y2], index) => {
    const p = index * 6
    pointData[p] = x1
    pointData[p + 1] = y1
    pointData[p + 2] = z
    pointData[p + 3] = x2
    pointData[p + 4] = y2
    pointData[p + 5] = z

    const c = index * 3
    cells[c] = 2
    cells[c + 1] = index * 2
    cells[c + 2] = index * 2 + 1
  })

  handle.points.setData(pointData, 3)
  handle.lines.setData(cells)
  handle.points.modified()
  handle.lines.modified()
  handle.polyData.modified()
}

export function niceGridSpacing(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 20
  const exponent = Math.floor(Math.log10(raw))
  const base = 10 ** exponent
  const fraction = raw / base
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * base
}

export function buildGridSegments(
  bounds: [number, number, number, number],
  minorSpacing: number,
  majorEvery = 5,
) {
  const [minX, maxX, minY, maxY] = bounds
  const minor: Array<[number, number, number, number]> = []
  const major: Array<[number, number, number, number]> = []

  const startX = Math.floor(minX / minorSpacing) * minorSpacing
  const endX = Math.ceil(maxX / minorSpacing) * minorSpacing
  const startY = Math.floor(minY / minorSpacing) * minorSpacing
  const endY = Math.ceil(maxY / minorSpacing) * minorSpacing

  let ix = Math.round(startX / minorSpacing)
  for (let x = startX; x <= endX + minorSpacing * 0.25; x += minorSpacing, ix += 1) {
    const target = ix % majorEvery === 0 ? major : minor
    target.push([x, minY, x, maxY])
  }

  let iy = Math.round(startY / minorSpacing)
  for (let y = startY; y <= endY + minorSpacing * 0.25; y += minorSpacing, iy += 1) {
    const target = iy % majorEvery === 0 ? major : minor
    target.push([minX, y, maxX, y])
  }

  return { minor, major }
}

function transformPoint(t: Transform2D, x: number, y: number): [number, number] {
  return [
    t.a * x - t.b * y + t.tx,
    t.b * x + t.a * y + t.ty,
  ]
}

export function createGlobalAxesHandles() {
  return {
    x: createLineActor('#e5484d', 2.6, 0.95),
    y: createLineActor('#1ca64b', 2.6, 0.95),
  }
}

export function updateGlobalAxes(
  handles: ReturnType<typeof createGlobalAxesHandles>,
  bounds: [number, number, number, number],
) {
  const [minX, maxX, minY, maxY] = bounds
  updateLineActor(handles.x, [[minX, 0, maxX, 0]], -0.08)
  updateLineActor(handles.y, [[0, minY, 0, maxY]], -0.08)
}

export function createLocalCoordinateActors(
  transform: Transform2D,
  axisLength = 70,
  halfWidth = 130,
  halfHeight = 140,
) {
  const p1 = transformPoint(transform, -halfWidth, -halfHeight)
  const p2 = transformPoint(transform, halfWidth, -halfHeight)
  const p3 = transformPoint(transform, halfWidth, halfHeight)
  const p4 = transformPoint(transform, -halfWidth, halfHeight)

  const region = createLineActor('#aeb9c6', 1.0, 0.52)
  updateLineActor(region, [
    [p1[0], p1[1], p2[0], p2[1]],
    [p2[0], p2[1], p3[0], p3[1]],
    [p3[0], p3[1], p4[0], p4[1]],
    [p4[0], p4[1], p1[0], p1[1]],
  ], 0.10)

  const origin = transformPoint(transform, 0, 0)
  const xEnd = transformPoint(transform, axisLength, 0)
  const yEnd = transformPoint(transform, 0, axisLength)

  const xAxis = createLineActor('#e5484d', 2.0, 0.95)
  const yAxis = createLineActor('#1ca64b', 2.0, 0.95)
  updateLineActor(xAxis, [[origin[0], origin[1], xEnd[0], xEnd[1]]], 0.16)
  updateLineActor(yAxis, [[origin[0], origin[1], yEnd[0], yEnd[1]]], 0.16)

  return [region.actor, xAxis.actor, yAxis.actor]
}

export function transformedRegionBounds(
  transform: Transform2D,
  halfWidth = 130,
  halfHeight = 140,
): [number, number, number, number] {
  const corners = [
    transformPoint(transform, -halfWidth, -halfHeight),
    transformPoint(transform, halfWidth, -halfHeight),
    transformPoint(transform, halfWidth, halfHeight),
    transformPoint(transform, -halfWidth, halfHeight),
  ]
  const xs = corners.map(p => p[0])
  const ys = corners.map(p => p[1])
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
}

export function transformToMat4(t: Transform2D): Float64Array {
  // vtk.js / gl-matrix uses column-major storage.
  return new Float64Array([
    t.a, t.b, 0, 0,
    -t.b, t.a, 0, 0,
    0, 0, 1, 0,
    t.tx, t.ty, 0, 1,
  ])
}

export function setActorHexColor(actor: any, hex: string) {
  actor.getProperty().setColor(...hexToRgb01(hex))
}
