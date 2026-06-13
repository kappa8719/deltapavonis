export type Vec2 = {
  x: number
  y: number
}

export type WallOpeningKind = "door" | "window"

export type WallOpening = {
  id: string
  kind: WallOpeningKind
  offset: number
  width: number
}

export type Door = WallOpening & {
  kind: "door"
}

export type Window = WallOpening & {
  kind: "window"
}

export type Wall = {
  id: string
  kind: "wall"
  start: Vec2
  end: Vec2
  thickness: number
  openings: WallOpening[]
}

export type WallEnd = "start" | "end"

export type WallPolygonMember = {
  wallId: string
  end: WallEnd
}

export type WallPolygon = {
  id: string
  members: WallPolygonMember[]
}

export type Prop = {
  id: string
  kind: "prop"
  x: number
  y: number
  assetId: string
  rotation?: number
}

export type ReferenceImage = {
  id: string
  kind: "referenceImage"
  src: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  naturalWidth: number
  naturalHeight: number
}

export type MapDocument = {
  walls: Wall[]
  wallPolygons: WallPolygon[]
  props: Prop[]
  referenceImages: ReferenceImage[]
}

export type ActiveTool = "select" | "wall" | "door" | "window" | "prop"

export type WallOpeningObject = (Door | Window) & {
  wallId: string
}

export type MapObject = Wall | WallOpeningObject | Prop | ReferenceImage

export type ObjectType = "wall" | "door" | "window" | "prop" | "referenceImage"

export type ObjectPatch = Partial<{
  start: Vec2
  end: Vec2
  thickness: number
  offset: number
  width: number
  height: number
  x: number
  y: number
  assetId: string
  src: string
  rotation: number
  opacity: number
}>

/** Fields that can appear on a Prop beyond the core type. */
export type PropExtras = {
  rotation?: number
}

export type WallEndpointHandle = {
  kind: "wallEndpoint"
  wallId: string
  end: WallEnd
}

export type EditorHandle = WallEndpointHandle

export function getObjectType(doc: MapDocument, id: string): ObjectType | null {
  const obj = getObject(doc, id)
  return obj?.kind ?? null
}

export function getObject(doc: MapDocument, id: string): MapObject | null {
  const wall = doc.walls.find(candidate => candidate.id === id)
  if (wall) return wall

  for (const candidateWall of doc.walls) {
    const opening = candidateWall.openings.find(candidate => candidate.id === id)
    if (opening) return { ...opening, wallId: candidateWall.id } as WallOpeningObject
  }

  const prop = doc.props.find(candidate => candidate.id === id)
  if (prop) return prop

  return doc.referenceImages.find(candidate => candidate.id === id) || null
}

export function getWallByOpeningId(doc: MapDocument, openingId: string): Wall | null {
  return doc.walls.find(wall => wall.openings.some(opening => opening.id === openingId)) || null
}

export function getOpeningById(doc: MapDocument, openingId: string): WallOpeningObject | null {
  const wall = getWallByOpeningId(doc, openingId)
  if (!wall) return null
  const opening = wall.openings.find(candidate => candidate.id === openingId)
  return opening ? { ...opening, wallId: wall.id } as WallOpeningObject : null
}

export function getOpeningCount(doc: MapDocument) {
  return doc.walls.reduce((count, wall) => count + wall.openings.length, 0)
}
