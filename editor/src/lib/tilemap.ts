import type {
  FloorTilemap,
  TileCellChange,
  TileLayer,
  TilesetAsset,
  TilesetReference,
  Vec2,
} from "../types"

export const CHUNK_SIZE = 32
export const DEFAULT_TILE_SIZE = 16
export const BUCKET_FILL_LIMIT = 25000

export type TileCoord = {
  x: number
  y: number
}

export function floorDiv(value: number, divisor: number) {
  return Math.floor(value / divisor)
}

export function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

export function worldToTile(position: Vec2, tileSize: number): TileCoord {
  return {
    x: Math.floor(position.x / tileSize),
    y: Math.floor(position.y / tileSize),
  }
}

export function tileToWorld(tile: TileCoord, tileSize: number): Vec2 {
  return {
    x: tile.x * tileSize,
    y: tile.y * tileSize,
  }
}

export function createDefaultTileLayer(name = "Base"): TileLayer {
  return {
    id: crypto.randomUUID(),
    name,
    order: 0,
    visible: true,
    locked: false,
    chunks: [],
  }
}

export function createDefaultTilemap(tileSize = DEFAULT_TILE_SIZE): FloorTilemap {
  return {
    tileSize,
    tilesets: [],
    layers: [createDefaultTileLayer()],
  }
}

export function createProceduralTileset(tileSize = DEFAULT_TILE_SIZE): TilesetAsset {
  const columns = 4
  const rows = 4
  const canvas = document.createElement("canvas")
  canvas.width = columns * tileSize
  canvas.height = rows * tileSize
  const ctx = canvas.getContext("2d")

  if (ctx) {
    const colors = [
      "#4b5563", "#64748b", "#71717a", "#52525b",
      "#7c6f54", "#5f7161", "#4f6f82", "#6d5f7a",
      "#334155", "#3f3f46", "#365314", "#854d0e",
      "#1f2937", "#374151", "#475569", "#57534e",
    ]

    for (let id = 0; id < colors.length; id++) {
      const x = (id % columns) * tileSize
      const y = Math.floor(id / columns) * tileSize
      ctx.fillStyle = colors[id]
      ctx.fillRect(x, y, tileSize, tileSize)
      ctx.strokeStyle = "rgba(255,255,255,0.18)"
      ctx.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1)
      ctx.fillStyle = "rgba(255,255,255,0.08)"
      ctx.fillRect(x + 2, y + 2, tileSize - 4, Math.max(1, Math.floor(tileSize / 5)))
    }
  }

  return {
    id: "basic-floor",
    name: "Basic Floor",
    texturePath: canvas.toDataURL("image/png"),
    tileWidth: tileSize,
    tileHeight: tileSize,
    columns,
    tileCount: columns * rows,
  }
}

export function getChunkOrigin(tileX: number, tileY: number, chunkSize = CHUNK_SIZE) {
  return {
    x: floorDiv(tileX, chunkSize) * chunkSize,
    y: floorDiv(tileY, chunkSize) * chunkSize,
  }
}

export function getLocalChunkIndex(tileX: number, tileY: number, chunkSize = CHUNK_SIZE) {
  const localX = positiveModulo(tileX, chunkSize)
  const localY = positiveModulo(tileY, chunkSize)
  return localY * chunkSize + localX
}

export function getTile(layer: TileLayer, tileX: number, tileY: number): number {
  const origin = getChunkOrigin(tileX, tileY)
  const chunk = layer.chunks.find(candidate => candidate.x === origin.x && candidate.y === origin.y)
  if (!chunk) return 0
  const localX = tileX - chunk.x
  const localY = tileY - chunk.y
  if (localX < 0 || localY < 0 || localX >= chunk.width || localY >= chunk.height) return 0
  return chunk.data[localY * chunk.width + localX] ?? 0
}

export function setTile(layer: TileLayer, tileX: number, tileY: number, gid: number): TileLayer {
  const origin = getChunkOrigin(tileX, tileY)
  const localIndex = getLocalChunkIndex(tileX, tileY)
  let found = false
  const chunks = layer.chunks.map(chunk => {
    if (chunk.x !== origin.x || chunk.y !== origin.y) return chunk
    found = true
    const data = [...chunk.data]
    data[localIndex] = gid
    return { ...chunk, data }
  })

  if (!found && gid !== 0) {
    const data = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0)
    data[localIndex] = gid
    chunks.push({ x: origin.x, y: origin.y, width: CHUNK_SIZE, height: CHUNK_SIZE, data })
  }

  return {
    ...layer,
    chunks: chunks.filter(chunk => chunk.data.some(cell => cell !== 0)),
  }
}

export function applyTileChanges(layer: TileLayer, changes: TileCellChange[]): TileLayer {
  let next = layer
  for (const change of changes) {
    next = setTile(next, change.x, change.y, change.after)
  }
  return next
}

export function mergeTileChanges(changes: TileCellChange[]): TileCellChange[] {
  const byCoord = new Map<string, TileCellChange>()
  for (const change of changes) {
    const key = `${change.x},${change.y}`
    const existing = byCoord.get(key)
    if (existing) {
      byCoord.set(key, { ...existing, after: change.after })
    } else {
      byCoord.set(key, { ...change })
    }
  }
  return [...byCoord.values()]
    .filter(change => change.before !== change.after)
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

export function getTilesetRange(ref: TilesetReference, asset: TilesetAsset) {
  return {
    start: ref.firstGid,
    end: ref.firstGid + asset.tileCount - 1,
  }
}

export function findTilesetForGid(tilemap: FloorTilemap, assets: Record<string, TilesetAsset>, gid: number) {
  if (gid === 0) return null
  for (const ref of tilemap.tilesets) {
    const asset = assets[ref.tilesetId]
    if (!asset) continue
    const range = getTilesetRange(ref, asset)
    if (gid >= range.start && gid <= range.end) {
      return {
        ref,
        asset,
        localTileId: gid - ref.firstGid,
      }
    }
  }
  return null
}

export function getNextFirstGid(tilemap: FloorTilemap, assets: Record<string, TilesetAsset>) {
  let next = 1
  for (const ref of tilemap.tilesets) {
    const asset = assets[ref.tilesetId]
    if (!asset) continue
    next = Math.max(next, ref.firstGid + asset.tileCount)
  }
  return next
}

export function isTilesetInUse(tilemap: FloorTilemap, assets: Record<string, TilesetAsset>, tilesetId: string) {
  const ref = tilemap.tilesets.find(candidate => candidate.tilesetId === tilesetId)
  const asset = assets[tilesetId]
  if (!ref || !asset) return false
  const range = getTilesetRange(ref, asset)
  return tilemap.layers.some(layer =>
    layer.chunks.some(chunk =>
      chunk.data.some(gid => gid >= range.start && gid <= range.end)
    )
  )
}

export function normalizeLayerOrders(layers: TileLayer[]) {
  return [...layers]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((layer, index) => ({ ...layer, order: index }))
}

export function sortTilemap(tilemap: FloorTilemap): FloorTilemap {
  return {
    ...tilemap,
    tilesets: [...tilemap.tilesets].sort((a, b) => a.firstGid - b.firstGid || a.tilesetId.localeCompare(b.tilesetId)),
    layers: normalizeLayerOrders(tilemap.layers).map(layer => ({
      ...layer,
      chunks: [...layer.chunks]
        .filter(chunk => chunk.data.some(gid => gid !== 0))
        .sort((a, b) => a.y - b.y || a.x - b.x),
    })),
  }
}
