export type Wall = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type Door = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type Window = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type Prop = {
  id: string
  x: number
  y: number
  assetId: string
}

export type MapDocument = {
  walls: Wall[]
  doors: Door[]
  windows: Window[]
  props: Prop[]
}

export type ActiveTool = "select" | "wall" | "door" | "window" | "prop"

export type MapObject = Wall | Door | Window | Prop

export type ObjectType = "wall" | "door" | "window" | "prop"

export function getObjectType(doc: MapDocument, id: string): ObjectType | null {
  if (doc.walls.find(o => o.id === id)) return "wall"
  if (doc.doors.find(o => o.id === id)) return "door"
  if (doc.windows.find(o => o.id === id)) return "window"
  if (doc.props.find(o => o.id === id)) return "prop"
  return null
}

export function getObject(doc: MapDocument, id: string): MapObject | null {
  return (
    doc.walls.find(o => o.id === id) ||
    doc.doors.find(o => o.id === id) ||
    doc.windows.find(o => o.id === id) ||
    doc.props.find(o => o.id === id) ||
    null
  )
}
