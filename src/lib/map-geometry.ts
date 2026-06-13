import type { MapDocument, Vec2, Wall, WallEnd, WallOpening, WallOpeningKind } from "../types"
import { getWallEndpointPosition, getWallPolygonForEndpoint, pointsEqual } from "./wall-topology"

export const PIXELS_PER_UNIT = 6
export const DEFAULT_WALL_THICKNESS = 8
export const DEFAULT_DOOR_WIDTH = 9
export const DEFAULT_WINDOW_WIDTH = 6
export const MITER_LIMIT = 4

const EPSILON = 0.0001
const STRAIGHT_ANGLE_EPSILON = 0.02

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

export type WallTerminalCorners = {
  left: Vec2
  right: Vec2
}

export type WallPolygonFill = {
  points: Vec2[]
}

export type WallPolygonGeometry = {
  polygonId: string
  point: Vec2
  fills: WallPolygonFill[]
  terminals: Array<{
    wallId: string
    end: WallEnd
    corners: WallTerminalCorners
  }>
}

export type WallTerminalLookup = Record<string, Partial<Record<WallEnd, WallTerminalCorners>>>

export type WallGroupPolygon = {
  outer: Vec2[]
  holes: Vec2[][]
}

export type WallGroupGeometry = {
  groupId: string
  wallIds: string[]
  polygons: WallGroupPolygon[]
  order: number
}

export type WallRenderCache = {
  junctions: WallPolygonGeometry[]
  terminals: WallTerminalLookup
  wallGroups: WallGroupGeometry[]
  wallToGroupId: Record<string, string>
}

type JunctionMemberState = {
  wall: Wall
  end: WallEnd
  direction: Vec2
  angle: number
  halfWidth: number
  outwardLeft: Vec2
  outwardRight: Vec2
}

type BoundaryEdge = {
  from: Vec2
  to: Vec2
  fromKey: string
  toKey: string
}

type SourceEdge = {
  from: Vec2
  to: Vec2
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

export function perp(vec: Vec2): Vec2 {
  return { x: -vec.y, y: vec.x }
}

export function addVec2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function subVec2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scaleVec2(vec: Vec2, scalar: number): Vec2 {
  return { x: vec.x * scalar, y: vec.y * scalar }
}

export function dot(a: Vec2, b: Vec2) {
  return a.x * b.x + a.y * b.y
}

export function cross(a: Vec2, b: Vec2) {
  return a.x * b.y - a.y * b.x
}

export function polygonArea(points: Vec2[]) {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]) {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]

    const edge = subVec2(b, a)
    const rel = subVec2(point, a)
    const onSegment = Math.abs(cross(edge, rel)) <= EPSILON &&
      point.x >= Math.min(a.x, b.x) - EPSILON &&
      point.x <= Math.max(a.x, b.x) + EPSILON &&
      point.y >= Math.min(a.y, b.y) - EPSILON &&
      point.y <= Math.max(a.y, b.y) + EPSILON
    if (onSegment) return true

    const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }

  return inside
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

