import { create } from "zustand"
import { v4 as uuid } from "uuid"
import type { MapDocument, ActiveTool, Wall, Door, Window, Prop } from "./types"

// Initial room: 100x100u centered at origin, walls 8u thick
const w1 = uuid(), w2 = uuid(), w3 = uuid()
const d1 = uuid(), d2 = uuid()
const win1 = uuid()
const p1 = uuid()

const initialDocument: MapDocument = {
  walls: [
    { id: w1, x: -50, y: -50, width: 8, height: 100 },   // left wall
    { id: w2, x: 42,  y: -50, width: 8, height: 100 },   // right wall
    { id: w3, x: -50, y: -50, width: 100, height: 8 },   // top wall
  ],
  doors: [
    { id: d1, x: -50, y: 20,  width: 8, height: 18 },    // door in left wall
    { id: d2, x: -10, y: 42,  width: 18, height: 8 },    // door in bottom
  ],
  windows: [
    { id: win1, x: 10, y: -50, width: 18, height: 8 },   // window in top wall
  ],
  props: [
    { id: p1, x: 10, y: 10, assetId: "locker" },
  ],
}

const initialNames: Record<string, string> = {
  [w1]: "Wall_001",
  [w2]: "Wall_002",
  [w3]: "Wall_003",
  [d1]: "Door_001",
  [d2]: "Door_002",
  [win1]: "Window_001",
  [p1]: "Prop_001",
}

type EditorStore = {
  document: MapDocument
  selection: string[]
  activeTool: ActiveTool
  zoom: number
  cameraX: number
  cameraY: number
  mouseX: number
  mouseY: number
  snapSize: number
  gridVisible: boolean
  roomWidth: number
  roomHeight: number
  names: Record<string, string>
  counters: Record<string, number>

  setActiveTool: (tool: ActiveTool) => void
  setZoom: (zoom: number) => void
  setCamera: (x: number, y: number) => void
  setMouse: (x: number, y: number) => void
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void
  setSnapSize: (size: number) => void
  setGridVisible: (v: boolean) => void

  addWall: (wall: Omit<Wall, "id">) => string
  addDoor: (door: Omit<Door, "id">) => string
  addWindow: (win: Omit<Window, "id">) => string
  addProp: (prop: Omit<Prop, "id">) => string

  updateObject: (id: string, patch: Partial<Wall & Door & Window & Prop>) => void
  deleteSelected: () => void
  getObjectName: (id: string) => string
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  document: initialDocument,
  selection: [],
  activeTool: "select",
  zoom: 1,
  cameraX: 0,
  cameraY: 0,
  mouseX: 0,
  mouseY: 0,
  snapSize: 5,
  gridVisible: true,
  roomWidth: 100,
  roomHeight: 100,
  names: initialNames,
  counters: { wall: 3, door: 2, window: 1, prop: 1 },

  setActiveTool: tool => set({ activeTool: tool }),
  setZoom: zoom => set({ zoom }),
  setCamera: (x, y) => set({ cameraX: x, cameraY: y }),
  setMouse: (x, y) => set({ mouseX: x, mouseY: y }),
  setSelection: ids => set({ selection: ids }),
  toggleSelection: id => {
    const sel = get().selection
    set({ selection: sel.includes(id) ? sel.filter(s => s !== id) : [...sel, id] })
  },
  setSnapSize: size => set({ snapSize: Math.max(1, size) }),
  setGridVisible: v => set({ gridVisible: v }),

  addWall: wall => {
    const id = uuid()
    const counter = (get().counters["wall"] || 0) + 1
    const name = `Wall_${String(counter).padStart(3, "0")}`
    set(s => ({
      document: { ...s.document, walls: [...s.document.walls, { id, ...wall }] },
      names: { ...s.names, [id]: name },
      counters: { ...s.counters, wall: counter },
    }))
    return id
  },
  addDoor: door => {
    const id = uuid()
    const counter = (get().counters["door"] || 0) + 1
    const name = `Door_${String(counter).padStart(3, "0")}`
    set(s => ({
      document: { ...s.document, doors: [...s.document.doors, { id, ...door }] },
      names: { ...s.names, [id]: name },
      counters: { ...s.counters, door: counter },
    }))
    return id
  },
  addWindow: win => {
    const id = uuid()
    const counter = (get().counters["window"] || 0) + 1
    const name = `Window_${String(counter).padStart(3, "0")}`
    set(s => ({
      document: { ...s.document, windows: [...s.document.windows, { id, ...win }] },
      names: { ...s.names, [id]: name },
      counters: { ...s.counters, window: counter },
    }))
    return id
  },
  addProp: prop => {
    const id = uuid()
    const counter = (get().counters["prop"] || 0) + 1
    const name = `Prop_${String(counter).padStart(3, "0")}`
    set(s => ({
      document: { ...s.document, props: [...s.document.props, { id, ...prop }] },
      names: { ...s.names, [id]: name },
      counters: { ...s.counters, prop: counter },
    }))
    return id
  },

  updateObject: (id, patch) => {
    set(s => {
      const doc = s.document
      if (doc.walls.find(o => o.id === id))
        return { document: { ...doc, walls: doc.walls.map(o => o.id === id ? { ...o, ...patch } : o) } }
      if (doc.doors.find(o => o.id === id))
        return { document: { ...doc, doors: doc.doors.map(o => o.id === id ? { ...o, ...patch } : o) } }
      if (doc.windows.find(o => o.id === id))
        return { document: { ...doc, windows: doc.windows.map(o => o.id === id ? { ...o, ...patch } : o) } }
      if (doc.props.find(o => o.id === id))
        return { document: { ...doc, props: doc.props.map(o => o.id === id ? { ...o, ...patch } : o) } }
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

  getObjectName: id => get().names[id] || id.slice(0, 8),
}))
