import { v4 as uuid } from "uuid"
import type {
  MapDocument,
  Vec2,
  Wall,
  WallEnd,
  WallPolygon,
  WallPolygonMember,
} from "../types"

function cloneDocument(document: MapDocument): MapDocument {
  return {
    walls: document.walls.map(wall => ({
      ...wall,
      start: { ...wall.start },
      end: { ...wall.end },
      openings: wall.openings.map(opening => ({ ...opening })),
    })),
    wallPolygons: document.wallPolygons.map(polygon => ({
      ...polygon,
      members: polygon.members.map(member => ({ ...member })),
    })),
    props: document.props.map(prop => ({ ...prop })),
    referenceImages: document.referenceImages.map(image => ({ ...image })),
  }
}

export function pointsEqual(a: Vec2, b: Vec2, epsilon = 0.0001) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon
}

export function getWallEndpointPosition(wall: Wall, end: WallEnd): Vec2 {
  return end === "start" ? wall.start : wall.end
}

export function setWallEndpointPosition(wall: Wall, end: WallEnd, position: Vec2): Wall {
  return end === "start"
    ? { ...wall, start: { ...position } }
    : { ...wall, end: { ...position } }
}

export function translatePoint(point: Vec2, delta: Vec2): Vec2 {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
  }
}

export function translateWall(wall: Wall, delta: Vec2): Wall {
  return {
    ...wall,
    start: translatePoint(wall.start, delta),
    end: translatePoint(wall.end, delta),
  }
}

function subtractPoint(a: Vec2, b: Vec2): Vec2 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  }
}

function addPoint(a: Vec2, b: Vec2): Vec2 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  }
}

function scalePoint(point: Vec2, scalar: number): Vec2 {
  return {
    x: point.x * scalar,
    y: point.y * scalar,
  }
}

function cross(a: Vec2, b: Vec2) {
  return a.x * b.y - a.y * b.x
}

function pointDistance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function getLineIntersection(firstPoint: Vec2, firstDirection: Vec2, secondPoint: Vec2, secondDirection: Vec2) {
  const denominator = cross(firstDirection, secondDirection)
  if (Math.abs(denominator) <= 0.0001) return null

  const delta = subtractPoint(secondPoint, firstPoint)
  const t = cross(delta, secondDirection) / denominator
  return addPoint(firstPoint, scalePoint(firstDirection, t))
}

export function getWallPolygonForEndpoint(
  document: MapDocument,
  wallId: string,
  end: WallEnd
): WallPolygon | null {
  return document.wallPolygons.find(polygon =>
    polygon.members.some(member => member.wallId === wallId && member.end === end)
  ) || null
}

