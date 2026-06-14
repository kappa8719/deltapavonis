import type { Opening, PolygonWall, Vec2, Wall, WallOpeningKind } from "../types"

export const PIXELS_PER_UNIT = 6
export const DEFAULT_WALL_THICKNESS = 8
export const DEFAULT_DOOR_WIDTH = 9
export const DEFAULT_WINDOW_WIDTH = 6

const EPSILON = 0.0001
const KEY_SCALE = 100000

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

export function wallRotation(wall: Wall) {
  const delta = wallVector(wall)
  return (Math.atan2(delta.y, delta.x) * 180) / Math.PI
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

function pointKey(point: Vec2) {
  return `${Math.round(point.x * KEY_SCALE)},${Math.round(point.y * KEY_SCALE)}`
}

function segmentKey(a: Vec2, b: Vec2) {
  const aKey = pointKey(a)
  const bKey = pointKey(b)
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`
}

function almostEqual(a: number, b: number) {
  return Math.abs(a - b) <= EPSILON
}

function pointsAlmostEqual(a: Vec2, b: Vec2) {
  return almostEqual(a.x, b.x) && almostEqual(a.y, b.y)
}

function cross(a: Vec2, b: Vec2) {
  return a.x * b.y - a.y * b.x
}

function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

function segmentPointAt(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

function clamp01(value: number) {
  return clamp(value, 0, 1)
}

function pointOnSegment(point: Vec2, a: Vec2, b: Vec2) {
  const ab = subtract(b, a)
  const ap = subtract(point, a)
  if (Math.abs(cross(ab, ap)) > EPSILON) return false
  return point.x >= Math.min(a.x, b.x) - EPSILON &&
    point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON &&
    point.y <= Math.max(a.y, b.y) + EPSILON
}

function pointInPolygonStrict(point: Vec2, vertices: Vec2[]) {
  for (let i = 0; i < vertices.length; i++) {
    if (pointOnSegment(point, vertices[i], vertices[(i + 1) % vertices.length])) return false
  }
  return pointInPolygon(point, vertices)
}

function addUniqueParam(params: number[], value: number) {
  const clamped = clamp01(value)
  if (!params.some(candidate => almostEqual(candidate, clamped))) {
    params.push(clamped)
  }
}

function addSegmentIntersections(a: Vec2, b: Vec2, c: Vec2, d: Vec2, abParams: number[], cdParams: number[]) {
  const r = subtract(b, a)
  const s = subtract(d, c)
  const denominator = cross(r, s)
  const ca = subtract(c, a)

  if (Math.abs(denominator) > EPSILON) {
    const t = cross(ca, s) / denominator
    const u = cross(ca, r) / denominator
    if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
      addUniqueParam(abParams, t)
      addUniqueParam(cdParams, u)
    }
    return
  }

  if (Math.abs(cross(ca, r)) > EPSILON) return

  const rr = r.x * r.x + r.y * r.y
  const ss = s.x * s.x + s.y * s.y
  if (rr < EPSILON || ss < EPSILON) return

  const cOnAb = ((c.x - a.x) * r.x + (c.y - a.y) * r.y) / rr
  const dOnAb = ((d.x - a.x) * r.x + (d.y - a.y) * r.y) / rr
  const aOnCd = ((a.x - c.x) * s.x + (a.y - c.y) * s.y) / ss
  const bOnCd = ((b.x - c.x) * s.x + (b.y - c.y) * s.y) / ss

  if (Math.max(Math.min(cOnAb, dOnAb), 0) <= Math.min(Math.max(cOnAb, dOnAb), 1) + EPSILON) {
    addUniqueParam(abParams, cOnAb)
    addUniqueParam(abParams, dOnAb)
    addUniqueParam(cdParams, aOnCd)
    addUniqueParam(cdParams, bOnCd)
  }
}

export function removeCollinearVertices(vertices: Vec2[]) {
  if (vertices.length <= 3) return vertices

  const result: Vec2[] = []
  for (let i = 0; i < vertices.length; i++) {
    const previous = vertices[(i - 1 + vertices.length) % vertices.length]
    const current = vertices[i]
    const next = vertices[(i + 1) % vertices.length]
    if (pointsAlmostEqual(previous, current) || pointsAlmostEqual(current, next)) continue

    const before = subtract(current, previous)
    const after = subtract(next, current)
    if (Math.abs(cross(before, after)) <= EPSILON) continue

    result.push(current)
  }

  return result.length >= 3 ? result : vertices
}

type SplitEdge = {
  polygonIndex: number
  from: Vec2
  to: Vec2
  params: number[]
}

type DirectedSegment = {
  from: Vec2
  to: Vec2
  fromKey: string
  toKey: string
  key: string
}

function normalizePolygonOrientation(vertices: Vec2[]) {
  const clean = removeCollinearVertices(vertices)
  return polygonArea(clean) < 0 ? [...clean].reverse() : clean
}

function splitPolygonEdges(polygons: Vec2[][]) {
  const edges: SplitEdge[] = []

  polygons.forEach((vertices, polygonIndex) => {
    vertices.forEach((from, index) => {
      edges.push({
        polygonIndex,
        from,
        to: vertices[(index + 1) % vertices.length],
        params: [0, 1],
      })
    })
  })

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i]
      const b = edges[j]
      if (a.polygonIndex === b.polygonIndex) continue
      addSegmentIntersections(a.from, a.to, b.from, b.to, a.params, b.params)
    }
  }

  return edges
}

function traceUnionLoops(segments: DirectedSegment[]) {
  const byStart = new Map<string, DirectedSegment[]>()
  for (const segment of segments) {
    const outgoing = byStart.get(segment.fromKey) || []
    outgoing.push(segment)
    byStart.set(segment.fromKey, outgoing)
  }

  const unused = new Set(segments.map(segment => `${segment.fromKey}>${segment.toKey}`))
  const loops: Vec2[][] = []

  for (const segment of segments) {
    const firstKey = `${segment.fromKey}>${segment.toKey}`
    if (!unused.has(firstKey)) continue

    const loop: Vec2[] = []
    let current = segment

    for (let guard = 0; guard < segments.length + 1; guard++) {
      const currentKey = `${current.fromKey}>${current.toKey}`
      if (!unused.delete(currentKey)) break

      loop.push(current.from)
      if (current.toKey === segment.fromKey) {
        const clean = removeCollinearVertices(loop)
        if (isValidPolygon(clean)) loops.push(polygonArea(clean) < 0 ? clean.reverse() : clean)
        break
      }

      const outgoing = byStart.get(current.toKey)?.filter(candidate =>
        unused.has(`${candidate.fromKey}>${candidate.toKey}`)
      )
      if (!outgoing?.length) break

      const incomingAngle = Math.atan2(current.to.y - current.from.y, current.to.x - current.from.x)
      current = outgoing.reduce((best, candidate) => {
        const bestTurn = clockwiseTurn(incomingAngle, best)
        const candidateTurn = clockwiseTurn(incomingAngle, candidate)
        return candidateTurn < bestTurn ? candidate : best
      })
    }
  }

  return loops
}

function clockwiseTurn(incomingAngle: number, segment: DirectedSegment) {
  const outgoingAngle = Math.atan2(segment.to.y - segment.from.y, segment.to.x - segment.from.x)
  return (incomingAngle - outgoingAngle + Math.PI * 2) % (Math.PI * 2)
}

export function unionPolygons(polygons: Vec2[][]): Vec2[] | null {
  const validPolygons = polygons
    .map(normalizePolygonOrientation)
    .filter(isValidPolygon)

  if (validPolygons.length === 0) return null
  if (validPolygons.length === 1) return removeCollinearVertices(validPolygons[0])

  const splitEdges = splitPolygonEdges(validPolygons)
  const directed: DirectedSegment[] = []

  for (const edge of splitEdges) {
    const params = [...edge.params].sort((a, b) => a - b)
    for (let i = 0; i < params.length - 1; i++) {
      const from = segmentPointAt(edge.from, edge.to, params[i])
      const to = segmentPointAt(edge.from, edge.to, params[i + 1])
      if (pointsAlmostEqual(from, to)) continue

      const midpoint = segmentPointAt(from, to, 0.5)
      const coveredByOther = validPolygons.some((vertices, polygonIndex) =>
        polygonIndex !== edge.polygonIndex && pointInPolygonStrict(midpoint, vertices)
      )
      if (coveredByOther) continue

      directed.push({
        from,
        to,
        fromKey: pointKey(from),
        toKey: pointKey(to),
        key: segmentKey(from, to),
      })
    }
  }

  const counts = new Map<string, number>()
  for (const segment of directed) {
    counts.set(segment.key, (counts.get(segment.key) || 0) + 1)
  }

  const boundary = directed.filter(segment => counts.get(segment.key) === 1)
  const loops = traceUnionLoops(boundary)
  if (loops.length !== 1) return null

  return removeCollinearVertices(loops[0])
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

export function rotatePolygon(vertices: Vec2[], rotation: number, center = polygonCentroid(vertices)): Vec2[] {
  if (Math.abs(rotation) < EPSILON) return vertices.map(vertex => ({ ...vertex }))

  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  return vertices.map(vertex => {
    const dx = vertex.x - center.x
    const dy = vertex.y - center.y
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    }
  })
}

export function createUnrotatedWallPolygon(wall: Pick<Wall, "a" | "b" | "thickness">): Vec2[] {
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
  if (length < EPSILON) return []

  const center = {
    x: (wall.a.x + wall.b.x) / 2,
    y: (wall.a.y + wall.b.y) / 2,
  }
  const halfLength = length / 2
  const halfThickness = wall.thickness / 2

  return [
    { x: center.x - halfLength, y: center.y - halfThickness },
    { x: center.x + halfLength, y: center.y - halfThickness },
    { x: center.x + halfLength, y: center.y + halfThickness },
    { x: center.x - halfLength, y: center.y + halfThickness },
  ]
}

export function getPolygonWallWorldVertices(polygonWall: Pick<PolygonWall, "vertices" | "rotation">): Vec2[] {
  return rotatePolygon(polygonWall.vertices, polygonWall.rotation)
}

export function polygonWallFromWall(wall: Wall): PolygonWall {
  return {
    id: wall.polygonWallId,
    kind: "polygonWall",
    vertices: createUnrotatedWallPolygon(wall),
    rotation: wallRotation(wall),
  }
}
