import { create } from "zustand"
import { v4 as uuid } from "uuid"
import {
  applyTileChanges,
  BUCKET_FILL_LIMIT,
  createDefaultTilemap,
  createProceduralTileset,
  getNextFirstGid,
  getTile,
  isTilesetInUse,
  mergeTileChanges,
  normalizeLayerOrders,
  sortTilemap,
  type TileCoord,
} from "./lib/tilemap"
import {
  createUnrotatedWallPolygon,
  DEFAULT_DOOR_WIDTH,
  DEFAULT_WALL_THICKNESS,
  getPolygonWallWorldVertices,
  getWallQuad,
  isValidPolygon,
  translatePolygon,
  unionPolygons,
  wallRotation,
} from "./lib/map-geometry"
import {
  getObject,
  getOpeningCount,
  isLinkedPolygonWall,
} from "./types"
import type {
  ActiveTool,
  FloorEditorState,
  FloorTool,
  MapDocument,
  ObjectPatch,
  Opening,
  PolygonWall,
  Prop,
  ReferenceImage,
  TileCellChange,
  TileEditCommand,
  TileLayer,
  TileSelection,
  TilesetAsset,
  Wall,
  WallOpeningKind,
} from "./types"
import type { LoadResult } from "./lib/map-format"

const STORAGE_KEY = "delta-pavonis-editor-state"
const STORAGE_VERSION = 2

type PersistedEditorState = {
  version: typeof STORAGE_VERSION
  document: MapDocument
  tilesetAssets: Record<string, TilesetAsset>
  roomWidth: number
  roomHeight: number
  names: Record<string, string>
  counters: Record<string, number>
}

function createDefaultFloorState(tilemap: MapDocument["tilemap"]): FloorEditorState {
  return {
    activeLayerId: tilemap.layers[0]?.id ?? null,
    activeTilesetId: tilemap.tilesets[0]?.tilesetId ?? null,
    selectedTileIds: tilemap.tilesets[0] ? [tilemap.tilesets[0].firstGid] : [],
    activeTool: "pencil",
    paletteZoom: 2,
    clipboard: null,
    selection: null,
  }
}

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
    tilemap: createDefaultTilemap(),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isMapDocument(value: unknown): value is MapDocument {
  if (!isRecord(value)) return false
  return isRecord(value.tilemap) &&
    typeof value.tilemap.tileSize === "number" &&
    Array.isArray(value.tilemap.tilesets) &&
    Array.isArray(value.tilemap.layers) &&
    Array.isArray(value.walls) &&
    Array.isArray(value.polygonWalls) &&
    Array.isArray(value.openings) &&
    Array.isArray(value.props) &&
    Array.isArray(value.referenceImages)
}

function isTilesetAsset(value: unknown): value is TilesetAsset {
  if (!isRecord(value)) return false
  return typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.texturePath === "string" &&
    typeof value.tileWidth === "number" &&
    typeof value.tileHeight === "number" &&
    typeof value.columns === "number" &&
    typeof value.tileCount === "number"
}

function loadPersistedState(): PersistedEditorState | null {
  if (typeof localStorage === "undefined") return null

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) return null
    if (!isMapDocument(parsed.document)) return null
    if (!isRecord(parsed.tilesetAssets)) return null
    if (typeof parsed.roomWidth !== "number" || typeof parsed.roomHeight !== "number") return null
    if (!isRecord(parsed.names) || !isRecord(parsed.counters)) return null

    return {
      version: STORAGE_VERSION,
      document: {
        ...parsed.document,
        referenceImages: parsed.document.referenceImages.map(img => ({
          ...img,
          locked: img.locked ?? false,
        })),
      },
      tilesetAssets: Object.fromEntries(
        Object.entries(parsed.tilesetAssets).filter((entry): entry is [string, TilesetAsset] => isTilesetAsset(entry[1]))
      ),
      roomWidth: parsed.roomWidth,
      roomHeight: parsed.roomHeight,
      names: Object.fromEntries(
        Object.entries(parsed.names).filter((entry): entry is [string, string] => typeof entry[1] === "string")
      ),
      counters: Object.fromEntries(
        Object.entries(parsed.counters).filter((entry): entry is [string, number] => typeof entry[1] === "number")
      ),
    }
  } catch (err) {
    console.warn("Failed to load editor state from local storage", err)
    return null
  }
}

