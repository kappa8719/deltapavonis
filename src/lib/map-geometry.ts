import type { Opening, PolygonWall, Vec2, Wall, WallOpeningKind } from "../types"

export const PIXELS_PER_UNIT = 6
export const DEFAULT_WALL_THICKNESS = 8
export const DEFAULT_DOOR_WIDTH = 9
export const DEFAULT_WINDOW_WIDTH = 6

const EPSILON = 0.0001

export type LegacyWallRect = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type WallProjection = {
  point: Vec2
  clampedPoint: Vec2
  offset: number
  clampedOffset: number
  distance: number
  withinSegment: boolean
  length: number
}

export type OpeningInterval = {
  opening: Opening
  from: number
  to: number
}

export function convertLegacyWallRect(rect: LegacyWallRect): Wall {
  const horizontal = rect.width >= rect.height
  const thickness = horizontal ? rect.height : rect.width

  if (horizontal) {
    const y = rect.y + rect.height / 2
    return {
      id: rect.id,
      kind: "wall",
      a: { x: rect.x, y },
      b: { x: rect.x + rect.width, y },
      thickness,
      polygonWallId: `${rect.id}-polygon`,
    }
  }

  const x = rect.x + rect.width / 2
  return {
    id: rect.id,
    kind: "wall",
    a: { x, y: rect.y },
    b: { x, y: rect.y + rect.height },
    thickness,
    polygonWallId: `${rect.id}-polygon`,
  }
}

export function getOpeningDefaultWidth(kind: WallOpeningKind) {
  return kind === "door" ? DEFAULT_DOOR_WIDTH : DEFAULT_WINDOW_WIDTH
}

export function wallVector(wall: Wall): Vec2 {
  return {
    x: wall.b.x - wall.a.x,
    y: wall.b.y - wall.a.y,
  }
}

export function wallLength(wall: Wall) {
  const delta = wallVector(wall)
  return Math.hypot(delta.x, delta.y)
}

export function normalize(vec: Vec2): Vec2 {
  const length = Math.hypot(vec.x, vec.y)
  if (length < EPSILON) return { x: 0, y: 0 }
  return { x: vec.x / length, y: vec.y / length }
}

export function wallUnit(wall: Wall): Vec2 {
  return normalize(wallVector(wall))
}

