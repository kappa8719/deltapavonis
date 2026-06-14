export type Vec2 = {
  x: number
  y: number
}

export type WallOpeningKind = "door" | "window"

export type Wall = {
  id: string
  kind: "wall"
  a: Vec2
  b: Vec2
  thickness: number
  polygonWallId: string
}

export type PolygonWall = {
  id: string
  kind: "polygonWall"
  vertices: Vec2[]
  rotation: number
  material?: string
}

export type Opening = {
  id: string
  kind: WallOpeningKind
  position: Vec2
  rotation: number
  width: number
  depth: number
}

export type Door = Opening & {
  kind: "door"
}

export type Window = Opening & {
  kind: "window"
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
  locked: boolean
  naturalWidth: number
  naturalHeight: number
}

export type MapDocument = {
  walls: Wall[]
  polygonWalls: PolygonWall[]
  openings: Opening[]
  props: Prop[]
  referenceImages: ReferenceImage[]
}

export type ActiveTool = "select" | "wall" | "door" | "window" | "prop"

export type MapObject = Wall | PolygonWall | Opening | Prop | ReferenceImage

export type ObjectType = "wall" | "polygonWall" | "door" | "window" | "prop" | "referenceImage"

export type ObjectPatch = Partial<{
  a: Vec2
  b: Vec2
  thickness: number
  vertices: Vec2[]
  position: Vec2
  width: number
  height: number
  depth: number
  x: number
  y: number
  assetId: string
  src: string
  rotation: number
  opacity: number
  locked: boolean
}>

/** Fields that can appear on a Prop beyond the core type. */
export type PropExtras = {
  rotation?: number
}

export function getObjectType(doc: MapDocument, id: string): ObjectType | null {
  const obj = getObject(doc, id)
  return obj?.kind ?? null
}

export function getObject(doc: MapDocument, id: string): MapObject | null {
  const wall = doc.walls.find(candidate => candidate.id === id)
  if (wall) return wall

  const polygonWall = doc.polygonWalls.find(candidate => candidate.id === id)
  if (polygonWall) return polygonWall

  const opening = doc.openings.find(candidate => candidate.id === id)
  if (opening) return opening

  const prop = doc.props.find(candidate => candidate.id === id)
  if (prop) return prop

  return doc.referenceImages.find(candidate => candidate.id === id) || null
}

export function getLinkedPolygonWall(doc: MapDocument, wall: Wall): PolygonWall | null {
  return doc.polygonWalls.find(candidate => candidate.id === wall.polygonWallId) || null
}

export function isLinkedPolygonWall(doc: MapDocument, polygonWallId: string): boolean {
  return doc.walls.some(wall => wall.polygonWallId === polygonWallId)
}

export function getOpeningCount(doc: MapDocument) {
  return doc.openings.length
}
