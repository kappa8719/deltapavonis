/**
 * Delta Pavonis Map Format v3 - tilemap floors plus polygon walls.
 */

import { createUnrotatedWallPolygon, isValidPolygon, wallRotation } from "./map-geometry"
import { findTilesetForGid, getTilesetRange, sortTilemap } from "./tilemap"
import type {
  FloorTilemap,
  MapDocument,
  Opening,
  PolygonWall,
  Prop,
  TileChunk,
  TileLayer,
  TilesetAsset,
  Wall,
} from "../types"

export const MAP_FORMAT_VERSION = 3 as const

export type Vec2 = { x: number; y: number }

export type MapFile = {
  version: typeof MAP_FORMAT_VERSION
  tilemap: FloorTilemap
  walls: SpecWall[]
  doors: SpecOpening[]
  objects: SpecObject[]
  zones?: SpecZone[]
}

export type SpecEditorWall = {
  id: string
  kind: "wall"
  a: Vec2
  b: Vec2
  thickness: number
  polygonWallId: string
}

export type SpecPolygonWall = {
  id: string
  kind: "polygonWall"
  vertices: Vec2[]
  rotation?: number
  material?: string
}

export type SpecWall = SpecEditorWall | SpecPolygonWall

export type SpecOpening = {
  id: string
  kind: "door" | "window"
  position: Vec2
  rotation: number
  width: number
  depth: number
}

export type SpecObject = {
  id: string
  kind: string
  position: Vec2
  rotation?: number
  properties?: Record<string, unknown>
}

export type SpecZone = {
  id: string
  kind: string
  polygon: Vec2[]
  properties?: Record<string, unknown>
}

