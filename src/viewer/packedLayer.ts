export type PackedGalvoGeometry = {
  folder: number
  pointCount: number
  points: Float32Array
  lineValues: Uint32Array
}

export type PackedLayer = {
  layer: number
  geometries: PackedGalvoGeometry[]
}

const MAGIC = 'VGEO0001'
const textDecoder = new TextDecoder('ascii')

export function parsePackedLayer(buffer: ArrayBuffer): PackedLayer {
  if (buffer.byteLength < 16) throw new Error('图层数据过短')

  const magic = textDecoder.decode(new Uint8Array(buffer, 0, 8))
  if (magic !== MAGIC) throw new Error(`未知图层数据格式: ${magic}`)

  const view = new DataView(buffer)
  const layer = view.getUint32(8, true)
  const count = view.getUint32(12, true)
  let offset = 16
  const geometries: PackedGalvoGeometry[] = []

  for (let i = 0; i < count; i += 1) {
    if (offset + 16 > buffer.byteLength) throw new Error('图层项目头越界')

    const folder = view.getUint32(offset, true)
    const pointCount = view.getUint32(offset + 4, true)
    const lineValueCount = view.getUint32(offset + 8, true)
    const flags = view.getUint32(offset + 12, true)
    offset += 16

    if ((flags & 1) === 0) continue

    const pointScalarCount = pointCount * 3
    const pointBytes = pointScalarCount * 4
    const lineBytes = lineValueCount * 4
    if (offset + pointBytes + lineBytes > buffer.byteLength) {
      throw new Error(`振镜 ${folder} 图层数据越界`)
    }

    const points = new Float32Array(buffer, offset, pointScalarCount)
    offset += pointBytes
    const lineValues = new Uint32Array(buffer, offset, lineValueCount)
    offset += lineBytes

    geometries.push({ folder, pointCount, points, lineValues })
  }

  return { layer, geometries }
}