export function wallNormal(wall: Wall): Vec2 {
  const unit = wallUnit(wall)
  return { x: -unit.y, y: unit.x }
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function projectPointOntoWall(point: Vec2, wall: Wall): WallProjection {
  const delta = wallVector(wall)
  const length = Math.hypot(delta.x, delta.y)
  if (length < EPSILON) {
    return {
      point: wall.a,
      clampedPoint: wall.a,
      offset: 0,
      clampedOffset: 0,
      distance: Math.hypot(point.x - wall.a.x, point.y - wall.a.y),
      withinSegment: false,
      length: 0,
    }
  }

  const rel = {
    x: point.x - wall.a.x,
    y: point.y - wall.a.y,
  }
  const along = (rel.x * delta.x + rel.y * delta.y) / length
  const unit = { x: delta.x / length, y: delta.y / length }
  const projected = {
    x: wall.a.x + unit.x * along,
    y: wall.a.y + unit.y * along,
  }
  const clampedOffset = clamp(along, 0, length)
  const clampedPoint = {
    x: wall.a.x + unit.x * clampedOffset,
    y: wall.a.y + unit.y * clampedOffset,
  }

  return {
    point: projected,
    clampedPoint,
    offset: along,
    clampedOffset,
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
    withinSegment: along >= -EPSILON && along <= length + EPSILON,
    length,
  }
}

export function wallLocalToWorld(wall: Wall, along: number, perp = 0): Vec2 {
  const unit = wallUnit(wall)
  const normal = wallNormal(wall)
  return {
    x: wall.a.x + unit.x * along + normal.x * perp,
    y: wall.a.y + unit.y * along + normal.y * perp,
  }
}

export function worldToWallLocal(point: Vec2, wall: Wall) {
  const unit = wallUnit(wall)
  const normal = wallNormal(wall)
  const rel = {
    x: point.x - wall.a.x,
    y: point.y - wall.a.y,
  }

  return {
    along: rel.x * unit.x + rel.y * unit.y,
    perp: rel.x * normal.x + rel.y * normal.y,
  }
}

export function getOpeningInterval(opening: Opening): OpeningInterval {
  return {
    opening,
    from: -opening.width / 2,
    to: opening.width / 2,
  }
}

export function getClampedOpeningIntervals(wall: Wall): OpeningInterval[] {
  void wall
  return []
}

export function getMergedOpeningIntervals(wall: Wall) {
  const intervals = getClampedOpeningIntervals(wall)
  const merged: Array<{ from: number; to: number }> = []

  for (const interval of intervals) {
    const last = merged.at(-1)
    if (!last || interval.from > last.to + EPSILON) {
      merged.push({ from: interval.from, to: interval.to })
      continue
    }

    last.to = Math.max(last.to, interval.to)
  }

  return merged
}

export function getWallSolidIntervals(wall: Wall) {
  const solids: Array<{ from: number; to: number }> = []
  const mergedOpenings = getMergedOpeningIntervals(wall)
  const length = wallLength(wall)
  let cursor = 0

  for (const interval of mergedOpenings) {
    if (interval.from > cursor + EPSILON) {
      solids.push({ from: cursor, to: interval.from })
    }
    cursor = Math.max(cursor, interval.to)
  }

  if (cursor < length - EPSILON) {
    solids.push({ from: cursor, to: length })
  }

  return solids.filter(interval => interval.to - interval.from > EPSILON)
}

export function getWallQuad(wall: Wall, from = 0, to = wallLength(wall), thickness = wall.thickness) {
  const half = thickness / 2
  return [
    wallLocalToWorld(wall, from, -half),
    wallLocalToWorld(wall, to, -half),
    wallLocalToWorld(wall, to, half),
    wallLocalToWorld(wall, from, half),
  ]
}

export function getOpeningQuad(wall: Wall, opening: Opening, thickness = wall.thickness) {
  void wall
  return getRotatedRect(opening.position, opening.width, thickness, opening.rotation)
}

export function canPlaceOpeningOnWall(
  wall: Wall,
  opening: Pick<Opening, "width">,
  ignoreOpeningId?: string
) {
  void wall
  void ignoreOpeningId
  return opening.width > 0
}

export function findNearestValidOpeningOffset(
  wall: Wall,
  width: number,
  desiredOffset: number,
  ignoreOpeningId?: string
) {
  void wall
  void ignoreOpeningId
  return width > 0 ? desiredOffset : null
}

export function createWallPolygon(wall: Pick<Wall, "a" | "b" | "thickness">): Vec2[] {
  const delta = { x: wall.b.x - wall.a.x, y: wall.b.y - wall.a.y }
  const length = Math.hypot(delta.x, delta.y)
  if (length < EPSILON) return []

  const unit = { x: delta.x / length, y: delta.y / length }
  const normal = { x: -unit.y, y: unit.x }
  const half = wall.thickness / 2

  return [
    { x: wall.a.x - normal.x * half, y: wall.a.y - normal.y * half },
    { x: wall.b.x - normal.x * half, y: wall.b.y - normal.y * half },
    { x: wall.b.x + normal.x * half, y: wall.b.y + normal.y * half },
    { x: wall.a.x + normal.x * half, y: wall.a.y + normal.y * half },
  ]
}

export function translatePolygon(vertices: Vec2[], dx: number, dy: number): Vec2[] {
  return vertices.map(vertex => ({ x: vertex.x + dx, y: vertex.y + dy }))
}

export function polygonArea(vertices: Vec2[]) {
  let area = 0
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i]
    const next = vertices[(i + 1) % vertices.length]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

export function isValidPolygon(vertices: Vec2[]) {
  return vertices.length >= 3 &&
    vertices.every(vertex => Number.isFinite(vertex.x) && Number.isFinite(vertex.y)) &&
    Math.abs(polygonArea(vertices)) > EPSILON
}

export function polygonCentroid(vertices: Vec2[]): Vec2 {
  if (!vertices.length) return { x: 0, y: 0 }

  const area = polygonArea(vertices)
  if (Math.abs(area) < EPSILON) {
    const sum = vertices.reduce((acc, vertex) => ({ x: acc.x + vertex.x, y: acc.y + vertex.y }), { x: 0, y: 0 })
    return { x: sum.x / vertices.length, y: sum.y / vertices.length }
  }

  let x = 0
  let y = 0
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i]
    const next = vertices[(i + 1) % vertices.length]
    const cross = current.x * next.y - next.x * current.y
    x += (current.x + next.x) * cross
    y += (current.y + next.y) * cross
  }

  const factor = 1 / (6 * area)
  return { x: x * factor, y: y * factor }
}

export function pointInPolygon(point: Vec2, vertices: Vec2[]) {
  let inside = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]
    const b = vertices[j]
    const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

export function getRotatedRect(center: Vec2, width: number, depth: number, rotation: number): Vec2[] {
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const hw = width / 2
  const hd = depth / 2

  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map(local => ({
    x: center.x + local.x * cos - local.y * sin,
    y: center.y + local.x * sin + local.y * cos,
  }))
}

export function polygonWallFromWall(wall: Wall): PolygonWall {
  return {
    id: wall.polygonWallId,
    kind: "polygonWall",
    vertices: createWallPolygon(wall),
  }
}