export class MapFormatError extends Error {
  constructor(message: string) {
    super(`Map format error: ${message}`)
    this.name = "MapFormatError"
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new MapFormatError(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isVec2(v: unknown): v is Vec2 {
  return isRecord(v) && typeof v.x === "number" && typeof v.y === "number"
}

function isPolygon(v: unknown): v is Vec2[] {
  return Array.isArray(v) && isValidPolygon(v)
}

function validateTileChunk(chunk: unknown, path: string): TileChunk {
  assert(isRecord(chunk), `${path} must be an object`)
  assert(Number.isInteger(chunk.x), `${path}.x must be an integer`)
  assert(Number.isInteger(chunk.y), `${path}.y must be an integer`)
  const widthValue = chunk.width
  const heightValue = chunk.height
  assert(Number.isInteger(widthValue) && (widthValue as number) > 0, `${path}.width must be a positive integer`)
  assert(Number.isInteger(heightValue) && (heightValue as number) > 0, `${path}.height must be a positive integer`)
  assert(Array.isArray(chunk.data), `${path}.data must be an array`)
  const width = widthValue as number
  const height = heightValue as number
  assert(chunk.data.length === width * height, `${path}.data length must equal width * height`)
  for (const [i, gid] of chunk.data.entries()) {
    assert(Number.isInteger(gid) && gid >= 0, `${path}.data[${i}] must be a non-negative integer GID`)
  }
  return chunk as unknown as TileChunk
}

function validateTileLayer(layer: unknown, index: number): TileLayer {
  const path = `tilemap.layers[${index}]`
  assert(isRecord(layer), `${path} must be an object`)
  assert(typeof layer.id === "string" && layer.id.length > 0, `${path}.id must be a string`)
  assert(typeof layer.name === "string", `${path}.name must be a string`)
  assert(Number.isInteger(layer.order), `${path}.order must be an integer`)
  assert(typeof layer.visible === "boolean", `${path}.visible must be a boolean`)
  assert(typeof layer.locked === "boolean", `${path}.locked must be a boolean`)
  assert(Array.isArray(layer.chunks), `${path}.chunks must be an array`)

  const seenChunks = new Set<string>()
  const chunks = layer.chunks.map((chunk, chunkIndex) => {
    const validated = validateTileChunk(chunk, `${path}.chunks[${chunkIndex}]`)
    const key = `${validated.x},${validated.y}`
    assert(!seenChunks.has(key), `${path}.chunks has duplicate coordinate ${key}`)
    seenChunks.add(key)
    return validated
  })

  return { ...(layer as unknown as TileLayer), chunks }
}

function validateTilemap(tilemap: unknown, assets: Record<string, TilesetAsset> = {}): FloorTilemap {
  assert(isRecord(tilemap), "tilemap must be an object")
  assert(typeof tilemap.tileSize === "number" && tilemap.tileSize > 0, "tilemap.tileSize must be a positive number")
  assert(Array.isArray(tilemap.tilesets), "tilemap.tilesets must be an array")
  assert(Array.isArray(tilemap.layers), "tilemap.layers must be an array")

  const seenTilesets = new Set<string>()
  const refs = tilemap.tilesets.map((ref, index) => {
    assert(isRecord(ref), `tilemap.tilesets[${index}] must be an object`)
    assert(typeof ref.tilesetId === "string" && ref.tilesetId.length > 0, `tilemap.tilesets[${index}].tilesetId must be a string`)
    const firstGid = ref.firstGid
    assert(Number.isInteger(firstGid) && (firstGid as number) > 0, `tilemap.tilesets[${index}].firstGid must be a positive integer`)
    assert(!seenTilesets.has(ref.tilesetId), `duplicate tileset id: ${ref.tilesetId}`)
    seenTilesets.add(ref.tilesetId)
    return { tilesetId: ref.tilesetId, firstGid: firstGid as number }
  })

  const knownRanges = refs
    .map(ref => {
      const asset = assets[ref.tilesetId]
      return asset ? { id: ref.tilesetId, ...getTilesetRange(ref, asset) } : null
    })
    .filter((range): range is { id: string; start: number; end: number } => Boolean(range))

  for (let i = 0; i < knownRanges.length; i++) {
    for (let j = i + 1; j < knownRanges.length; j++) {
      const a = knownRanges[i]
      const b = knownRanges[j]
      assert(a.end < b.start || b.end < a.start, `tileset GID ranges overlap: ${a.id} and ${b.id}`)
    }
  }

  const seenLayers = new Set<string>()
  const seenOrders = new Set<number>()
  const layers = tilemap.layers.map((layer, index) => {
    const validated = validateTileLayer(layer, index)
    assert(!seenLayers.has(validated.id), `duplicate layer id: ${validated.id}`)
    assert(!seenOrders.has(validated.order), `duplicate layer order: ${validated.order}`)
    seenLayers.add(validated.id)
    seenOrders.add(validated.order)

    for (const chunk of validated.chunks) {
      for (const gid of chunk.data) {
        if (gid === 0) continue
        if (knownRanges.length > 0) {
          assert(Boolean(findTilesetForGid({ tileSize: tilemap.tileSize as number, tilesets: refs, layers: [] }, assets, gid)),
            `invalid GID ${gid} in layer ${validated.id}`)
        }
      }
    }

    return validated
  })

  return sortTilemap({ tileSize: tilemap.tileSize as number, tilesets: refs, layers })
}

export function validateMapFile(data: unknown, assets: Record<string, TilesetAsset> = {}): MapFile {
  assert(isRecord(data), "map file must be a JSON object")
  assert(data.version === MAP_FORMAT_VERSION, `unsupported version: ${data.version}. This editor only loads map format v3 tilemaps.`)

  const tilemap = validateTilemap(data.tilemap, assets)

  assert(Array.isArray(data.walls), "walls must be an array")
  const polygonWallIds = new Set<string>()
  for (const [i, w] of data.walls.entries()) {
    const wall = w as Record<string, unknown>
    assert(typeof wall.id === "string", `walls[${i}].id must be a string`)
    assert(wall.kind === "wall" || wall.kind === "polygonWall", `walls[${i}].kind must be wall or polygonWall`)

    if (wall.kind === "wall") {
      assert(isVec2(wall.a), `walls[${i}].a must be a Vec2`)
      assert(isVec2(wall.b), `walls[${i}].b must be a Vec2`)
      assert(typeof wall.thickness === "number" && wall.thickness > 0, `walls[${i}].thickness must be a positive number`)
      assert(typeof wall.polygonWallId === "string", `walls[${i}].polygonWallId must be a string`)
    } else {
      assert(isPolygon(wall.vertices), `walls[${i}].vertices must be a valid polygon`)
      assert(wall.rotation === undefined || typeof wall.rotation === "number", `walls[${i}].rotation must be a number`)
      polygonWallIds.add(wall.id as string)
    }
  }

  for (const [i, w] of data.walls.entries()) {
    const wall = w as Record<string, unknown>
    if (wall.kind === "wall") {
      assert(polygonWallIds.has(wall.polygonWallId as string), `walls[${i}].polygonWallId must reference a polygonWall`)
    }
  }

  assert(Array.isArray(data.doors), "doors must be an array")
  for (const [i, d] of data.doors.entries()) {
    const opening = d as Record<string, unknown>
    assert(typeof opening.id === "string", `doors[${i}].id must be a string`)
    assert(opening.kind === "door" || opening.kind === "window", `doors[${i}].kind must be door or window`)
    assert(isVec2(opening.position), `doors[${i}].position must be a Vec2`)
    assert(typeof opening.rotation === "number", `doors[${i}].rotation must be a number`)
    assert(typeof opening.width === "number" && opening.width > 0, `doors[${i}].width must be a positive number`)
    assert(typeof opening.depth === "number" && opening.depth > 0, `doors[${i}].depth must be a positive number`)
  }

  assert(Array.isArray(data.objects), "objects must be an array")
  for (const [i, o] of data.objects.entries()) {
    const object = o as Record<string, unknown>
    assert(typeof object.id === "string", `objects[${i}].id must be a string`)
    assert(typeof object.kind === "string", `objects[${i}].kind must be a string`)
    assert(isVec2(object.position), `objects[${i}].position must be a Vec2`)
  }

  if (data.zones !== undefined) {
    assert(Array.isArray(data.zones), "zones must be an array")
    for (const [i, z] of data.zones.entries()) {
      const zone = z as Record<string, unknown>
      assert(typeof zone.id === "string", `zones[${i}].id must be a string`)
      assert(typeof zone.kind === "string", `zones[${i}].kind must be a string`)
      assert(isPolygon(zone.polygon), `zones[${i}].polygon must be a valid polygon`)
    }
  }

  return { ...(data as unknown as MapFile), tilemap }
}

export function saveMap(doc: MapDocument, assets: Record<string, TilesetAsset>): string {
  const tilemap = validateTilemap(doc.tilemap, assets)

  const walls: SpecWall[] = [
    ...doc.walls.map(w => ({
      id: w.id,
      kind: "wall" as const,
      a: { x: w.a.x, y: w.a.y },
      b: { x: w.b.x, y: w.b.y },
      thickness: w.thickness,
      polygonWallId: w.polygonWallId,
    })),
    ...doc.polygonWalls.map(w => ({
      id: w.id,
      kind: "polygonWall" as const,
      vertices: w.vertices.map(vertex => ({ x: vertex.x, y: vertex.y })),
      rotation: w.rotation,
      material: w.material,
    })),
  ]

  const doors: SpecOpening[] = doc.openings.map(opening => ({
    id: opening.id,
    kind: opening.kind,
    position: { x: opening.position.x, y: opening.position.y },
    rotation: opening.rotation,
    width: opening.width,
    depth: opening.depth,
  }))

  const objects: SpecObject[] = doc.props.map(p => ({
    id: p.id,
    kind: p.assetId,
    position: { x: p.x, y: p.y },
    rotation: p.rotation,
  }))

  const mapFile: MapFile = {
    version: MAP_FORMAT_VERSION,
    tilemap,
    walls,
    doors,
    objects,
  }

  return JSON.stringify(mapFile, null, 2)
}

export type LoadResult = {
  document: MapDocument
  names: Record<string, string>
  counters: Record<string, number>
  roomWidth: number
  roomHeight: number
  tilesetAssets?: Record<string, TilesetAsset>
}

export function loadMap(json: string, assets: Record<string, TilesetAsset> = {}): LoadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new MapFormatError("invalid JSON - could not parse")
  }

  const mapFile = validateMapFile(parsed, assets)

  const walls: Wall[] = []
  const polygonWalls: PolygonWall[] = []

  for (const sw of mapFile.walls) {
    if (sw.kind === "wall") {
      walls.push({
        id: sw.id,
        kind: "wall",
        a: { x: sw.a.x, y: sw.a.y },
        b: { x: sw.b.x, y: sw.b.y },
        thickness: sw.thickness,
        polygonWallId: sw.polygonWallId,
      })
    } else {
      polygonWalls.push({
        id: sw.id,
        kind: "polygonWall",
        vertices: sw.vertices.map(vertex => ({ x: vertex.x, y: vertex.y })),
        rotation: sw.rotation ?? 0,
        material: sw.material,
      })
    }
  }

  const polygonById = new Map(polygonWalls.map(polygonWall => [polygonWall.id, polygonWall]))
  for (const wall of walls) {
    const polygonWall = polygonById.get(wall.polygonWallId)
    if (polygonWall) {
      polygonWall.vertices = createUnrotatedWallPolygon(wall)
      polygonWall.rotation = wallRotation(wall)
    }
  }

  const openings: Opening[] = mapFile.doors.map(opening => ({
    id: opening.id,
    kind: opening.kind,
    position: { x: opening.position.x, y: opening.position.y },
    rotation: opening.rotation,
    width: opening.width,
    depth: opening.depth,
  }))

  const names: Record<string, string> = {}
  let wallN = 0
  for (const w of walls) {
    wallN++
    names[w.id] = `Wall_${String(wallN).padStart(3, "0")}`
  }

  let polygonWallN = 0
  for (const w of polygonWalls) {
    polygonWallN++
    names[w.id] = `PolygonWall_${String(polygonWallN).padStart(3, "0")}`
  }

  let doorN = 0
  let windowN = 0
  for (const opening of openings) {
    if (opening.kind === "door") {
      doorN++
      names[opening.id] = `Door_${String(doorN).padStart(3, "0")}`
    } else {
      windowN++
      names[opening.id] = `Window_${String(windowN).padStart(3, "0")}`
    }
  }

  let propCount = 0
  const props: Prop[] = mapFile.objects.map(obj => {
    propCount++
    const prop: Prop = {
      id: obj.id,
      kind: "prop",
      x: obj.position.x,
      y: obj.position.y,
      assetId: obj.kind,
      rotation: obj.rotation,
    }
    names[obj.id] = `${obj.kind.charAt(0).toUpperCase() + obj.kind.slice(1)}_${String(propCount).padStart(3, "0")}`
    return prop
  })

  return {
    document: {
      tilemap: mapFile.tilemap,
      walls,
      polygonWalls,
      openings,
      props,
      referenceImages: [],
    },
    names,
    counters: {
      wall: wallN,
      polygonWall: polygonWallN,
      door: doorN,
      window: windowN,
      prop: propCount,
      referenceImage: 0,
    },
    roomWidth: 100,
    roomHeight: 100,
  }
}
