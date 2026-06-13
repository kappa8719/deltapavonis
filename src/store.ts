import { create } from "zustand"
import { v4 as uuid } from "uuid"
import {
  DEFAULT_DOOR_WIDTH,
  DEFAULT_WALL_THICKNESS,
} from "./lib/map-geometry"
import {
  getObject,
  getWallByOpeningId,
  getOpeningCount,
} from "./types"
import type {
  ActiveTool,
  MapDocument,
  ObjectPatch,
  Prop,
  ReferenceImage,
  Wall,
  WallOpening,
  WallOpeningKind,
} from "./types"
import type { LoadResult } from "./lib/map-format"

function createDefaultRoom({ size, wallThickness }: { size: number; wallThickness: number }) {
  const half = size / 2

  const wallIds = {
    top: uuid(),
    right: uuid(),
    bottom: uuid(),
    left: uuid(),
  }
  const doorId = uuid()
  const propId = uuid()

  const document: MapDocument = {
    walls: [
      {
        id: wallIds.top,
        kind: "wall",
        start: { x: -half, y: -half },
        end: { x: half, y: -half },
        thickness: wallThickness,
        openings: [],
      },
      {
        id: wallIds.right,
        kind: "wall",
        start: { x: half, y: -half },
        end: { x: half, y: half },
        thickness: wallThickness,
        openings: [],
      },
      {
        id: wallIds.bottom,
        kind: "wall",
        start: { x: -half, y: half },
        end: { x: half, y: half },
        thickness: wallThickness,
        openings: [
          {
            id: doorId,
            kind: "door",
            offset: size / 2,
            width: DEFAULT_DOOR_WIDTH,
          },
        ],
      },
      {
        id: wallIds.left,
        kind: "wall",
        start: { x: -half, y: half },
        end: { x: -half, y: -half },
        thickness: wallThickness,
        openings: [],
      },
    ],
    props: [
      { id: propId, kind: "prop", x: 10, y: 10, assetId: "locker" },
    ],
    referenceImages: [],
  }

  const names: Record<string, string> = {
    [wallIds.top]: "Wall_001",
    [wallIds.right]: "Wall_002",
    [wallIds.bottom]: "Wall_003",
    [wallIds.left]: "Wall_004",
    [doorId]: "Door_001",
    [propId]: "Prop_001",
  }

  return {
    document,
    names,
    counters: { wall: 4, door: 1, window: 0, prop: 1, referenceImage: 0 },
    roomWidth: size,
    roomHeight: size,
  }
}

const initialState = createDefaultRoom({
  size: 100,
  wallThickness: DEFAULT_WALL_THICKNESS,
})

type OpeningDraft = Omit<WallOpening, "id" | "kind">

type EditorStore = {
  document: MapDocument
  selection: string[]
  activeTool: ActiveTool
  wallToolThickness: number
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
  setWallToolThickness: (thickness: number) => void
  setZoom: (zoom: number) => void
  setCamera: (x: number, y: number) => void
  setMouse: (x: number, y: number) => void
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void
  setSnapSize: (size: number) => void
  setGridVisible: (visible: boolean) => void

  addWall: (wall: Omit<Wall, "id" | "kind">) => string
  addDoor: (wallId: string, door: OpeningDraft) => string | null
  addWindow: (wallId: string, win: OpeningDraft) => string | null
  addProp: (prop: Omit<Prop, "id" | "kind">) => string
  addReferenceImage: (img: Omit<ReferenceImage, "id" | "kind">) => string

  updateObject: (id: string, patch: ObjectPatch) => void
  deleteSelected: () => void
  getObjectName: (id: string) => string
  getObjectCount: () => number

  /** Replace the entire document with a loaded map file's contents. */
  importMap: (result: LoadResult) => void
}