function persistState(state: EditorStore) {
  if (typeof localStorage === "undefined") return

  const snapshot: PersistedEditorState = {
    version: STORAGE_VERSION,
    document: state.document,
    tilesetAssets: state.tilesetAssets,
    roomWidth: state.roomWidth,
    roomHeight: state.roomHeight,
    names: state.names,
    counters: state.counters,
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch (err) {
    console.warn("Failed to save editor state to local storage", err)
  }
}

const defaultState = createDefaultRoom({
  size: 100,
  wallThickness: DEFAULT_WALL_THICKNESS,
})
const defaultTileset = createProceduralTileset(defaultState.document.tilemap.tileSize)
defaultState.document.tilemap = {
  ...defaultState.document.tilemap,
  tilesets: [{ tilesetId: defaultTileset.id, firstGid: 1 }],
}
const persistedState = loadPersistedState()
const initialState = persistedState ?? defaultState
const initialTilesetAssets = persistedState?.tilesetAssets ?? { [defaultTileset.id]: defaultTileset }
const initialFloorState = createDefaultFloorState(initialState.document.tilemap)

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
  tilesetAssets: Record<string, TilesetAsset>
  floor: FloorEditorState
  undoStack: TileEditCommand[]
  redoStack: TileEditCommand[]

  setActiveTool: (tool: ActiveTool) => void
  setFloorTool: (tool: FloorTool) => void
  setActiveLayer: (id: string | null) => void
  setActiveTileset: (id: string | null) => void
  selectTiles: (tilesetId: string, localTileIds: number[]) => void
  setPaletteZoom: (zoom: number) => void
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
  joinWalls: (ids: string[]) => string | null

  addTilesetAsset: (asset: TilesetAsset) => string | null
  removeTileset: (tilesetId: string) => boolean
  createTileLayer: (name?: string) => string
  deleteTileLayer: (id: string) => boolean
  renameTileLayer: (id: string, name: string) => void
  setTileLayerVisibility: (id: string, visible: boolean) => void
  setTileLayerLocked: (id: string, locked: boolean) => void
  moveTileLayer: (id: string, direction: -1 | 1) => void
  applyTileEdit: (layerId: string, changes: TileCellChange[], recordUndo?: boolean) => void
  paintTile: (tile: TileCoord, gid: number) => void
  paintStamp: (tile: TileCoord, erase?: boolean) => void
  fillTileRect: (start: TileCoord, end: TileCoord, erase?: boolean) => void
  bucketFill: (tile: TileCoord) => void
  setTileSelection: (selection: TileSelection | null) => void
  copyTileSelection: () => void
  cutTileSelection: () => void
  deleteTileSelection: () => void
  moveTileSelection: (target: TileCoord) => void
  pasteTileClipboard: (target: TileCoord) => void
  undoTileEdit: () => void
  redoTileEdit: () => void

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

function isFloorTool(tool: ActiveTool): tool is FloorTool {
  return tool === "pencil" ||
    tool === "eraser" ||
    tool === "rectangle" ||
    tool === "bucket" ||
    tool === "tileSelection" ||
    tool === "stamp"
}

function getActiveLayer(state: EditorStore): TileLayer | null {
  const activeLayerId = state.floor.activeLayerId ?? state.document.tilemap.layers[0]?.id
  return state.document.tilemap.layers.find(layer => layer.id === activeLayerId) ?? null
}

function getPrimarySelectedGid(state: EditorStore) {
  return state.floor.selectedTileIds[0] ?? 0
}

function getSelectedStamp(state: EditorStore) {
  const tilesetId = state.floor.activeTilesetId
  if (!tilesetId || state.floor.selectedTileIds.length === 0) return null
  const ref = state.document.tilemap.tilesets.find(candidate => candidate.tilesetId === tilesetId)
  const asset = state.tilesetAssets[tilesetId]
  if (!ref || !asset) return null

  const localIds = state.floor.selectedTileIds
    .map(gid => gid - ref.firstGid)
    .filter(localId => localId >= 0 && localId < asset.tileCount)
  if (!localIds.length) return null

  const xs = localIds.map(localId => localId % asset.columns)
  const ys = localIds.map(localId => Math.floor(localId / asset.columns))
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const selected = new Set(localIds)
  const data: number[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const localId = (minY + y) * asset.columns + minX + x
      data.push(selected.has(localId) ? ref.firstGid + localId : 0)
    }
  }

  return { width, height, data }
}

