/**
 * Delta Pavonis Map Format — load/save for the editor.
 *
 * Spec: https://github.com/delta-pavonis/map-format (internal)
 *
 * This module defines the spec types, validates incoming map files, and
 * converts between the editor's internal model (walls + openings + props)
 * and the on-disk JSON format (surfaces + walls + doors + objects + zones).
 */

import { wallLength } from "./map-geometry"
import type { MapDocument, Wall, Prop } from "../types"

// ────────────────────────────────────────────────────────────────────────────
// Spec types (mirrors the format spec exactly)
// ────────────────────────────────────────────────────────────────────────────

export const MAP_FORMAT_VERSION = 1 as const

export type Vec2 = { x: number; y: number }

export type Rect = { x: number; y: number; w: number; h: number }

export type MapFile = {
  version: typeof MAP_FORMAT_VERSION
  meta: MapMetadata
  bounds: Rect
  surfaces: Surface[]
  walls: SpecWall[]
  doors: SpecDoor[]
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

export type SpecWall = {
  id: string
  from: Vec2
  to: Vec2
  width?: number
  material?: string
}

export type SpecDoor = {
  id: string
  wallId: string
  t: number
  width: number
  kind?: string
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

// ────────────────────────────────────────────────────────────────────────────
// Error type
// ────────────────────────────────────────────────────────────────────────────

export class MapFormatError extends Error {
  constructor(message: string) {
    super(`Map format error: ${message}`)
    this.name = "MapFormatError"
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new MapFormatError(message)
}

function isVec2(v: unknown): v is Vec2 {
  return typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).x === "number" && typeof (v as Record<string, unknown>).y === "number"
}

function isPolygon(v: unknown): v is Vec2[] {
  return Array.isArray(v) && v.length >= 3 && v.every(p => isVec2(p))
}

/**
 * Validate a parsed map file and return a typed `MapFile`.
 * Throws `MapFormatError` if validation fails.
 */
export function validateMapFile(data: unknown): MapFile {
  assert(typeof data === "object" && data !== null, "map file must be a JSON object")
  const obj = data as Record<string, unknown>

  // version
  assert(obj.version === MAP_FORMAT_VERSION, `unsupported version: ${obj.version}`)

  // meta
  assert(typeof obj.meta === "object" && obj.meta !== null, "meta must be an object")
  assert(typeof (obj.meta as Record<string, unknown>).name === "string", "meta.name must be a string")

  // bounds
  assert(typeof obj.bounds === "object" && obj.bounds !== null, "bounds must be an object")
  const b = obj.bounds as Record<string, unknown>
  assert(typeof b.x === "number" && typeof b.y === "number" && typeof b.w === "number" && typeof b.h === "number",
    "bounds must have numeric x, y, w, h")

  // surfaces
  assert(Array.isArray(obj.surfaces), "surfaces must be an array")
  for (const [i, s] of obj.surfaces.entries()) {
    const surf = s as Record<string, unknown>
    assert(typeof surf.id === "string", `surfaces[${i}].id must be a string`)
    assert(isPolygon(surf.polygon), `surfaces[${i}].polygon must be a non-empty array of Vec2`)
    assert(typeof surf.material === "string", `surfaces[${i}].material must be a string`)
  }

  // walls
  assert(Array.isArray(obj.walls), "walls must be an array")
  for (const [i, w] of obj.walls.entries()) {
    const wall = w as Record<string, unknown>
    assert(typeof wall.id === "string", `walls[${i}].id must be a string`)
    assert(isVec2(wall.from), `walls[${i}].from must be a Vec2`)
    assert(isVec2(wall.to), `walls[${i}].to must be a Vec2`)
    // from and to should not be identical
    const f = wall.from as Vec2
    const t = wall.to as Vec2
    assert(f.x !== t.x || f.y !== t.y, `walls[${i}].from and .to must not be identical`)
    if (wall.width !== undefined) assert(typeof wall.width === "number" && wall.width > 0, `walls[${i}].width must be a positive number`)
  }

  // doors
  assert(Array.isArray(obj.doors), "doors must be an array")
  for (const [i, d] of obj.doors.entries()) {
    const door = d as Record<string, unknown>
    assert(typeof door.id === "string", `doors[${i}].id must be a string`)
    assert(typeof door.wallId === "string", `doors[${i}].wallId must be a string`)
    assert(typeof door.t === "number" && door.t >= 0 && door.t <= 1, `doors[${i}].t must be a number in [0, 1]`)
    assert(typeof door.width === "number" && door.width > 0, `doors[${i}].width must be a positive number`)
  }

  // objects
  assert(Array.isArray(obj.objects), "objects must be an array")
  for (const [i, o] of obj.objects.entries()) {
    const object = o as Record<string, unknown>
    assert(typeof object.id === "string", `objects[${i}].id must be a string`)
    assert(typeof object.kind === "string", `objects[${i}].kind must be a string`)
    assert(isVec2(object.position), `objects[${i}].position must be a Vec2`)
  }

  // zones (optional)
  if (obj.zones !== undefined) {
    assert(Array.isArray(obj.zones), "zones must be an array")
    for (const [i, z] of obj.zones.entries()) {
      const zone = z as Record<string, unknown>
      assert(typeof zone.id === "string", `zones[${i}].id must be a string`)
      assert(typeof zone.kind === "string", `zones[${i}].kind must be a string`)
      assert(isPolygon(zone.polygon), `zones[${i}].polygon must be a non-empty array of Vec2`)
    }
  }

  return obj as unknown as MapFile
}

// ────────────────────────────────────────────────────────────────────────────
// Save — editor state → MapFile JSON string
// ────────────────────────────────────────────────────────────────────────────

export type SaveMeta = {
  name: string
}

/**
 * Serialize the current editor document into the Delta Pavonis map format.
 *
 * @param doc    The editor's MapDocument (walls + openings + props)
 * @param meta   Map metadata (name, timestamps)
 * @param bounds The room bounds in world space
 * @returns      A pretty-printed JSON string conforming to the spec
 */
export function saveMap(
  doc: MapDocument,
  meta: SaveMeta,
  bounds: Rect,
): string {
  // ── Surfaces ──────────────────────────────────────────────────────────
  // Generate a single floor surface from the room rectangle.
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

  // ── Walls ─────────────────────────────────────────────────────────────
  const walls: SpecWall[] = doc.walls.map(w => ({
    id: w.id,
    from: { x: w.start.x, y: w.start.y },
    to: { x: w.end.x, y: w.end.y },
    width: w.thickness,
  }))

  // ── Doors (and windows) ───────────────────────────────────────────────
  const doors: SpecDoor[] = []
  for (const wall of doc.walls) {
    const length = wallLength(wall)
    if (length <= 0) continue

    for (const opening of wall.openings) {
      doors.push({
        id: opening.id,
        wallId: wall.id,
        t: opening.offset / length,
        width: opening.width,
        kind: opening.kind,
      })
    }
  }

  // ── Objects ───────────────────────────────────────────────────────────
  const objects: SpecObject[] = doc.props.map(p => ({
    id: p.id,
    kind: p.assetId,
    position: { x: p.x, y: p.y },
    rotation: p.rotation,
  }))

  // ── Map file ──────────────────────────────────────────────────────────
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
    doors,
    objects,
  }

  return JSON.stringify(mapFile, null, 2)
}

// ────────────────────────────────────────────────────────────────────────────
// Load — MapFile JSON string → editor state
// ────────────────────────────────────────────────────────────────────────────

export type LoadResult = {
  document: MapDocument
  names: Record<string, string>
  counters: Record<string, number>
  roomWidth: number
  roomHeight: number
  meta: MapMetadata
}

/**
 * Deserialize a Delta Pavonis map file into editor-compatible state.
 *
 * @param json  The raw JSON string to parse
 * @returns     A LoadResult that can be applied to the Zustand store
 * @throws      MapFormatError on invalid/malformed input
 */
export function loadMap(json: string): LoadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new MapFormatError("invalid JSON — could not parse")
  }

  const mapFile = validateMapFile(parsed)

  // ── Resolve wall references ───────────────────────────────────────────
  const wallById = new Map<string, Wall>()

  const walls: Wall[] = []
  let wallIdx = 0
  for (const sw of mapFile.walls) {
    wallIdx++
    const wall: Wall = {
      id: sw.id,
      kind: "wall",
      start: { x: sw.from.x, y: sw.from.y },
      end: { x: sw.to.x, y: sw.to.y },
      thickness: sw.width ?? 8,
      openings: [],
    }
    walls.push(wall)
    wallById.set(sw.id, wall)
  }

  // ── Attach doors/openings to their walls ─────────────────────────────
  let doorCount = 0
  let windowCount = 0
  for (const sd of mapFile.doors) {
    const targetWall = wallById.get(sd.wallId)
    if (!targetWall) continue // orphan door — skip silently

    const length = wallLength(targetWall)
    if (length <= 0) continue

    const offset = sd.t * length
    const kind = sd.kind === "window" ? "window" : "door"

    targetWall.openings.push({
      id: sd.id,
      kind,
      offset,
      width: sd.width,
    })

    if (kind === "door") {
      doorCount++
    } else {
      windowCount++
    }
  }

  // ── Build names ──────────────────────────────────────────────────────
  const names: Record<string, string> = {}
  let wallN = 0
  for (const w of walls) {
    wallN++
    names[w.id] = `Wall_${String(wallN).padStart(3, "0")}`
  }

  let doorN = 0
  let windowN = 0
  for (const w of walls) {
    for (const o of w.openings) {
      if (o.kind === "door") {
        doorN++
        names[o.id] = `Door_${String(doorN).padStart(3, "0")}`
      } else {
        windowN++
        names[o.id] = `Window_${String(windowN).padStart(3, "0")}`
      }
    }
  }

  // ── Objects → Props ──────────────────────────────────────────────────
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
      props,
      referenceImages: [],
    },
    names,
    counters: {
      wall: wallN,
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

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function rectToPolygon(r: Rect): Vec2[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]
}
