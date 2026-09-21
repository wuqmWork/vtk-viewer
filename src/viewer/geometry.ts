import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor'
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper'
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData'
import vtkPoints from '@kitware/vtk.js/Common/Core/Points'
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray'
import type { Transform2D } from '../types'

function hexToRgb01(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  const n = Number.parseInt(normalized, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function makeLineActor(
  segments: Array<[number, number, number, number]>,
  color: string,
  width = 1,
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

  const points = vtkPoints.newInstance()
  points.setData(pointData, 3)
  const lines = vtkCellArray.newInstance({ values: cells })
  const poly = vtkPolyData.newInstance()
  poly.setPoints(points)
  poly.setLines(lines)

  const mapper = vtkMapper.newInstance()
  mapper.setInputData(poly)
  const actor = vtkActor.newInstance()
  actor.setMapper(mapper)
  actor.getProperty().setColor(...hexToRgb01(color))
  actor.getProperty().setLineWidth(width)
  actor.getProperty().setLighting(false)
  actor.setPickable(false)
  return actor
}

export function createWorldGrid() {
  const minor: Array<[number, number, number, number]> = []
  const major: Array<[number, number, number, number]> = []
  const minX = -1800, maxX = 1800, minY = -500, maxY = 500
  const spacing = 20
  const majorEvery = 5

  for (let x = minX; x <= maxX; x += spacing) {
    const target = Math.round(x / spacing) % majorEvery === 0 ? major : minor
    target.push([x, minY, x, maxY])
  }
  for (let y = minY; y <= maxY; y += spacing) {
    const target = Math.round(y / spacing) % majorEvery === 0 ? major : minor
    target.push([minX, y, maxX, y])
  }

  return {
    minor: makeLineActor(minor, '#edf1f5', 1, -0.4),
    major: makeLineActor(major, '#d9e0e8', 1.2, -0.35),
  }
}

export function createGlobalAxes() {
  return [
    makeLineActor([[-1800, 0, 1800, 0]], '#ef4444', 2.5, -0.1),
    makeLineActor([[0, -500, 0, 500]], '#22a447', 2.5, -0.1),
  ]
}

export function createLocalAxes(transform: Transform2D, axisLength = 80) {
  const ox = transform.tx
  const oy = transform.ty
  const xEndX = ox + transform.a * axisLength
  const xEndY = oy + transform.b * axisLength
  const yEndX = ox - transform.b * axisLength
  const yEndY = oy + transform.a * axisLength
  return [
    makeLineActor([[ox, oy, xEndX, xEndY]], '#ef4444', 2.2, 0.15),
    makeLineActor([[ox, oy, yEndX, yEndY]], '#22a447', 2.2, 0.15),
  ]
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
