import type { Vec2, Wall, WallOpening, WallOpeningKind } from "../types"

export const PIXELS_PER_UNIT = 6
export const DEFAULT_WALL_THICKNESS = 8
export const DEFAULT_DOOR_WIDTH = 9
export const DEFAULT_WINDOW_WIDTH = 6
export const GRID_THIN = 1
export const GRID_MEDIUM = 5
export const GRID_STRONG = 10

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
  opening: WallOpening
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
      start: { x: rect.x, y },
      end: { x: rect.x + rect.width, y },
      thickness,
      openings: [],
    }
  }

  const x = rect.x + rect.width / 2
  return {
    id: rect.id,
    kind: "wall",
    start: { x, y: rect.y },
    end: { x, y: rect.y + rect.height },
    thickness,
    openings: [],
  }
}

export function getOpeningDefaultWidth(kind: WallOpeningKind) {
  return kind === "door" ? DEFAULT_DOOR_WIDTH : DEFAULT_WINDOW_WIDTH
}

export function wallVector(wall: Wall): Vec2 {
  return {
    x: wall.end.x - wall.start.x,
    y: wall.end.y - wall.start.y,
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
      point: wall.start,
      clampedPoint: wall.start,
      offset: 0,
      clampedOffset: 0,
      distance: Math.hypot(point.x - wall.start.x, point.y - wall.start.y),
      withinSegment: false,
      length: 0,
    }
  }

  const rel = {
    x: point.x - wall.start.x,
    y: point.y - wall.start.y,
  }
  const along = (rel.x * delta.x + rel.y * delta.y) / length
  const unit = { x: delta.x / length, y: delta.y / length }
  const projected = {
    x: wall.start.x + unit.x * along,
    y: wall.start.y + unit.y * along,
  }
  const clampedOffset = clamp(along, 0, length)
  const clampedPoint = {
    x: wall.start.x + unit.x * clampedOffset,
    y: wall.start.y + unit.y * clampedOffset,
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
    x: wall.start.x + unit.x * along + normal.x * perp,
    y: wall.start.y + unit.y * along + normal.y * perp,
  }
}

export function worldToWallLocal(point: Vec2, wall: Wall) {
  const unit = wallUnit(wall)
  const normal = wallNormal(wall)
  const rel = {
    x: point.x - wall.start.x,
    y: point.y - wall.start.y,
  }

  return {
    along: rel.x * unit.x + rel.y * unit.y,
    perp: rel.x * normal.x + rel.y * normal.y,
  }
}

export function getOpeningInterval(opening: WallOpening): OpeningInterval {
  return {
    opening,
    from: opening.offset - opening.width / 2,
    to: opening.offset + opening.width / 2,
  }
}

export function getClampedOpeningIntervals(wall: Wall): OpeningInterval[] {
  const length = wallLength(wall)

  return [...wall.openings]
    .map(getOpeningInterval)
    .map(interval => ({
      ...interval,
      from: clamp(interval.from, 0, length),
      to: clamp(interval.to, 0, length),
    }))
    .filter(interval => interval.to - interval.from > EPSILON)
    .sort((a, b) => a.from - b.from)
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

export function getOpeningQuad(wall: Wall, opening: WallOpening, thickness = wall.thickness) {
  const interval = getOpeningInterval(opening)
  return getWallQuad(wall, interval.from, interval.to, thickness)
}

export function canPlaceOpeningOnWall(
  wall: Wall,
  opening: Pick<WallOpening, "offset" | "width">,
  ignoreOpeningId?: string
) {
  const length = wallLength(wall)
  const from = opening.offset - opening.width / 2
  const to = opening.offset + opening.width / 2

  if (opening.width <= 0 || length < EPSILON) return false
  if (from < -EPSILON || to > length + EPSILON) return false

  return !wall.openings.some(candidate => {
    if (candidate.id === ignoreOpeningId) return false
    const interval = getOpeningInterval(candidate)
    return from < interval.to - EPSILON && to > interval.from + EPSILON
  })
}

export function findNearestValidOpeningOffset(
  wall: Wall,
  width: number,
  desiredOffset: number,
  ignoreOpeningId?: string
) {
  const length = wallLength(wall)
  if (width <= 0 || length < EPSILON || width > length + EPSILON) return null

  const intervals = getClampedOpeningIntervals({
    ...wall,
    openings: wall.openings.filter(opening => opening.id !== ignoreOpeningId),
  })

  const gaps: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const interval of intervals) {
    if (interval.from > cursor + EPSILON) {
      gaps.push({ start: cursor, end: interval.from })
    }
    cursor = Math.max(cursor, interval.to)
  }
  if (cursor < length - EPSILON) {
    gaps.push({ start: cursor, end: length })
  }

  let bestOffset: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const gap of gaps) {
    if (gap.end - gap.start < width - EPSILON) continue
    const minCenter = gap.start + width / 2
    const maxCenter = gap.end - width / 2
    const candidate = clamp(desiredOffset, minCenter, maxCenter)
    const distance = Math.abs(candidate - desiredOffset)

    if (distance < bestDistance) {
      bestDistance = distance
      bestOffset = candidate
    }
  }

  return bestOffset
}
