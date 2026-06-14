/**
 * Delta Pavonis Map Format — load/save for the editor.
 */

import { createUnrotatedWallPolygon, isValidPolygon, wallRotation } from "./map-geometry"
import type { MapDocument, Opening, PolygonWall, Prop, Wall } from "../types"

export const MAP_FORMAT_VERSION = 2 as const

export type Vec2 = { x: number; y: number }

export type Rect = { x: number; y: number; w: number; h: number }

export type MapFile = {
  version: typeof MAP_FORMAT_VERSION
  meta: MapMetadata
  bounds: Rect
  surfaces: Surface[]
  walls: SpecWall[]
  openings: SpecOpening[]
  objects: SpecObject[]
  zones?: SpecZone[]
}

export type MapMetadata = {
  name: string
  createdAt?: string
  updatedAt?: string
}

export type Surface = {
  id: string
  polygon: Vec2[]
  material: string
  layer?: number
  walkable?: boolean
  edge?: "auto" | "hard" | "soft"
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

function isVec2(v: unknown): v is Vec2 {
  return typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).x === "number" && typeof (v as Record<string, unknown>).y === "number"
}

function isPolygon(v: unknown): v is Vec2[] {
  return Array.isArray(v) && isValidPolygon(v)
}

export function validateMapFile(data: unknown): MapFile {
  assert(typeof data === "object" && data !== null, "map file must be a JSON object")
  const obj = data as Record<string, unknown>

  assert(obj.version === MAP_FORMAT_VERSION, `unsupported version: ${obj.version}`)

  assert(typeof obj.meta === "object" && obj.meta !== null, "meta must be an object")
  assert(typeof (obj.meta as Record<string, unknown>).name === "string", "meta.name must be a string")

  assert(typeof obj.bounds === "object" && obj.bounds !== null, "bounds must be an object")
  const b = obj.bounds as Record<string, unknown>
  assert(typeof b.x === "number" && typeof b.y === "number" && typeof b.w === "number" && typeof b.h === "number",
    "bounds must have numeric x, y, w, h")

  assert(Array.isArray(obj.surfaces), "surfaces must be an array")
  for (const [i, s] of obj.surfaces.entries()) {
    const surf = s as Record<string, unknown>
    assert(typeof surf.id === "string", `surfaces[${i}].id must be a string`)
    assert(isPolygon(surf.polygon), `surfaces[${i}].polygon must be a valid polygon`)
    assert(typeof surf.material === "string", `surfaces[${i}].material must be a string`)
  }

  assert(Array.isArray(obj.walls), "walls must be an array")
  const polygonWallIds = new Set<string>()
  for (const [i, w] of obj.walls.entries()) {
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
      polygonWallIds.add(wall.id)
    }
  }

  for (const [i, w] of obj.walls.entries()) {
    const wall = w as Record<string, unknown>
    if (wall.kind === "wall") {
      assert(polygonWallIds.has(wall.polygonWallId as string), `walls[${i}].polygonWallId must reference a polygonWall`)
    }
  }

  assert(Array.isArray(obj.openings), "openings must be an array")
  for (const [i, d] of obj.openings.entries()) {
    const opening = d as Record<string, unknown>
    assert(typeof opening.id === "string", `openings[${i}].id must be a string`)
    assert(opening.kind === "door" || opening.kind === "window", `openings[${i}].kind must be door or window`)
    assert(isVec2(opening.position), `openings[${i}].position must be a Vec2`)
    assert(typeof opening.rotation === "number", `openings[${i}].rotation must be a number`)
    assert(typeof opening.width === "number" && opening.width > 0, `openings[${i}].width must be a positive number`)
    assert(typeof opening.depth === "number" && opening.depth > 0, `openings[${i}].depth must be a positive number`)
  }

  assert(Array.isArray(obj.objects), "objects must be an array")
  for (const [i, o] of obj.objects.entries()) {
    const object = o as Record<string, unknown>
    assert(typeof object.id === "string", `objects[${i}].id must be a string`)
    assert(typeof object.kind === "string", `objects[${i}].kind must be a string`)
    assert(isVec2(object.position), `objects[${i}].position must be a Vec2`)
  }

  if (obj.zones !== undefined) {
    assert(Array.isArray(obj.zones), "zones must be an array")
    for (const [i, z] of obj.zones.entries()) {
      const zone = z as Record<string, unknown>
      assert(typeof zone.id === "string", `zones[${i}].id must be a string`)
      assert(typeof zone.kind === "string", `zones[${i}].kind must be a string`)
      assert(isPolygon(zone.polygon), `zones[${i}].polygon must be a valid polygon`)
    }
  }

  return obj as unknown as MapFile
}

export type SaveMeta = {
  name: string
}

export function saveMap(
  doc: MapDocument,
  meta: SaveMeta,
  bounds: Rect,
): string {
  const surfaces: Surface[] = [
    {
      id: "surface-floor",
      polygon: rectToPolygon(bounds),
      material: "concrete",
      layer: 0,
      walkable: true,
      edge: "auto",
    },
  ]

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

  const openings: SpecOpening[] = doc.openings.map(opening => ({
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

  const now = new Date().toISOString()
  const mapFile: MapFile = {
    version: MAP_FORMAT_VERSION,
    meta: {
      name: meta.name,
      createdAt: undefined,
      updatedAt: now,
    },
    bounds,
    surfaces,
    walls,
    openings,
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
  meta: MapMetadata
}

export function loadMap(json: string): LoadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new MapFormatError("invalid JSON - could not parse")
  }

  const mapFile = validateMapFile(parsed)

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

  const openings: Opening[] = mapFile.openings.map(opening => ({
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
    roomWidth: mapFile.bounds.w,
    roomHeight: mapFile.bounds.h,
    meta: mapFile.meta,
  }
}

function rectToPolygon(r: Rect): Vec2[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]
}