export function wallLocalToWorld(wall: Wall, along: number, perpOffset = 0): Vec2 {
  const unit = wallUnit(wall)
  const normal = wallNormal(wall)
  return {
    x: wall.start.x + unit.x * along + normal.x * perpOffset,
    y: wall.start.y + unit.y * along + normal.y * perpOffset,
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

export function getNaiveTerminalCorners(wall: Wall, end: WallEnd, thickness = wall.thickness): WallTerminalCorners {
  const point = getWallEndpointPosition(wall, end)
  const normal = wallNormal(wall)
  const half = thickness / 2

  return {
    left: addVec2(point, scaleVec2(normal, half)),
    right: addVec2(point, scaleVec2(normal, -half)),
  }
}

function worldTerminalToOutwardCorners(
  end: WallEnd,
  corners: WallTerminalCorners
): WallTerminalCorners {
  if (end === "start") {
    return corners
  }

  return {
    left: corners.right,
    right: corners.left,
  }
}

function outwardTerminalToWorldCorners(
  end: WallEnd,
  corners: WallTerminalCorners
): WallTerminalCorners {
  if (end === "start") {
    return corners
  }

  return {
    left: corners.right,
    right: corners.left,
  }
}

export function buildWallTerminalLookup(geometry: WallPolygonGeometry[]): WallTerminalLookup {
  const lookup: WallTerminalLookup = {}

  for (const polygon of geometry) {
    for (const terminal of polygon.terminals) {
      lookup[terminal.wallId] ??= {}
      lookup[terminal.wallId][terminal.end] = terminal.corners
    }
  }

  return lookup
}

function getOffsetCrossSection(wall: Wall, along: number, thickness = wall.thickness): WallTerminalCorners {
  const half = thickness / 2
  return {
    right: wallLocalToWorld(wall, along, -half),
    left: wallLocalToWorld(wall, along, half),
  }
}

export function getWallQuad(
  wall: Wall,
  from = 0,
  to = wallLength(wall),
  thickness = wall.thickness,
  terminals?: Partial<Record<WallEnd, WallTerminalCorners>>
) {
  const length = wallLength(wall)
  const startCorners = Math.abs(from) <= EPSILON && terminals?.start
    ? { right: terminals.start.right, left: terminals.start.left }
    : getOffsetCrossSection(wall, from, thickness)
  const endCorners = Math.abs(to - length) <= EPSILON && terminals?.end
    ? { right: terminals.end.right, left: terminals.end.left }
    : getOffsetCrossSection(wall, to, thickness)

  return [
    startCorners.right,
    endCorners.right,
    endCorners.left,
    startCorners.left,
  ]
}

export function getOpeningQuad(
  wall: Wall,
  opening: WallOpening,
  thickness = wall.thickness,
  terminals?: Partial<Record<WallEnd, WallTerminalCorners>>
) {
  const interval = getOpeningInterval(opening)
  return getWallQuad(wall, interval.from, interval.to, thickness, terminals)
}

function intersectOffsetLines(
  pointA: Vec2,
  dirA: Vec2,
  pointB: Vec2,
  dirB: Vec2
) {
  const denominator = cross(dirA, dirB)
  if (Math.abs(denominator) <= EPSILON) {
    return null
  }

  const delta = subVec2(pointB, pointA)
  const alongA = cross(delta, dirB) / denominator
  const alongB = cross(delta, dirA) / denominator
  const intersection = addVec2(pointA, scaleVec2(dirA, alongA))

  return { intersection, alongA, alongB, denominator }
}

function createJunctionMemberState(wall: Wall, end: WallEnd): JunctionMemberState {
  const direction = end === "start" ? wallUnit(wall) : scaleVec2(wallUnit(wall), -1)
  const outwardNormal = perp(direction)
  const halfWidth = wall.thickness / 2
  const point = getWallEndpointPosition(wall, end)

  return {
    wall,
    end,
    direction,
    angle: Math.atan2(direction.y, direction.x),
    halfWidth,
    outwardLeft: addVec2(point, scaleVec2(outwardNormal, halfWidth)),
    outwardRight: addVec2(point, scaleVec2(outwardNormal, -halfWidth)),
  }
}

function buildDefaultJunctionGeometry(polygonId: string, point: Vec2, members: JunctionMemberState[]): WallPolygonGeometry {
  return {
    polygonId,
    point,
    fills: [],
    terminals: members.map(member => ({
      wallId: member.wall.id,
      end: member.end,
      corners: getNaiveTerminalCorners(member.wall, member.end),
    })),
  }
}

export function buildWallPolygonGeometry(document: MapDocument): WallPolygonGeometry[] {
  const wallById = new Map(document.walls.map(wall => [wall.id, wall]))
  const geometry: WallPolygonGeometry[] = []

  for (const polygon of document.wallPolygons) {
    const members = polygon.members
      .map(member => {
        const wall = wallById.get(member.wallId)
        return wall ? createJunctionMemberState(wall, member.end) : null
      })
      .filter((member): member is JunctionMemberState => Boolean(member))

    if (members.length < 2) continue

    const point = getWallEndpointPosition(members[0].wall, members[0].end)
    if (!members.every(member => pointsEqual(getWallEndpointPosition(member.wall, member.end), point))) {
      geometry.push(buildDefaultJunctionGeometry(polygon.id, point, members))
      continue
    }

    const sorted = [...members].sort((a, b) => a.angle - b.angle)
    const fills: WallPolygonFill[] = []
    const terminalMap = new Map<string, WallTerminalCorners>()

    for (const member of sorted) {
      const naive = worldTerminalToOutwardCorners(
        member.end,
        getNaiveTerminalCorners(member.wall, member.end)
      )
      terminalMap.set(`${member.wall.id}:${member.end}`, naive)
    }

    for (let index = 0; index < sorted.length; index++) {
      const current = sorted[index]
      const next = sorted[(index + 1) % sorted.length]
      const angle = normalizePositiveAngle(next.angle - current.angle)

      if (Math.abs(angle - Math.PI) <= STRAIGHT_ANGLE_EPSILON) {
        continue
      }

      const leftLineStart = current.outwardLeft
      const rightLineStart = next.outwardRight
      const intersection = intersectOffsetLines(
        leftLineStart,
        current.direction,
        rightLineStart,
        next.direction
      )

      const maxHalfWidth = Math.max(current.halfWidth, next.halfWidth)
      const currentKey = `${current.wall.id}:${current.end}`
      const nextKey = `${next.wall.id}:${next.end}`
      const currentTerminal = terminalMap.get(currentKey)!
      const nextTerminal = terminalMap.get(nextKey)!
      const currentNaiveLeft = current.outwardLeft
      const nextNaiveRight = next.outwardRight
      const isInteriorSector = angle < Math.PI - STRAIGHT_ANGLE_EPSILON

      const invalidIntersection = !intersection ||
        Math.abs(intersection.denominator) <= EPSILON ||
        (
          isInteriorSector &&
          (intersection.alongA < -EPSILON || intersection.alongB < -EPSILON)
        )

      if (!invalidIntersection) {
        const miterDistance = Math.hypot(
          intersection.intersection.x - point.x,
          intersection.intersection.y - point.y
        )

        if (Number.isFinite(miterDistance) && miterDistance <= MITER_LIMIT * maxHalfWidth) {
          terminalMap.set(currentKey, {
            ...currentTerminal,
            left: intersection.intersection,
          })
          terminalMap.set(nextKey, {
            ...nextTerminal,
            right: intersection.intersection,
          })
          if (isInteriorSector) {
            fills.push({
              points: [point, currentNaiveLeft, nextNaiveRight],
            })
          }
          continue
        }
      }

      if (isInteriorSector) {
        fills.push({
          points: [point, currentNaiveLeft, nextNaiveRight],
        })
      }
    }

    geometry.push({
      polygonId: polygon.id,
      point,
      fills,
      terminals: sorted.map(member => ({
        wallId: member.wall.id,
        end: member.end,
        corners: outwardTerminalToWorldCorners(
          member.end,
          terminalMap.get(`${member.wall.id}:${member.end}`)!
        ),
      })),
    })
  }

  return geometry
}

function pointKey(point: Vec2) {
  return `${Math.round(point.x * 10000)},${Math.round(point.y * 10000)}`
}

function sanitizePolygon(points: Vec2[]) {
  const sanitized: Vec2[] = []

  for (const point of points) {
    const previous = sanitized.at(-1)
    if (previous && pointsEqual(previous, point)) continue
    sanitized.push(point)
  }

  if (sanitized.length > 1 && pointsEqual(sanitized[0], sanitized[sanitized.length - 1])) {
    sanitized.pop()
  }

  if (sanitized.length < 3) return []

  const reduced: Vec2[] = []
  for (let index = 0; index < sanitized.length; index++) {
    const previous = sanitized[(index - 1 + sanitized.length) % sanitized.length]
    const current = sanitized[index]
    const next = sanitized[(index + 1) % sanitized.length]
    const prevDir = subVec2(current, previous)
    const nextDir = subVec2(next, current)
    if (Math.abs(cross(prevDir, nextDir)) <= EPSILON && dot(prevDir, nextDir) >= 0) {
      continue
    }
    reduced.push(current)
  }

  return reduced.length >= 3 ? reduced : []
}

function pointOnSegment(point: Vec2, start: Vec2, end: Vec2) {
  const segment = subVec2(end, start)
  const rel = subVec2(point, start)
  if (Math.abs(cross(segment, rel)) > EPSILON) return false

  return (
    point.x >= Math.min(start.x, end.x) - EPSILON &&
    point.x <= Math.max(start.x, end.x) + EPSILON &&
    point.y >= Math.min(start.y, end.y) - EPSILON &&
    point.y <= Math.max(start.y, end.y) + EPSILON
  )
}

function intersectSegments(aStart: Vec2, aEnd: Vec2, bStart: Vec2, bEnd: Vec2) {
  const a = subVec2(aEnd, aStart)
  const b = subVec2(bEnd, bStart)
  const denominator = cross(a, b)
  if (Math.abs(denominator) <= EPSILON) return null

  const delta = subVec2(bStart, aStart)
  const t = cross(delta, b) / denominator
  const u = cross(delta, a) / denominator
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null

  return addVec2(aStart, scaleVec2(a, t))
}

function collectSplitPoints(edge: SourceEdge, edges: SourceEdge[]) {
  const points = [edge.from, edge.to]

  for (const other of edges) {
    if (other === edge) continue

    if (pointOnSegment(other.from, edge.from, edge.to)) points.push(other.from)
    if (pointOnSegment(other.to, edge.from, edge.to)) points.push(other.to)

    const intersection = intersectSegments(edge.from, edge.to, other.from, other.to)
    if (intersection) points.push(intersection)
  }

  const axis = subVec2(edge.to, edge.from)
  const lengthSquared = dot(axis, axis)
  const unique = new Map<string, Vec2>()
  for (const point of points) {
    unique.set(pointKey(point), point)
  }

  return [...unique.values()].sort((first, second) => {
    const firstT = lengthSquared <= EPSILON ? 0 : dot(subVec2(first, edge.from), axis) / lengthSquared
    const secondT = lengthSquared <= EPSILON ? 0 : dot(subVec2(second, edge.from), axis) / lengthSquared
    return firstT - secondT
  })
}

function collectBoundaryEdges(polygons: Vec2[][]) {
  const sourceEdges: SourceEdge[] = []
  const sanitizedPolygons = polygons
    .map(sanitizePolygon)
    .filter(polygon => polygon.length >= 3)

  for (const polygon of sanitizedPolygons) {
    for (let index = 0; index < polygon.length; index++) {
      const from = polygon[index]
      const to = polygon[(index + 1) % polygon.length]
      if (pointsEqual(from, to)) continue
      sourceEdges.push({ from, to })
    }
  }

  const boundaryEdges = new Map<string, BoundaryEdge>()
  const sampleOffset = 0.001

  for (const edge of sourceEdges) {
    const splitPoints = collectSplitPoints(edge, sourceEdges)
    for (let index = 0; index < splitPoints.length - 1; index++) {
      const start = splitPoints[index]
      const end = splitPoints[index + 1]
      if (pointsEqual(start, end)) continue

      const direction = normalize(subVec2(end, start))
      const normal = perp(direction)
      const midpoint = scaleVec2(addVec2(start, end), 0.5)
      const leftSample = addVec2(midpoint, scaleVec2(normal, sampleOffset))
      const rightSample = addVec2(midpoint, scaleVec2(normal, -sampleOffset))
      const leftInside = sanitizedPolygons.some(polygon => pointInPolygon(leftSample, polygon))
      const rightInside = sanitizedPolygons.some(polygon => pointInPolygon(rightSample, polygon))

      if (leftInside === rightInside) continue

      const from = leftInside ? start : end
      const to = leftInside ? end : start
      const fromKey = pointKey(from)
      const toKey = pointKey(to)
      boundaryEdges.set(`${fromKey}>${toKey}`, { from, to, fromKey, toKey })
    }
  }

  return [...boundaryEdges.values()]
}

function selectNextBoundaryEdge(previous: BoundaryEdge, candidates: BoundaryEdge[]) {
  if (candidates.length <= 1) return candidates[0] || null

  const incoming = normalize(subVec2(previous.to, previous.from))
  let best: BoundaryEdge | null = null
  let bestTurn = Number.NEGATIVE_INFINITY

  for (const candidate of candidates) {
    const outgoing = normalize(subVec2(candidate.to, candidate.from))
    const turn = Math.atan2(cross(incoming, outgoing), dot(incoming, outgoing))
    const normalizedTurn = turn <= 0 ? turn + Math.PI * 2 : turn
    if (normalizedTurn > bestTurn) {
      bestTurn = normalizedTurn
      best = candidate
    }
  }

  return best
}

function getLoopInteriorSample(loop: Vec2[]) {
  const area = polygonArea(loop)
  const inwardSign = area >= 0 ? 1 : -1

  for (let index = 0; index < loop.length; index++) {
    const current = loop[index]
    const next = loop[(index + 1) % loop.length]
    const direction = normalize(subVec2(next, current))
    if (Math.hypot(direction.x, direction.y) <= EPSILON) continue

    const midpoint = scaleVec2(addVec2(current, next), 0.5)
    const inward = scaleVec2(perp(direction), inwardSign * 0.001)
    const sample = addVec2(midpoint, inward)
    if (pointInPolygon(sample, loop)) return sample
  }

  return loop[0]
}

function buildUnionPolygons(polygons: Vec2[][]): WallGroupPolygon[] {
  const edges = collectBoundaryEdges(polygons)
  const outgoing = new Map<string, BoundaryEdge[]>()

  for (const edge of edges) {
    const bucket = outgoing.get(edge.fromKey)
    if (bucket) {
      bucket.push(edge)
    } else {
      outgoing.set(edge.fromKey, [edge])
    }
  }

  const visited = new Set<string>()
  const loops: Vec2[][] = []

  for (const edge of edges) {
    const startKey = `${edge.fromKey}>${edge.toKey}`
    if (visited.has(startKey)) continue

    const loop: Vec2[] = [edge.from]
    let current = edge
    visited.add(startKey)
    loop.push(edge.to)

    while (current.toKey !== edge.fromKey) {
      const candidates = (outgoing.get(current.toKey) || []).filter(candidate =>
        !visited.has(`${candidate.fromKey}>${candidate.toKey}`)
      )
      const next = selectNextBoundaryEdge(current, candidates)
      if (!next) break

      visited.add(`${next.fromKey}>${next.toKey}`)
      loop.push(next.to)
      current = next
    }

    const sanitized = sanitizePolygon(loop)
    if (sanitized.length < 3) continue
    if (Math.abs(polygonArea(sanitized)) <= EPSILON) continue
    loops.push(sanitized)
  }

  const nodes = loops.map(loop => ({
    loop,
    area: polygonArea(loop),
    sample: getLoopInteriorSample(loop),
    parent: -1,
    depth: 0,
  }))

  const sortedIndices = nodes
    .map((_, index) => index)
    .sort((first, second) => Math.abs(nodes[second].area) - Math.abs(nodes[first].area))

  for (let index = 0; index < sortedIndices.length; index++) {
    const childIndex = sortedIndices[index]
    const child = nodes[childIndex]

    for (let parentOffset = index - 1; parentOffset >= 0; parentOffset--) {
      const parentIndex = sortedIndices[parentOffset]
      const parent = nodes[parentIndex]
      if (!pointInPolygon(child.sample, parent.loop)) continue
      child.parent = parentIndex
      child.depth = parent.depth + 1
      break
    }
  }

  const shapes: WallGroupPolygon[] = []
  const shapeByNode = new Map<number, WallGroupPolygon>()

  for (const nodeIndex of sortedIndices) {
    const node = nodes[nodeIndex]

    if (node.depth % 2 === 0) {
      const shape: WallGroupPolygon = {
        outer: node.loop,
        holes: [],
      }
      shapes.push(shape)
      shapeByNode.set(nodeIndex, shape)
      continue
    }

    let ancestor = node.parent
    while (ancestor >= 0 && nodes[ancestor].depth % 2 !== 0) {
      ancestor = nodes[ancestor].parent
    }

    if (ancestor >= 0) {
      shapeByNode.get(ancestor)?.holes.push(node.loop)
    }
  }

  return shapes
}

function buildConnectedWallGroups(document: MapDocument) {
  const adjacency = new Map<string, Set<string>>()
  const wallOrder = new Map(document.walls.map((wall, index) => [wall.id, index]))

  for (const wall of document.walls) {
    adjacency.set(wall.id, new Set())
  }

  for (const polygon of document.wallPolygons) {
    for (const member of polygon.members) {
      adjacency.get(member.wallId)?.add(member.wallId)
      for (const other of polygon.members) {
        if (other.wallId === member.wallId) continue
        adjacency.get(member.wallId)?.add(other.wallId)
      }
    }
  }

  const groups: Array<{ groupId: string; wallIds: string[]; order: number }> = []
  const visited = new Set<string>()

  for (const wall of document.walls) {
    if (visited.has(wall.id)) continue

    const stack = [wall.id]
    const wallIds: string[] = []
    visited.add(wall.id)

    while (stack.length > 0) {
      const wallId = stack.pop()!
      wallIds.push(wallId)
      for (const next of adjacency.get(wallId) || []) {
        if (visited.has(next)) continue
        visited.add(next)
        stack.push(next)
      }
    }

    wallIds.sort((a, b) => (wallOrder.get(a) ?? 0) - (wallOrder.get(b) ?? 0))
    groups.push({
      groupId: `group:${wallIds.join(":")}`,
      wallIds,
      order: Math.max(...wallIds.map(wallId => wallOrder.get(wallId) ?? 0)),
    })
  }

  return groups
}

export function buildWallRenderCache(document: MapDocument): WallRenderCache {
  const junctions = buildWallPolygonGeometry(document)
  const terminals = buildWallTerminalLookup(junctions)
  const wallById = new Map(document.walls.map(wall => [wall.id, wall]))
  const polygonById = new Map(junctions.map(polygon => [polygon.polygonId, polygon]))
  const wallToGroupId: Record<string, string> = {}

  const wallGroups = buildConnectedWallGroups(document).map(group => {
    const primitives: Vec2[][] = []
    const polygonIds = new Set<string>()

    for (const wallId of group.wallIds) {
      wallToGroupId[wallId] = group.groupId
      const wall = wallById.get(wallId)
      if (!wall) continue
      const wallTerminals = terminals[wall.id]

      for (const interval of getWallSolidIntervals(wall)) {
        primitives.push(getWallQuad(wall, interval.from, interval.to, wall.thickness, wallTerminals))
      }

      for (const end of ["start", "end"] as const) {
        const polygon = getWallPolygonForEndpoint(document, wall.id, end)
        if (polygon) polygonIds.add(polygon.id)
      }
    }

    for (const polygonId of polygonIds) {
      const polygon = polygonById.get(polygonId)
      if (!polygon) continue
      for (const fill of polygon.fills) {
        primitives.push(fill.points)
      }
    }

    return {
      groupId: group.groupId,
      wallIds: group.wallIds,
      polygons: buildUnionPolygons(primitives),
      order: group.order,
    }
  })

  return {
    junctions,
    terminals,
    wallGroups,
    wallToGroupId,
  }
}

function normalizePositiveAngle(angle: number) {
  let next = angle
  while (next < 0) next += Math.PI * 2
  while (next >= Math.PI * 2) next -= Math.PI * 2
  return next
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