function createOpeningName(kind: WallOpeningKind, counter: number) {
  const label = kind === "door" ? "Door" : "Window"
  return `${label}_${String(counter).padStart(3, "0")}`
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  document: initialState.document,
  selection: [],
  activeTool: "select",
  wallToolThickness: DEFAULT_WALL_THICKNESS,
  zoom: 1,
  cameraX: 0,
  cameraY: 0,
  mouseX: 0,
  mouseY: 0,
  snapSize: 5,
  gridVisible: true,
  roomWidth: initialState.roomWidth,
  roomHeight: initialState.roomHeight,
  names: initialState.names,
  counters: initialState.counters,

  setActiveTool: tool => set({ activeTool: tool }),
  setWallToolThickness: thickness => set({ wallToolThickness: Math.max(1, thickness) }),
  setZoom: zoom => set({ zoom }),
  setCamera: (x, y) => set({ cameraX: x, cameraY: y }),
  setMouse: (x, y) => set({ mouseX: x, mouseY: y }),
  setSelection: ids => set({ selection: ids }),
  toggleSelection: id => {
    const selection = get().selection
    set({
      selection: selection.includes(id)
        ? selection.filter(candidate => candidate !== id)
        : [...selection, id],
    })
  },
  setSnapSize: size => set({ snapSize: Math.max(1, size) }),
  setGridVisible: visible => set({ gridVisible: visible }),

  addWall: wall => {
    const id = uuid()
    const counter = (get().counters.wall || 0) + 1
    const name = `Wall_${String(counter).padStart(3, "0")}`
    set(state => ({
      document: {
        ...state.document,
        walls: [...state.document.walls, { id, kind: "wall", ...wall }],
      },
      names: { ...state.names, [id]: name },
      counters: { ...state.counters, wall: counter },
    }))
    return id
  },
  addDoor: (wallId, door) => {
    const wall = get().document.walls.find(candidate => candidate.id === wallId)
    if (!wall) return null

    const id = uuid()
    const counter = (get().counters.door || 0) + 1
    const name = createOpeningName("door", counter)

    set(state => ({
      document: {
        ...state.document,
        walls: state.document.walls.map(candidate =>
          candidate.id === wallId
            ? { ...candidate, openings: [...candidate.openings, { id, kind: "door", ...door }] }
            : candidate
        ),
      },
      names: { ...state.names, [id]: name },
      counters: { ...state.counters, door: counter },
    }))

    return id
  },
  addWindow: (wallId, win) => {
    const wall = get().document.walls.find(candidate => candidate.id === wallId)
    if (!wall) return null

    const id = uuid()
    const counter = (get().counters.window || 0) + 1
    const name = createOpeningName("window", counter)

    set(state => ({
      document: {
        ...state.document,
        walls: state.document.walls.map(candidate =>
          candidate.id === wallId
            ? { ...candidate, openings: [...candidate.openings, { id, kind: "window", ...win }] }
            : candidate
        ),
      },
      names: { ...state.names, [id]: name },
      counters: { ...state.counters, window: counter },
    }))

    return id
  },
  addProp: prop => {
    const id = uuid()
    const counter = (get().counters.prop || 0) + 1
    const name = `Prop_${String(counter).padStart(3, "0")}`
    set(state => ({
      document: {
        ...state.document,
        props: [...state.document.props, { id, kind: "prop", ...prop }],
      },
      names: { ...state.names, [id]: name },
      counters: { ...state.counters, prop: counter },
    }))
    return id
  },
  addReferenceImage: img => {
    const id = uuid()
    const counter = (get().counters.referenceImage || 0) + 1
    const name = `Reference_${String(counter).padStart(3, "0")}`
    set(state => ({
      document: {
        ...state.document,
        referenceImages: [
          ...state.document.referenceImages,
          { id, kind: "referenceImage", ...img },
        ],
      },
      names: { ...state.names, [id]: name },
      counters: { ...state.counters, referenceImage: counter },
    }))
    return id
  },

  updateObject: (id, patch) => {
    set(state => {
      const wall = state.document.walls.find(candidate => candidate.id === id)
      if (wall) {
        return {
          document: {
            ...state.document,
            walls: state.document.walls.map(candidate =>
              candidate.id === id
                ? {
                  ...candidate,
                  start: patch.start ?? candidate.start,
                  end: patch.end ?? candidate.end,
                  thickness: patch.thickness ?? candidate.thickness,
                }
                : candidate
            ),
          },
        }
      }

      const openingWall = getWallByOpeningId(state.document, id)
      if (openingWall) {
        return {
          document: {
            ...state.document,
            walls: state.document.walls.map(candidate =>
              candidate.id === openingWall.id
                ? {
                  ...candidate,
                  openings: candidate.openings.map(opening =>
                    opening.id === id
                      ? {
                        ...opening,
                        offset: patch.offset ?? opening.offset,
                        width: patch.width ?? opening.width,
                      }
                      : opening
                  ),
                }
                : candidate
            ),
          },
        }
      }

      if (state.document.props.some(candidate => candidate.id === id)) {
        return {
          document: {
            ...state.document,
            props: state.document.props.map(candidate =>
              candidate.id === id
                ? {
                  ...candidate,
                  x: patch.x ?? candidate.x,
                  y: patch.y ?? candidate.y,
                  assetId: patch.assetId ?? candidate.assetId,
                  rotation: patch.rotation !== undefined ? patch.rotation : candidate.rotation,
                }
                : candidate
            ),
          },
        }
      }

      if (state.document.referenceImages.some(candidate => candidate.id === id)) {
        return {
          document: {
            ...state.document,
            referenceImages: state.document.referenceImages.map(candidate =>
              candidate.id === id
                ? {
                  ...candidate,
                  x: patch.x ?? candidate.x,
                  y: patch.y ?? candidate.y,
                  width: patch.width ?? candidate.width,
                  height: patch.height ?? candidate.height,
                  rotation: patch.rotation ?? candidate.rotation,
                  opacity: patch.opacity ?? candidate.opacity,
                  src: patch.src ?? candidate.src,
                }
                : candidate
            ),
          },
        }
      }

      return {}
    })
  },

  deleteSelected: () => {
    const selectedIds = new Set(get().selection)

    set(state => {
      const deletedIds = new Set<string>()
      const walls = state.document.walls.flatMap(wall => {
        if (selectedIds.has(wall.id)) {
          deletedIds.add(wall.id)
          wall.openings.forEach(opening => deletedIds.add(opening.id))
          return []
        }

        const openings = wall.openings.filter(opening => {
          const shouldDelete = selectedIds.has(opening.id)
          if (shouldDelete) deletedIds.add(opening.id)
          return !shouldDelete
        })

        return [{ ...wall, openings }]
      })

      const props = state.document.props.filter(prop => {
        const shouldDelete = selectedIds.has(prop.id)
        if (shouldDelete) deletedIds.add(prop.id)
        return !shouldDelete
      })

      const referenceImages = state.document.referenceImages.filter(img => {
        const shouldDelete = selectedIds.has(img.id)
        if (shouldDelete) deletedIds.add(img.id)
        return !shouldDelete
      })

      const names = Object.fromEntries(
        Object.entries(state.names).filter(([id]) => !deletedIds.has(id))
      )

      return {
        selection: [],
        document: { walls, props, referenceImages },
        names,
      }
    })
  },

  getObjectName: id => get().names[id] || id.slice(0, 8),
  getObjectCount: () => {
    const document = get().document
    return document.walls.length + getOpeningCount(document) + document.props.length + document.referenceImages.length
  },

  importMap: result => {
    set({
      document: result.document,
      names: result.names,
      counters: result.counters,
      roomWidth: result.roomWidth,
      roomHeight: result.roomHeight,
      selection: [],
      cameraX: 0,
      cameraY: 0,
      zoom: 1,
    })
  },
}))

export function getSelectedObject() {
  const { document, selection } = useEditorStore.getState()
  const selectedId = selection[0]
  return selectedId ? getObject(document, selectedId) : null
}
