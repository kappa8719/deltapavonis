import { create } from "zustand"
import { v4 as uuid } from "uuid"
import {
  createUnrotatedWallPolygon,
  DEFAULT_DOOR_WIDTH,
  DEFAULT_WALL_THICKNESS,
  isValidPolygon,
  translatePolygon,
  wallRotation,
} from "./lib/map-geometry"
import {
  getObject,
  getOpeningCount,
  isLinkedPolygonWall,
} from "./types"
import type {
  ActiveTool,
  MapDocument,
  ObjectPatch,
  Opening,
  Prop,
  ReferenceImage,
  Wall,
  WallOpeningKind,
} from "./types"
import type { LoadResult } from "./lib/map-format"

function createEditorWall(
  id: string,
  polygonWallId: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  thickness: number
): Wall {
  return { id, kind: "wall", a, b, thickness, polygonWallId }
}

function createDefaultRoom({ size, wallThickness }: { size: number; wallThickness: number }) {
  const half = size / 2

  const wallIds = {
    top: uuid(),
    right: uuid(),
    bottom: uuid(),
    left: uuid(),
  }
  const polygonIds = {
    top: uuid(),
    right: uuid(),
    bottom: uuid(),
    left: uuid(),
  }
  const doorId = uuid()
  const propId = uuid()

  const walls = [
    createEditorWall(wallIds.top, polygonIds.top, { x: -half, y: -half }, { x: half, y: -half }, wallThickness),
    createEditorWall(wallIds.right, polygonIds.right, { x: half, y: -half }, { x: half, y: half }, wallThickness),
    createEditorWall(wallIds.bottom, polygonIds.bottom, { x: -half, y: half }, { x: half, y: half }, wallThickness),
    createEditorWall(wallIds.left, polygonIds.left, { x: -half, y: half }, { x: -half, y: -half }, wallThickness),
  ]

  const document: MapDocument = {
    walls,
    polygonWalls: walls.map(wall => ({
      id: wall.polygonWallId,
      kind: "polygonWall",
      vertices: createUnrotatedWallPolygon(wall),
      rotation: wallRotation(wall),
    })),
    openings: [
      {
        id: doorId,
        kind: "door",
        position: { x: 0, y: half },
        rotation: 0,
        width: DEFAULT_DOOR_WIDTH,
        depth: wallThickness,
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
    [polygonIds.top]: "PolygonWall_001",
    [polygonIds.right]: "PolygonWall_002",
    [polygonIds.bottom]: "PolygonWall_003",
    [polygonIds.left]: "PolygonWall_004",
    [doorId]: "Door_001",
    [propId]: "Prop_001",
  }

  return {
    document,
    names,
    counters: { wall: 4, polygonWall: 4, door: 1, window: 0, prop: 1, referenceImage: 0 },
    roomWidth: size,
    roomHeight: size,
  }
}

const initialState = createDefaultRoom({
  size: 100,
  wallThickness: DEFAULT_WALL_THICKNESS,
})

type OpeningDraft = Omit<Opening, "id" | "kind">

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

  addWall: (wall: Omit<Wall, "id" | "kind" | "polygonWallId">) => string
  addOpening: (kind: WallOpeningKind, opening: OpeningDraft) => string
  addDoor: (opening: OpeningDraft) => string
  addWindow: (opening: OpeningDraft) => string
  addProp: (prop: Omit<Prop, "id" | "kind">) => string
  addReferenceImage: (img: Omit<ReferenceImage, "id" | "kind">) => string
  convertWallToPolygon: (wallId: string) => string | null

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
    const polygonWallId = uuid()
    const wallCounter = (get().counters.wall || 0) + 1
    const polygonCounter = (get().counters.polygonWall || 0) + 1
    const editorWall: Wall = { id, kind: "wall", polygonWallId, ...wall }
    const polygonWall = {
      id: polygonWallId,
      kind: "polygonWall" as const,
      vertices: createUnrotatedWallPolygon(editorWall),
      rotation: wallRotation(editorWall),
    }

    set(state => ({
      document: {
        ...state.document,
        walls: [...state.document.walls, editorWall],
        polygonWalls: [...state.document.polygonWalls, polygonWall],
      },
      names: {
        ...state.names,
        [id]: `Wall_${String(wallCounter).padStart(3, "0")}`,
        [polygonWallId]: `PolygonWall_${String(polygonCounter).padStart(3, "0")}`,
      },
      counters: { ...state.counters, wall: wallCounter, polygonWall: polygonCounter },
    }))
    return id
  },
  addOpening: (kind, opening) => {
    const id = uuid()
    const counter = (get().counters[kind] || 0) + 1
    const name = createOpeningName(kind, counter)

    set(state => ({
      document: {
        ...state.document,
        openings: [...state.document.openings, { id, kind, ...opening }],
      },
      names: { ...state.names, [id]: name },
      counters: { ...state.counters, [kind]: counter },
    }))

    return id
  },
  addDoor: opening => get().addOpening("door", opening),
  addWindow: opening => get().addOpening("window", opening),
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
  convertWallToPolygon: wallId => {
    const wall = get().document.walls.find(candidate => candidate.id === wallId)
    if (!wall) return null

    set(state => ({
      document: {
        ...state.document,
        walls: state.document.walls.filter(candidate => candidate.id !== wallId),
      },
      selection: [wall.polygonWallId],
      names: Object.fromEntries(Object.entries(state.names).filter(([id]) => id !== wallId)),
    }))

    return wall.polygonWallId
  },

  updateObject: (id, patch) => {
    set(state => {
      const wall = state.document.walls.find(candidate => candidate.id === id)
      if (wall) {
        const nextWall = {
          ...wall,
          a: patch.a ?? wall.a,
          b: patch.b ?? wall.b,
          thickness: patch.thickness ?? wall.thickness,
        }
        return {
          document: {
            ...state.document,
            walls: state.document.walls.map(candidate => candidate.id === id ? nextWall : candidate),
            polygonWalls: state.document.polygonWalls.map(candidate =>
              candidate.id === wall.polygonWallId
                ? { ...candidate, vertices: createUnrotatedWallPolygon(nextWall), rotation: wallRotation(nextWall) }
                : candidate
            ),
          },
        }
      }

      if (state.document.polygonWalls.some(candidate => candidate.id === id)) {
        if (isLinkedPolygonWall(state.document, id)) return {}
        const nextVertices = patch.vertices
        return {
          document: {
            ...state.document,
            polygonWalls: state.document.polygonWalls.map(candidate =>
              candidate.id === id
                ? {
                  ...candidate,
                  vertices: nextVertices && isValidPolygon(nextVertices) ? nextVertices : candidate.vertices,
                  rotation: patch.rotation ?? candidate.rotation,
                }
                : candidate
            ),
          },
        }
      }

      if (state.document.openings.some(candidate => candidate.id === id)) {
        return {
          document: {
            ...state.document,
            openings: state.document.openings.map(candidate =>
              candidate.id === id
                ? {
                  ...candidate,
                  position: patch.position ?? candidate.position,
                  width: patch.width ?? candidate.width,
                  depth: patch.depth ?? candidate.depth,
                  rotation: patch.rotation ?? candidate.rotation,
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
      const linkedPolygonIds = new Set<string>()

      const walls = state.document.walls.filter(wall => {
        const shouldDelete = selectedIds.has(wall.id)
        if (shouldDelete) {
          deletedIds.add(wall.id)
          deletedIds.add(wall.polygonWallId)
          linkedPolygonIds.add(wall.polygonWallId)
        }
        return !shouldDelete
      })

      const polygonWalls = state.document.polygonWalls.filter(polygonWall => {
        const shouldDelete = linkedPolygonIds.has(polygonWall.id) ||
          (selectedIds.has(polygonWall.id) && !isLinkedPolygonWall(state.document, polygonWall.id))
        if (shouldDelete) deletedIds.add(polygonWall.id)
        return !shouldDelete
      })

      const openings = state.document.openings.filter(opening => {
        const shouldDelete = selectedIds.has(opening.id)
        if (shouldDelete) deletedIds.add(opening.id)
        return !shouldDelete
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
        document: { walls, polygonWalls, openings, props, referenceImages },
        names,
      }
    })
  },

  getObjectName: id => get().names[id] || id.slice(0, 8),
  getObjectCount: () => {
    const document = get().document
    return document.walls.length + document.polygonWalls.length + getOpeningCount(document) + document.props.length + document.referenceImages.length
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

export function translatePolygonObject(id: string, dx: number, dy: number) {
  const { document, updateObject } = useEditorStore.getState()
  const polygon = document.polygonWalls.find(candidate => candidate.id === id)
  if (!polygon || isLinkedPolygonWall(document, id)) return
  updateObject(id, { vertices: translatePolygon(polygon.vertices, dx, dy) })
}

export function getSelectedObject() {
  const { document, selection } = useEditorStore.getState()
  const selectedId = selection[0]
  return selectedId ? getObject(document, selectedId) : null
}