function dedupeMembers(members: WallPolygonMember[]) {
  const seen = new Set<string>()
  const unique: WallPolygonMember[] = []

  for (const member of members) {
    const key = `${member.wallId}:${member.end}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(member)
  }

  return unique
}

export function normalizeWallPolygons(document: MapDocument): MapDocument {
  const wallIds = new Set(document.walls.map(wall => wall.id))
  const wallPolygons = document.wallPolygons
    .map(polygon => ({
      ...polygon,
      members: dedupeMembers(
        polygon.members.filter(member => wallIds.has(member.wallId))
      ),
    }))
    .filter(polygon => polygon.members.length >= 2)

  return { ...document, wallPolygons }
}

function updatePolygonMembers(
  document: MapDocument,
  polygonId: string,
  updater: (members: WallPolygonMember[]) => WallPolygonMember[]
) {
  return {
    ...document,
    wallPolygons: document.wallPolygons
      .map(polygon => polygon.id === polygonId
        ? { ...polygon, members: updater(polygon.members) }
        : polygon)
      .filter(polygon => polygon.members.length >= 2),
  }
}

function alignPolygonMembers(
  document: MapDocument,
  polygon: WallPolygon,
  position: Vec2
): MapDocument {
  const memberKeys = new Set(polygon.members.map(member => `${member.wallId}:${member.end}`))

  return {
    ...document,
    walls: document.walls.map(wall => {
      const moveStart = memberKeys.has(`${wall.id}:start`)
      const moveEnd = memberKeys.has(`${wall.id}:end`)
      if (!moveStart && !moveEnd) return wall

      return {
        ...wall,
        start: moveStart ? { ...position } : wall.start,
        end: moveEnd ? { ...position } : wall.end,
      }
    }),
  }
}

function getPolygonAnchorPosition(document: MapDocument, polygon: WallPolygon): Vec2 | null {
  const anchorMember = polygon.members[0]
  if (!anchorMember) return null

  const wall = document.walls.find(candidate => candidate.id === anchorMember.wallId)
  return wall ? getWallEndpointPosition(wall, anchorMember.end) : null
}

function getWallDirection(wall: Wall): Vec2 {
  return subtractPoint(wall.end, wall.start)
}

function getConnectedWallIds(document: MapDocument, wallId: string) {
  const connected = new Set<string>()
  const queue = [wallId]

  while (queue.length > 0) {
    const currentWallId = queue.shift()!
    if (connected.has(currentWallId)) continue
    connected.add(currentWallId)

    for (const polygon of document.wallPolygons) {
      if (!polygon.members.some(member => member.wallId === currentWallId)) continue

      for (const member of polygon.members) {
        if (!connected.has(member.wallId)) {
          queue.push(member.wallId)
        }
      }
    }
  }

  return connected
}

export function moveWallPolygon(
  document: MapDocument,
  polygonId: string,
  position: Vec2
): MapDocument {
  const polygon = document.wallPolygons.find(candidate => candidate.id === polygonId)
  if (!polygon || polygon.members.length === 0) return document

  const anchorWall = document.walls.find(wall => wall.id === polygon.members[0].wallId)
  if (!anchorWall) return document

  const current = getWallEndpointPosition(anchorWall, polygon.members[0].end)
  const delta = { x: position.x - current.x, y: position.y - current.y }
  if (pointsEqual(delta, { x: 0, y: 0 })) return document

  const memberKeys = new Set(polygon.members.map(member => `${member.wallId}:${member.end}`))

  return {
    ...document,
    walls: document.walls.map(wall => {
      const moveStart = memberKeys.has(`${wall.id}:start`)
      const moveEnd = memberKeys.has(`${wall.id}:end`)
      if (!moveStart && !moveEnd) return wall

      return {
        ...wall,
        start: moveStart ? translatePoint(wall.start, delta) : wall.start,
        end: moveEnd ? translatePoint(wall.end, delta) : wall.end,
      }
    }),
  }
}

export function moveWallEndpoint(
  document: MapDocument,
  wallId: string,
  end: WallEnd,
  position: Vec2
): MapDocument {
  const polygon = getWallPolygonForEndpoint(document, wallId, end)
  if (polygon) {
    return moveWallPolygon(document, polygon.id, position)
  }

  return {
    ...document,
    walls: document.walls.map(wall =>
      wall.id === wallId ? setWallEndpointPosition(wall, end, position) : wall
    ),
  }
}

export function joinWallEndpoints(
  document: MapDocument,
  first: WallPolygonMember,
  second: WallPolygonMember
): MapDocument {
  if (first.wallId === second.wallId && first.end === second.end) {
    return document
  }

  const firstPolygon = getWallPolygonForEndpoint(document, first.wallId, first.end)
  const secondPolygon = getWallPolygonForEndpoint(document, second.wallId, second.end)

  if (firstPolygon && secondPolygon && firstPolygon.id === secondPolygon.id) {
    return document
  }

  const firstWall = document.walls.find(wall => wall.id === first.wallId)
  const secondWall = document.walls.find(wall => wall.id === second.wallId)
  if (!firstWall || !secondWall) return document

  const firstPosition = getWallEndpointPosition(firstWall, first.end)
  const secondPosition = getWallEndpointPosition(secondWall, second.end)
  const targetPosition = pointsEqual(firstPosition, secondPosition)
    ? firstPosition
    : firstPolygon && !secondPolygon
      ? firstPosition
      : !firstPolygon && secondPolygon
        ? secondPosition
        : firstPosition

  const polygonsToRemove = new Set<string>()
  const members = dedupeMembers([
    ...(firstPolygon?.members || []),
    ...(secondPolygon?.members || []),
    first,
    second,
  ])

  if (firstPolygon) polygonsToRemove.add(firstPolygon.id)
  if (secondPolygon) polygonsToRemove.add(secondPolygon.id)

  const polygon: WallPolygon = {
    id: firstPolygon?.id || secondPolygon?.id || uuid(),
    members,
  }

  const nextDocument = normalizeWallPolygons({
    ...document,
    wallPolygons: [
      ...document.wallPolygons.filter(candidate => !polygonsToRemove.has(candidate.id)),
      polygon,
    ],
  })

  const nextPolygon = nextDocument.wallPolygons.find(candidate => candidate.id === polygon.id)
  if (!nextPolygon) return nextDocument

  return alignPolygonMembers(nextDocument, nextPolygon, targetPosition)
}

type ResolvedWallJoinSelection = {
  members: WallPolygonMember[]
  point: Vec2
}

type WallJoinEndpointCandidate = {
  wallId: string
  end: WallEnd
  position: Vec2
  wall: Wall
  polygon: WallPolygon | null
}

type ResolvedWallJoinCandidate = {
  members: WallJoinEndpointCandidate[]
  point: Vec2
  maxDistance: number
  totalDistance: number
}

export function resolveWallJoinSelection(
  document: MapDocument,
  wallIds: string[]
): ResolvedWallJoinSelection | null {
  const uniqueWallIds = wallIds.filter((wallId, index) => wallIds.indexOf(wallId) === index)
  if (uniqueWallIds.length < 2) return null

  const walls = uniqueWallIds
    .map(wallId => document.walls.find(candidate => candidate.id === wallId))
    .filter((wall): wall is Wall => Boolean(wall))
  if (walls.length !== uniqueWallIds.length) return null

  const endpoints = walls.flatMap(wall => {
    const startPolygon = getWallPolygonForEndpoint(document, wall.id, "start")
    const endPolygon = getWallPolygonForEndpoint(document, wall.id, "end")
    return [
      {
        wallId: wall.id,
        end: "start" as const,
        position: wall.start,
        wall,
        polygon: startPolygon,
      },
      {
        wallId: wall.id,
        end: "end" as const,
        position: wall.end,
        wall,
        polygon: endPolygon,
      },
    ]
  })

  let best: ResolvedWallJoinCandidate | null = null

  const enumerate = (index: number, members: WallJoinEndpointCandidate[]) => {
    if (index >= walls.length) {
      const localJoinThreshold = Math.max(0.0001, ...members.map(member => member.wall.thickness))
      const polygonAnchors = members
        .map(member => member.polygon ? getPolygonAnchorPosition(document, member.polygon) : null)
        .filter((point): point is Vec2 => Boolean(point))

      const lineIntersections: Vec2[] = []
      for (let firstIndex = 0; firstIndex < members.length; firstIndex++) {
        for (let secondIndex = firstIndex + 1; secondIndex < members.length; secondIndex++) {
          const intersection = getLineIntersection(
            members[firstIndex].position,
            getWallDirection(members[firstIndex].wall),
            members[secondIndex].position,
            getWallDirection(members[secondIndex].wall),
          )
          if (intersection) lineIntersections.push(intersection)
        }
      }

      const validPolygonAnchors = polygonAnchors.filter(candidate =>
        members.every(member => pointDistance(member.position, candidate) <= localJoinThreshold + 0.0001)
      )
      const validLineIntersections = lineIntersections.filter(candidate =>
        members.every(member => pointDistance(member.position, candidate) <= localJoinThreshold + 0.0001)
      )

      const candidates = validPolygonAnchors.length > 0
        ? validPolygonAnchors
        : validLineIntersections.length > 0
          ? validLineIntersections
          : members.map(member => member.position)

      let bestCandidate:
        | {
          point: Vec2
          maxDistance: number
          totalDistance: number
        }
        | null = null

      for (const candidate of candidates) {
        const distances = members.map(member => pointDistance(member.position, candidate))
        const maxDistance = Math.max(...distances)
        const totalDistance = distances.reduce((sum, distance) => sum + distance, 0)

        if (
          !bestCandidate ||
          maxDistance < bestCandidate.maxDistance - 0.0001 ||
          (
            Math.abs(maxDistance - bestCandidate.maxDistance) <= 0.0001 &&
            totalDistance < bestCandidate.totalDistance
          )
        ) {
          bestCandidate = { point: candidate, maxDistance, totalDistance }
        }
      }

      if (!bestCandidate) return

      if (
        !best ||
        bestCandidate.maxDistance < best.maxDistance - 0.0001 ||
        (
          Math.abs(bestCandidate.maxDistance - best.maxDistance) <= 0.0001 &&
          bestCandidate.totalDistance < best.totalDistance
        )
      ) {
        best = {
          members,
          point: bestCandidate.point,
          maxDistance: bestCandidate.maxDistance,
          totalDistance: bestCandidate.totalDistance,
        }
      }
      return
    }

    const wall = walls[index]
    const wallEndpoints = endpoints.filter(endpoint => endpoint.wallId === wall.id)
    for (const endpoint of wallEndpoints) {
      enumerate(index + 1, [...members, endpoint])
    }
  }

  enumerate(0, [])

  if (best === null) return null
  const resolvedBest = best as ResolvedWallJoinCandidate

  const maxThickness = Math.max(...resolvedBest.members.map(member => member.wall.thickness))
  const joinThreshold = Math.max(0.0001, maxThickness)
  if (resolvedBest.maxDistance > joinThreshold) return null

  const polygonIds = new Set(resolvedBest.members.map(member => member.polygon?.id).filter((id): id is string => Boolean(id)))
  if (polygonIds.size === 1 && resolvedBest.members.every(member => member.polygon?.id === [...polygonIds][0])) {
    return null
  }

  return {
    members: resolvedBest.members.map(member => ({
      wallId: member.wallId,
      end: member.end,
    })),
    point: resolvedBest.point,
  }
}

export function canJoinWallSelection(document: MapDocument, wallIds: string[]) {
  return Boolean(resolveWallJoinSelection(document, wallIds))
}

export function joinWallSelection(document: MapDocument, wallIds: string[]): MapDocument {
  const resolved = resolveWallJoinSelection(document, wallIds)
  if (!resolved || resolved.members.length < 2) return document

  let nextDocument = document
  for (const member of resolved.members) {
    nextDocument = moveWallEndpoint(nextDocument, member.wallId, member.end, resolved.point)
  }

  const [anchor, ...rest] = resolved.members
  for (const member of rest) {
    nextDocument = joinWallEndpoints(nextDocument, anchor, member)
  }

  return nextDocument
}

export function unjoinWallEndpoint(
  document: MapDocument,
  wallId: string,
  end: WallEnd
): MapDocument {
  const polygon = getWallPolygonForEndpoint(document, wallId, end)
  if (!polygon) return document

  return normalizeWallPolygons(updatePolygonMembers(document, polygon.id, members =>
    members.filter(member => !(member.wallId === wallId && member.end === end))
  ))
}

export function moveWallBody(
  document: MapDocument,
  wallId: string,
  delta: Vec2
): MapDocument {
  if (pointsEqual(delta, { x: 0, y: 0 })) return document

  const wall = document.walls.find(candidate => candidate.id === wallId)
  if (!wall) return document

  const connectedWallIds = getConnectedWallIds(document, wallId)
  if (connectedWallIds.size > 1) {
    return {
      ...document,
      walls: document.walls.map(candidate =>
        connectedWallIds.has(candidate.id) ? translateWall(candidate, delta) : candidate
      ),
    }
  }

  const nextDocument = cloneDocument(document)
  const startPolygon = getWallPolygonForEndpoint(document, wallId, "start")
  const endPolygon = getWallPolygonForEndpoint(document, wallId, "end")

  nextDocument.walls = nextDocument.walls.map(candidate => {
    if (candidate.id !== wallId) return candidate

    let nextWall = candidate
    if (!startPolygon) {
      nextWall = setWallEndpointPosition(nextWall, "start", translatePoint(nextWall.start, delta))
    }
    if (!endPolygon) {
      nextWall = setWallEndpointPosition(nextWall, "end", translatePoint(nextWall.end, delta))
    }
    return nextWall
  })

  const polygonIds = new Set(
    [startPolygon?.id, endPolygon?.id].filter((value): value is string => Boolean(value))
  )
  for (const polygonId of polygonIds) {
    const polygon = nextDocument.wallPolygons.find(candidate => candidate.id === polygonId)
    if (!polygon || polygon.members.length === 0) continue

    const memberKeys = new Set(polygon.members.map(member => `${member.wallId}:${member.end}`))
    nextDocument.walls = nextDocument.walls.map(candidate => {
      const moveStart = memberKeys.has(`${candidate.id}:start`)
      const moveEnd = memberKeys.has(`${candidate.id}:end`)
      if (!moveStart && !moveEnd) return candidate

      return {
        ...candidate,
        start: moveStart ? translatePoint(candidate.start, delta) : candidate.start,
        end: moveEnd ? translatePoint(candidate.end, delta) : candidate.end,
      }
    })
  }

  return nextDocument
}

export function setWallThickness(
  document: MapDocument,
  wallId: string,
  thickness: number
): MapDocument {
  return {
    ...document,
    walls: document.walls.map(wall =>
      wall.id === wallId ? { ...wall, thickness } : wall
    ),
  }
}

export function deleteWall(
  document: MapDocument,
  wallId: string
): MapDocument {
  return normalizeWallPolygons({
    ...document,
    walls: document.walls.filter(wall => wall.id !== wallId),
    wallPolygons: document.wallPolygons.map(polygon => ({
      ...polygon,
      members: polygon.members.filter(member => member.wallId !== wallId),
    })),
  })
}
