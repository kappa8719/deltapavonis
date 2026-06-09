import { create } from "zustand"
import { v4 as uuid } from "uuid"
import type { MapDocument, ActiveTool, Wall, Door, Window, Prop } from "./types"

type EditorStore = {
  document: MapDocument
  selection: string[]
  activeTool: ActiveTool
  zoom: number
  cameraX: number
  cameraY: number
  mouseX: number
  mouseY: number

  setActiveTool: (tool: ActiveTool) => void
  setZoom: (zoom: number) => void
  setCamera: (x: number, y: number) => void
  setMouse: (x: number, y: number) => void
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void

  addWall: (wall: Omit<Wall, "id">) => string
  addDoor: (door: Omit<Door, "id">) => string
  addWindow: (win: Omit<Window, "id">) => string
  addProp: (prop: Omit<Prop, "id">) => string

  updateObject: (id: string, patch: Partial<Wall & Door & Window & Prop>) => void
  deleteSelected: () => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  document: {
    walls: [],
    doors: [],
    windows: [],
    props: [],
  },
  selection: [],
  activeTool: "select",
  zoom: 1,
  cameraX: 0,
  cameraY: 0,
  mouseX: 0,
  mouseY: 0,

  setActiveTool: tool => set({ activeTool: tool }),
  setZoom: zoom => set({ zoom }),
  setCamera: (x, y) => set({ cameraX: x, cameraY: y }),
  setMouse: (x, y) => set({ mouseX: x, mouseY: y }),
  setSelection: ids => set({ selection: ids }),
  toggleSelection: id => {
    const sel = get().selection
    set({ selection: sel.includes(id) ? sel.filter(s => s !== id) : [...sel, id] })
  },

  addWall: wall => {
    const id = uuid()
    set(s => ({ document: { ...s.document, walls: [...s.document.walls, { id, ...wall }] } }))
    return id
  },
  addDoor: door => {
    const id = uuid()
    set(s => ({ document: { ...s.document, doors: [...s.document.doors, { id, ...door }] } }))
    return id
  },
  addWindow: win => {
    const id = uuid()
    set(s => ({ document: { ...s.document, windows: [...s.document.windows, { id, ...win }] } }))
    return id
  },
  addProp: prop => {
    const id = uuid()
    set(s => ({ document: { ...s.document, props: [...s.document.props, { id, ...prop }] } }))
    return id
  },

  updateObject: (id, patch) => {
    set(s => {
      const doc = s.document
      if (doc.walls.find(o => o.id === id)) {
        return { document: { ...doc, walls: doc.walls.map(o => o.id === id ? { ...o, ...patch } : o) } }
      }
      if (doc.doors.find(o => o.id === id)) {
        return { document: { ...doc, doors: doc.doors.map(o => o.id === id ? { ...o, ...patch } : o) } }
      }
      if (doc.windows.find(o => o.id === id)) {
        return { document: { ...doc, windows: doc.windows.map(o => o.id === id ? { ...o, ...patch } : o) } }
      }
      if (doc.props.find(o => o.id === id)) {
        return { document: { ...doc, props: doc.props.map(o => o.id === id ? { ...o, ...patch } : o) } }
      }
      return {}
    })
  },

  deleteSelected: () => {
    const ids = new Set(get().selection)
    set(s => ({
      selection: [],
      document: {
        walls: s.document.walls.filter(o => !ids.has(o.id)),
        doors: s.document.doors.filter(o => !ids.has(o.id)),
        windows: s.document.windows.filter(o => !ids.has(o.id)),
        props: s.document.props.filter(o => !ids.has(o.id)),
      },
    }))
  },
}))