function createLayerName(index: number) {
  return `Layer ${String(index).padStart(2, "0")}`
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
  tilesetAssets: initialTilesetAssets,
  floor: initialFloorState,
  undoStack: [],
  redoStack: [],

  setActiveTool: tool => set(state => ({
    activeTool: tool,
    floor: isFloorTool(tool) ? { ...state.floor, activeTool: tool } : state.floor,
  })),
  setFloorTool: tool => set(state => ({ activeTool: tool, floor: { ...state.floor, activeTool: tool } })),
  setActiveLayer: id => set(state => ({ floor: { ...state.floor, activeLayerId: id } })),
  setActiveTileset: id => set(state => {
    const ref = id ? state.document.tilemap.tilesets.find(candidate => candidate.tilesetId === id) : null
    const selectedTileIds = ref ? [ref.firstGid] : []
    return {
      floor: {
        ...state.floor,
        activeTilesetId: id,
        selectedTileIds,
      },
    }
  }),
  selectTiles: (tilesetId, localTileIds) => set(state => {
    const ref = state.document.tilemap.tilesets.find(candidate => candidate.tilesetId === tilesetId)
    if (!ref) return {}
    const asset = state.tilesetAssets[tilesetId]
    if (!asset) return {}
    const selectedTileIds = localTileIds
      .filter(id => Number.isInteger(id) && id >= 0 && id < asset.tileCount)
      .map(localTileId => ref.firstGid + localTileId)
    if (!selectedTileIds.length) return {}
    return {
      floor: {
        ...state.floor,
        activeTilesetId: tilesetId,
        selectedTileIds,
      },
      activeTool: isFloorTool(state.activeTool) ? state.activeTool : "pencil",
    }
  }),
  setPaletteZoom: zoom => set(state => ({
    floor: { ...state.floor, paletteZoom: Math.max(1, Math.min(6, zoom)) },
  })),
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
          { id, kind: "referenceImage", ...img, locked: img.locked ?? false },
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
  joinWalls: ids => {
    const requestedIds = new Set(ids)
    const { document } = get()
    const selectedWalls = document.walls.filter(wall => requestedIds.has(wall.id))
    const selectedWallIds = new Set(selectedWalls.map(wall => wall.id))
    const linkedPolygonIds = new Set(selectedWalls.map(wall => wall.polygonWallId))
    const selectedPolygonWalls = document.polygonWalls.filter(polygonWall =>
      requestedIds.has(polygonWall.id) && !isLinkedPolygonWall(document, polygonWall.id)
    )

    const polygons = [
      ...selectedWalls.map(wall => getWallQuad(wall)),
      ...selectedPolygonWalls.map(getPolygonWallWorldVertices),
    ]

    if (polygons.length < 2) return null

    const vertices = unionPolygons(polygons)
    if (!vertices || !isValidPolygon(vertices)) return null

    const id = uuid()
    const polygonCounter = (get().counters.polygonWall || 0) + 1
    const joinedWall: PolygonWall = {
      id,
      kind: "polygonWall",
      vertices,
      rotation: 0,
    }

    set(state => {
      const removedIds = new Set<string>([
        ...selectedWallIds,
        ...linkedPolygonIds,
        ...selectedPolygonWalls.map(polygonWall => polygonWall.id),
      ])

      return {
        document: {
          ...state.document,
          walls: state.document.walls.filter(wall => !selectedWallIds.has(wall.id)),
          polygonWalls: [
            ...state.document.polygonWalls.filter(polygonWall => !removedIds.has(polygonWall.id)),
            joinedWall,
          ],
        },
        selection: [id],
        names: {
          ...Object.fromEntries(Object.entries(state.names).filter(([objectId]) => !removedIds.has(objectId))),
          [id]: `PolygonWall_${String(polygonCounter).padStart(3, "0")}`,
        },
        counters: { ...state.counters, polygonWall: polygonCounter },
      }
    })

    return id
  },

  addTilesetAsset: asset => {
    if (asset.tileWidth !== get().document.tilemap.tileSize || asset.tileHeight !== get().document.tilemap.tileSize) {
      return null
    }

    const id = asset.id || uuid()
    let attachedId: string | null = null
    set(state => {
      const normalizedAsset = { ...asset, id }
      const existingRef = state.document.tilemap.tilesets.find(ref => ref.tilesetId === id)
      const tilesetAssets = { ...state.tilesetAssets, [id]: normalizedAsset }
      const tilemap = existingRef
        ? state.document.tilemap
        : {
          ...state.document.tilemap,
          tilesets: [
            ...state.document.tilemap.tilesets,
            { tilesetId: id, firstGid: getNextFirstGid(state.document.tilemap, tilesetAssets) },
          ],
        }
      const activeRef = tilemap.tilesets.find(ref => ref.tilesetId === id)
      attachedId = id

      return {
        tilesetAssets,
        document: { ...state.document, tilemap },
        floor: {
          ...state.floor,
          activeTilesetId: id,
          selectedTileIds: activeRef ? [activeRef.firstGid] : state.floor.selectedTileIds,
        },
      }
    })
    return attachedId
  },

  removeTileset: tilesetId => {
    let removed = false
    set(state => {
      if (isTilesetInUse(state.document.tilemap, state.tilesetAssets, tilesetId)) return {}
      if (!state.document.tilemap.tilesets.some(ref => ref.tilesetId === tilesetId)) return {}

      const tilemap = {
        ...state.document.tilemap,
        tilesets: state.document.tilemap.tilesets.filter(ref => ref.tilesetId !== tilesetId),
      }
      const tilesetAssets = { ...state.tilesetAssets }
      delete tilesetAssets[tilesetId]
      const nextActiveTilesetId = state.floor.activeTilesetId === tilesetId
        ? tilemap.tilesets[0]?.tilesetId ?? null
        : state.floor.activeTilesetId
      const nextRef = nextActiveTilesetId
        ? tilemap.tilesets.find(ref => ref.tilesetId === nextActiveTilesetId)
        : null
      removed = true

      return {
        tilesetAssets,
        document: { ...state.document, tilemap },
        floor: {
          ...state.floor,
          activeTilesetId: nextActiveTilesetId,
          selectedTileIds: nextRef ? [nextRef.firstGid] : [],
        },
      }
    })
    return removed
  },

  createTileLayer: name => {
    const id = uuid()
    set(state => {
      const layer: TileLayer = {
        id,
        name: name?.trim() || createLayerName(state.document.tilemap.layers.length + 1),
        order: state.document.tilemap.layers.length,
        visible: true,
        locked: false,
        chunks: [],
      }
      return {
        document: {
          ...state.document,
          tilemap: {
            ...state.document.tilemap,
            layers: normalizeLayerOrders([...state.document.tilemap.layers, layer]),
          },
        },
        floor: { ...state.floor, activeLayerId: id },
      }
    })
    return id
  },

  deleteTileLayer: id => {
    let deleted = false
    set(state => {
      if (state.document.tilemap.layers.length <= 1) return {}
      if (!state.document.tilemap.layers.some(layer => layer.id === id)) return {}
      const layers = normalizeLayerOrders(state.document.tilemap.layers.filter(layer => layer.id !== id))
      deleted = true
      return {
        document: {
          ...state.document,
          tilemap: { ...state.document.tilemap, layers },
        },
        floor: {
          ...state.floor,
          activeLayerId: state.floor.activeLayerId === id ? layers[0]?.id ?? null : state.floor.activeLayerId,
          selection: null,
        },
      }
    })
    return deleted
  },

  renameTileLayer: (id, name) => set(state => ({
    document: {
      ...state.document,
      tilemap: {
        ...state.document.tilemap,
        layers: state.document.tilemap.layers.map(layer =>
          layer.id === id ? { ...layer, name: name.trim() || layer.name } : layer
        ),
      },
    },
  })),

  setTileLayerVisibility: (id, visible) => set(state => ({
    document: {
      ...state.document,
      tilemap: {
        ...state.document.tilemap,
        layers: state.document.tilemap.layers.map(layer =>
          layer.id === id ? { ...layer, visible } : layer
        ),
      },
    },
  })),

  setTileLayerLocked: (id, locked) => set(state => ({
    document: {
      ...state.document,
      tilemap: {
        ...state.document.tilemap,
        layers: state.document.tilemap.layers.map(layer =>
          layer.id === id ? { ...layer, locked } : layer
        ),
      },
    },
  })),

  moveTileLayer: (id, direction) => set(state => {
    const layers = normalizeLayerOrders(state.document.tilemap.layers)
    const index = layers.findIndex(layer => layer.id === id)
    const swapIndex = index + direction
    if (index < 0 || swapIndex < 0 || swapIndex >= layers.length) return {}
    const reordered = [...layers]
    const current = reordered[index]
    reordered[index] = reordered[swapIndex]
    reordered[swapIndex] = current
    return {
      document: {
        ...state.document,
        tilemap: { ...state.document.tilemap, layers: normalizeLayerOrders(reordered) },
      },
    }
  }),

  applyTileEdit: (layerId, changes, recordUndo = true) => {
    set(state => {
      const layer = state.document.tilemap.layers.find(candidate => candidate.id === layerId)
      if (!layer || layer.locked) return {}
      const merged = mergeTileChanges(changes)
      if (!merged.length) return {}

      return {
        document: {
          ...state.document,
          tilemap: {
            ...state.document.tilemap,
            layers: state.document.tilemap.layers.map(candidate =>
              candidate.id === layerId ? applyTileChanges(candidate, merged) : candidate
            ),
          },
        },
        undoStack: recordUndo ? [...state.undoStack, { layerId, changes: merged }] : state.undoStack,
        redoStack: recordUndo ? [] : state.redoStack,
      }
    })
  },

  paintTile: (tile, gid) => {
    const state = get()
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    const before = getTile(layer, tile.x, tile.y)
    get().applyTileEdit(layer.id, [{ x: tile.x, y: tile.y, before, after: gid }])
  },

  paintStamp: (tile, erase = false) => {
    const state = get()
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    const stamp = getSelectedStamp(state)
    if (!stamp && !erase) return
    const changes: TileCellChange[] = []
    const width = erase ? 1 : stamp?.width ?? 1
    const height = erase ? 1 : stamp?.height ?? 1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const after = erase ? 0 : stamp?.data[y * width + x] ?? getPrimarySelectedGid(state)
        if (after === 0 && !erase) continue
        const tx = tile.x + x
        const ty = tile.y + y
        changes.push({ x: tx, y: ty, before: getTile(layer, tx, ty), after })
      }
    }
    get().applyTileEdit(layer.id, changes)
  },

  fillTileRect: (start, end, erase = false) => {
    const state = get()
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    const stamp = getSelectedStamp(state)
    const primaryGid = getPrimarySelectedGid(state)
    if (!erase && !stamp && primaryGid === 0) return

    const minX = Math.min(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const maxX = Math.max(start.x, end.x)
    const maxY = Math.max(start.y, end.y)
    const changes: TileCellChange[] = []

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const after = erase
          ? 0
          : stamp
            ? stamp.data[((y - minY) % stamp.height) * stamp.width + ((x - minX) % stamp.width)]
            : primaryGid
        const before = getTile(layer, x, y)
        changes.push({ x, y, before, after })
      }
    }
    get().applyTileEdit(layer.id, changes)
  },

  bucketFill: tile => {
    const state = get()
    const layer = getActiveLayer(state)
    if (!layer || layer.locked) return
    const after = getPrimarySelectedGid(state)
    const before = getTile(layer, tile.x, tile.y)
    if (before === after) return

    const queue: TileCoord[] = [tile]
    const seen = new Set<string>()
    const changes: TileCellChange[] = []
    while (queue.length && changes.length < BUCKET_FILL_LIMIT) {
      const current = queue.shift()!
      const key = `${current.x},${current.y}`
      if (seen.has(key)) continue
      seen.add(key)
      if (getTile(layer, current.x, current.y) !== before) continue
      changes.push({ x: current.x, y: current.y, before, after })
      queue.push(
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      )
    }
    get().applyTileEdit(layer.id, changes)
  },

  setTileSelection: selection => set(state => ({
    floor: { ...state.floor, selection },
    activeTool: selection ? "tileSelection" : state.activeTool,
  })),

  copyTileSelection: () => set(state => {
    const layer = getActiveLayer(state)
    const selection = state.floor.selection
    if (!layer || !selection) return {}
    const data: number[] = []
    for (let y = 0; y < selection.height; y++) {
      for (let x = 0; x < selection.width; x++) {
        data.push(getTile(layer, selection.x + x, selection.y + y))
      }
    }
    return {
      floor: {
        ...state.floor,
        clipboard: { width: selection.width, height: selection.height, data },
      },
    }
  }),

  cutTileSelection: () => {
    get().copyTileSelection()
    get().deleteTileSelection()
  },

  deleteTileSelection: () => {
    const state = get()
    const layer = getActiveLayer(state)
    const selection = state.floor.selection
    if (!layer || layer.locked || !selection) return
    const changes: TileCellChange[] = []
    for (let y = 0; y < selection.height; y++) {
      for (let x = 0; x < selection.width; x++) {
        const tx = selection.x + x
        const ty = selection.y + y
        changes.push({ x: tx, y: ty, before: getTile(layer, tx, ty), after: 0 })
      }
    }
    get().applyTileEdit(layer.id, changes)
  },

  moveTileSelection: target => {
    const state = get()
    const layer = getActiveLayer(state)
    const selection = state.floor.selection
    if (!layer || layer.locked || !selection) return
    if (target.x === selection.x && target.y === selection.y) return

    const sourceData: number[] = []
    for (let y = 0; y < selection.height; y++) {
      for (let x = 0; x < selection.width; x++) {
        sourceData.push(getTile(layer, selection.x + x, selection.y + y))
      }
    }

    const finalByCoord = new Map<string, TileCellChange>()
    const setFinal = (x: number, y: number, after: number) => {
      const key = `${x},${y}`
      const existing = finalByCoord.get(key)
      finalByCoord.set(key, {
        x,
        y,
        before: existing?.before ?? getTile(layer, x, y),
        after,
      })
    }

    for (let y = 0; y < selection.height; y++) {
      for (let x = 0; x < selection.width; x++) {
        setFinal(selection.x + x, selection.y + y, 0)
      }
    }

    for (let y = 0; y < selection.height; y++) {
      for (let x = 0; x < selection.width; x++) {
        setFinal(target.x + x, target.y + y, sourceData[y * selection.width + x] ?? 0)
      }
    }

    get().applyTileEdit(layer.id, [...finalByCoord.values()])
    set(stateAfter => ({
      floor: {
        ...stateAfter.floor,
        selection: { x: target.x, y: target.y, width: selection.width, height: selection.height },
      },
    }))
  },

  pasteTileClipboard: target => {
    const state = get()
    const layer = getActiveLayer(state)
    const clipboard = state.floor.clipboard
    if (!layer || layer.locked || !clipboard) return
    const changes: TileCellChange[] = []
    for (let y = 0; y < clipboard.height; y++) {
      for (let x = 0; x < clipboard.width; x++) {
        const tx = target.x + x
        const ty = target.y + y
        changes.push({
          x: tx,
          y: ty,
          before: getTile(layer, tx, ty),
          after: clipboard.data[y * clipboard.width + x] ?? 0,
        })
      }
    }
    get().applyTileEdit(layer.id, changes)
    set(stateAfter => ({
      floor: {
        ...stateAfter.floor,
        selection: { x: target.x, y: target.y, width: clipboard.width, height: clipboard.height },
      },
    }))
  },

  undoTileEdit: () => set(state => {
    const command = state.undoStack[state.undoStack.length - 1]
    if (!command) return {}
    const reversed = command.changes.map(change => ({
      x: change.x,
      y: change.y,
      before: change.after,
      after: change.before,
    }))
    return {
      document: {
        ...state.document,
        tilemap: {
          ...state.document.tilemap,
          layers: state.document.tilemap.layers.map(layer =>
            layer.id === command.layerId ? applyTileChanges(layer, reversed) : layer
          ),
        },
      },
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, command],
    }
  }),

  redoTileEdit: () => set(state => {
    const command = state.redoStack[state.redoStack.length - 1]
    if (!command) return {}
    return {
      document: {
        ...state.document,
        tilemap: {
          ...state.document.tilemap,
          layers: state.document.tilemap.layers.map(layer =>
            layer.id === command.layerId ? applyTileChanges(layer, command.changes) : layer
          ),
        },
      },
      undoStack: [...state.undoStack, command],
      redoStack: state.redoStack.slice(0, -1),
    }
  }),

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
                  locked: patch.locked ?? candidate.locked ?? false,
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
        document: { ...state.document, walls, polygonWalls, openings, props, referenceImages },
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
      document: {
        ...result.document,
        referenceImages: result.document.referenceImages.map(img => ({
          ...img,
          locked: img.locked ?? false,
        })),
        tilemap: sortTilemap(result.document.tilemap),
      },
      names: result.names,
      counters: result.counters,
      tilesetAssets: { ...get().tilesetAssets, ...(result.tilesetAssets ?? {}) },
      floor: createDefaultFloorState(result.document.tilemap),
      undoStack: [],
      redoStack: [],
      roomWidth: result.roomWidth,
      roomHeight: result.roomHeight,
      selection: [],
      cameraX: 0,
      cameraY: 0,
      zoom: 1,
    })
  },
}))

useEditorStore.subscribe(persistState)

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
