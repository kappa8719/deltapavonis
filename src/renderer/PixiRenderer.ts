import * as PIXI from "pixi.js"
import {
  getOpeningDefaultWidth,
  getPolygonWallWorldVertices,
  getRotatedRect,
  getWallQuad,
  PIXELS_PER_UNIT,
  pointInPolygon,
  polygonCentroid,
  translatePolygon,
  wallLength,
  wallLocalToWorld,
  wallNormal,
} from "../lib/map-geometry"
import { useEditorStore } from "../store"
import { getObject, isLinkedPolygonWall } from "../types"
import type {
  MapDocument,
  Opening,
  PolygonWall,
  ReferenceImage,
  Vec2,
  Wall,
  WallOpeningKind,
} from "../types"

const PPU = PIXELS_PER_UNIT
const RULER = 24

const COLORS = {
  bg: 0x111315,
  rulerBg: 0x181b1f,
  rulerTick: 0x4a5568,
  rulerText: 0x6b7684,
  rulerCorner: 0x252a30,
  gridThin: 0x171c22,
  gridMedium: 0x20262d,
  gridStrong: 0x2b333c,
  gridOriginX: 0x3a2828,
  gridOriginY: 0x28382a,
  roomBorder: 0x3a4450,
  roomFill: 0x14171a,
  wall: 0x4a5568,
  wallFill: 0x2d3748,
  door: 0x744210,
  doorFill: 0x92400e,
  window: 0x1a365d,
  windowFill: 0x2b4c7e,
  prop: 0x2d6b2d,
  propFill: 0x3a7c3a,
  selection: 0x4ea1ff,
  handleFill: 0x4ea1ff,
  dimLabel: 0x4ea1ff,
  invalid: 0xc2410c,
}

/**
 * Snap a raw step value to the nearest "nice" number in a 1-2-5-10 progression.
 * e.g. 0.34 → 0.5, 2.7 → 2, 5.3 → 5, 12 → 10, 45 → 50
 */
function snapToNiceStep(rawStep: number): number {
  if (rawStep <= 0) return 1
  const exp = Math.floor(Math.log10(rawStep))
  const frac = rawStep / Math.pow(10, exp)
  let nice: number
  if (frac < 1.5) nice = 1
  else if (frac < 3.5) nice = 2
  else if (frac < 7.5) nice = 5
  else nice = 10
  return nice * Math.pow(10, exp)
}

/**
 * Compute grid step sizes from viewport zoom so grid lines maintain
 * roughly constant pixel density regardless of zoom level.
 *
 * The thin tier targets ~PPU pixel spacing on screen; medium and strong
 * are derived at 5× and 10× the thin step respectively.
 */
function getGridSteps(zoom: number) {
  const gridStep = snapToNiceStep(1 / zoom)
  return {
    thin: gridStep,
    medium: gridStep * 5,
    strong: gridStep * 10,
  }
}

type OpeningPreview = {
  kind: WallOpeningKind
  width: number
  depth: number
  position: Vec2
  rotation: number
}

export type RendererContextMenuRequest = {
  x: number
  y: number
  targetId: string | null
}

type PixiRendererOptions = {
  onContextMenu?: (request: RendererContextMenuRequest) => void
}

type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export class PixiRenderer {
  app: PIXI.Application
  private options: PixiRendererOptions
  private rulerLayer: PIXI.Graphics
  private rulerTextContainer: PIXI.Container
  private gridLayer: PIXI.Graphics
  private referenceImageLayer: PIXI.Container
  private roomLayer: PIXI.Graphics
  private objectLayer: PIXI.Container
  private overlayLayer: PIXI.Graphics
  private previewLayer: PIXI.Graphics
  private unsub: () => void
  private referenceContainers: Map<string, PIXI.Container> = new Map()
  private referenceSrcs: Map<string, string> = new Map()

  /** Per-reference-image children kept by direct reference. Sprite is null until texture loads. */
  private refChildren = new Map<string, { gfx: PIXI.Graphics; sprite: PIXI.Sprite | null }>()

  private isPanning = false
  private panStart = { x: 0, y: 0 }
  private cameraPanStart = { x: 0, y: 0 }

  private isDraggingObject = false
  private dragObjectId: string | null = null
  private dragSelectionIds: string[] = []
  private dragStart = { x: 0, y: 0 }
  private dragPropStart = { x: 0, y: 0 }
  private dragOpeningStart = { x: 0, y: 0 }
  private dragPolygonStart: Vec2[] = []
  private dragWallStart = {
    a: { x: 0, y: 0 },
    b: { x: 0, y: 0 },
  }
  private dragPropStarts = new Map<string, Vec2>()
  private dragOpeningStarts = new Map<string, Vec2>()
  private dragPolygonStarts = new Map<string, Vec2[]>()
  private dragWallStarts = new Map<string, { a: Vec2; b: Vec2 }>()
  private dragReferenceStarts = new Map<string, Vec2>()

  private isDrawingWall = false
  private drawStart = { worldX: 0, worldY: 0 }
  private pointerScreen = { x: 0, y: 0 }

  private isAreaSelecting = false
  private areaStartScreen = { x: 0, y: 0 }
  private areaCurrentScreen = { x: 0, y: 0 }
  private areaStartWorld: Vec2 = { x: 0, y: 0 }
  private areaSelectionBase: string[] = []
  private areaSelectionAdds = false
  private pendingSingleSelectionId: string | null = null

  private constructor(app: PIXI.Application, options: PixiRendererOptions = {}) {
    this.app = app
    this.options = options

    this.rulerLayer = new PIXI.Graphics()
    this.rulerTextContainer = new PIXI.Container()
    this.gridLayer = new PIXI.Graphics()
    this.referenceImageLayer = new PIXI.Container()
    this.roomLayer = new PIXI.Graphics()
    this.objectLayer = new PIXI.Container()
    this.overlayLayer = new PIXI.Graphics()
    this.previewLayer = new PIXI.Graphics()

    this.app.stage.addChild(this.gridLayer)
    this.app.stage.addChild(this.referenceImageLayer)
    this.app.stage.addChild(this.roomLayer)
    this.app.stage.addChild(this.objectLayer)
    this.app.stage.addChild(this.overlayLayer)
    this.app.stage.addChild(this.previewLayer)
    this.app.stage.addChild(this.rulerLayer)
    this.app.stage.addChild(this.rulerTextContainer)

    this.bindEvents()
    this.unsub = useEditorStore.subscribe(() => this.render())
    this.render()
  }

  static async create(container: HTMLElement, options: PixiRendererOptions = {}): Promise<PixiRenderer> {
    const app = new PIXI.Application()
    await app.init({
      resizeTo: container,
      background: COLORS.bg,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    app.canvas.style.cssText = "display:block;width:100%;height:100%;cursor:crosshair"
    container.appendChild(app.canvas)
    return new PixiRenderer(app, options)
  }

  private screenToWorld(sx: number, sy: number) {
    const { zoom, cameraX, cameraY } = useEditorStore.getState()
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2
    return {
      x: (sx - cx) / (zoom * PPU) - cameraX,
      y: (sy - cy) / (zoom * PPU) - cameraY,
    }
  }

  private getToScreen() {
    const { zoom, cameraX, cameraY } = useEditorStore.getState()
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2

    return (wx: number, wy: number) => ({
      x: (wx + cameraX) * zoom * PPU + cx,
      y: (wy + cameraY) * zoom * PPU + cy,
    })
  }

  private snapToGrid(value: number) {
    const snap = useEditorStore.getState().snapSize
    return Math.round(value / snap) * snap
  }

  private drawQuad(
    graphics: PIXI.Graphics,
    points: Vec2[],
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    fillColor: number,
    strokeColor: number,
    fillAlpha = 0.88,
    strokeWidth = 1,
    strokeAlpha = 0.9
  ) {
    const screenPoints = points.map(point => toScreen(point.x, point.y))
    graphics.moveTo(screenPoints[0].x, screenPoints[0].y)
    for (const point of screenPoints.slice(1)) {
      graphics.lineTo(point.x, point.y)
    }
    graphics.closePath()
    graphics.fill({ color: fillColor, alpha: fillAlpha })
    graphics.stroke({ color: strokeColor, width: strokeWidth, alpha: strokeAlpha })
  }

  private bindEvents() {
    const canvas = this.app.canvas
    canvas.addEventListener("wheel", this.onWheel, { passive: false })
    canvas.addEventListener("mousedown", this.onMouseDown)
    canvas.addEventListener("mousemove", this.onMouseMove)
    canvas.addEventListener("mouseup", this.onMouseUp)
    canvas.addEventListener("mouseleave", this.onMouseLeave)
    canvas.addEventListener("contextmenu", this.onContextMenu)
  }

  private onContextMenu = (event: MouseEvent) => {
    event.preventDefault()
    const rect = this.app.canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const store = useEditorStore.getState()
    const hit = this.hitTest(sx, sy)

    if (hit && !store.selection.includes(hit)) {
      store.setSelection([...store.selection, hit])
    }

    this.options.onContextMenu?.({
      x: event.clientX,
      y: event.clientY,
      targetId: hit,
    })
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const store = useEditorStore.getState()

    if (store.activeTool === "wall") {
      const deltaStep = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 100 : 3
      const thicknessDelta = Math.max(1, Math.round(Math.abs(event.deltaY) / deltaStep))
      const direction = event.deltaY < 0 ? 1 : -1
      store.setWallToolThickness(store.wallToolThickness + direction * thicknessDelta)

      if (this.isDrawingWall) {
        const world = this.screenToWorld(this.pointerScreen.x, this.pointerScreen.y)
        const wx = this.snapToGrid(world.x)
        const wy = this.snapToGrid(world.y)
        this.renderWallPreview(this.drawStart.worldX, this.drawStart.worldY, wx, wy)
      }
      return
    }

    const factor = event.deltaY < 0 ? 1.1 : 0.909
    const newZoom = Math.min(10, Math.max(0.1, store.zoom * factor))

    const rect = this.app.canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2

    const wx = (sx - cx) / (store.zoom * PPU) - store.cameraX
    const wy = (sy - cy) / (store.zoom * PPU) - store.cameraY

    const newCamX = (sx - cx) / (newZoom * PPU) - wx
    const newCamY = (sy - cy) / (newZoom * PPU) - wy

    store.setZoom(newZoom)
    store.setCamera(newCamX, newCamY)
  }

  private onMouseDown = (event: MouseEvent) => {
    const rect = this.app.canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    this.pointerScreen = { x: sx, y: sy }
    const store = useEditorStore.getState()

    if (event.button === 1) {
      event.preventDefault()
      this.isPanning = true
      this.panStart = { x: sx, y: sy }
      this.cameraPanStart = { x: store.cameraX, y: store.cameraY }
      return
    }

    if (event.button !== 0) return

    const tool = store.activeTool
    const world = this.screenToWorld(sx, sy)

    if (tool === "select") {
      this.previewLayer.clear()
      const hit = this.hitTest(sx, sy)
      if (!hit) {
        const addToSelection = event.shiftKey
        this.isAreaSelecting = true
        this.areaStartScreen = { x: sx, y: sy }
        this.areaCurrentScreen = { x: sx, y: sy }
        this.areaStartWorld = world
        this.areaSelectionBase = addToSelection ? store.selection : []
        this.areaSelectionAdds = addToSelection
        if (!addToSelection) store.setSelection([])
        return
      }

      if (event.shiftKey) {
        store.toggleSelection(hit)
        return
      }

      const wasSelected = store.selection.includes(hit)
      const dragSelectionIds = wasSelected ? store.selection : [hit]
      this.isDraggingObject = true
      this.dragObjectId = hit
      this.dragSelectionIds = dragSelectionIds
      this.dragStart = { x: sx, y: sy }
      this.pendingSingleSelectionId = hit
      if (!wasSelected) store.setSelection([hit])
      this.captureDragStarts(dragSelectionIds)

      const object = getObject(store.document, hit)
      if (!object) return

      if (object.kind === "prop") {
        this.dragPropStart = { x: object.x, y: object.y }
        return
      }

      if (object.kind === "door" || object.kind === "window") {
        this.dragOpeningStart = { ...object.position }
        return
      }

      if (object.kind === "wall") {
        this.dragWallStart = {
          a: { ...object.a },
          b: { ...object.b },
        }
        return
      }

      if (object.kind === "polygonWall") {
        this.dragPolygonStart = object.vertices.map(vertex => ({ ...vertex }))
      }
      return
    }

    if (tool === "wall") {
      const wx = this.snapToGrid(world.x)
      const wy = this.snapToGrid(world.y)
      this.isDrawingWall = true
      this.drawStart = { worldX: wx, worldY: wy }
      return
    }

    if (tool === "door" || tool === "window") {
      const preview = this.getOpeningPreview(world, tool)
      if (!preview) return

      const id = tool === "door"
        ? store.addDoor({
          position: preview.position,
          rotation: preview.rotation,
          width: preview.width,
          depth: preview.depth,
        })
        : store.addWindow({
          position: preview.position,
          rotation: preview.rotation,
          width: preview.width,
          depth: preview.depth,
        })

      if (id) store.setSelection([id])
    }
  }

  private onMouseMove = (event: MouseEvent) => {
    const rect = this.app.canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    this.pointerScreen = { x: sx, y: sy }
    const world = this.screenToWorld(sx, sy)
    const store = useEditorStore.getState()

    store.setMouse(Math.round(world.x), Math.round(world.y))

    if (this.isPanning) {
      const dx = (sx - this.panStart.x) / (store.zoom * PPU)
      const dy = (sy - this.panStart.y) / (store.zoom * PPU)
      store.setCamera(this.cameraPanStart.x + dx, this.cameraPanStart.y + dy)
      return
    }

    if (this.isDraggingObject && this.dragObjectId) {
      this.handleObjectDrag(sx, sy)
      return
    }

    if (this.isDrawingWall) {
      const wx = this.snapToGrid(world.x)
      const wy = this.snapToGrid(world.y)
      this.renderWallPreview(this.drawStart.worldX, this.drawStart.worldY, wx, wy)
      return
    }

    if (this.isAreaSelecting) {
      this.areaCurrentScreen = { x: sx, y: sy }
      this.renderAreaSelectionPreview()
      return
    }

    if (store.activeTool === "door" || store.activeTool === "window") {
      this.renderOpeningPreview(world, store.activeTool)
      return
    }

    this.previewLayer.clear()
  }

  private onMouseUp = (event: MouseEvent) => {
    if (event.button === 1) {
      this.isPanning = false
      return
    }

    if (event.button !== 0) return

    if (this.isDraggingObject) {
      this.finalizeObjectSelection(event)
      this.isDraggingObject = false
      this.dragObjectId = null
      this.dragSelectionIds = []
      this.pendingSingleSelectionId = null
    }

    if (this.isAreaSelecting) {
      this.isAreaSelecting = false
      this.previewLayer.clear()
      this.finalizeAreaSelection(event)
      return
    }

    if (!this.isDrawingWall) return

    const rect = this.app.canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const world = this.screenToWorld(sx, sy)
    const wx = this.snapToGrid(world.x)
    const wy = this.snapToGrid(world.y)

    this.isDrawingWall = false
    this.previewLayer.clear()
    this.finalizeWall(this.drawStart.worldX, this.drawStart.worldY, wx, wy)
  }

  private onMouseLeave = () => {
    if (!this.isDrawingWall && !this.isDraggingObject && !this.isAreaSelecting) {
      this.previewLayer.clear()
    }
  }

  private finalizeAreaSelection(event: MouseEvent) {
    const rect = this.app.canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const dx = sx - this.areaStartScreen.x
    const dy = sy - this.areaStartScreen.y
    const dragDistance = Math.hypot(dx, dy)
    const store = useEditorStore.getState()

    if (dragDistance < 4) {
      return
    }

    const endWorld = this.screenToWorld(sx, sy)
    const areaIds = this.getObjectsInBounds(this.boundsFromPoints(this.areaStartWorld, endWorld))
    const nextSelection = this.areaSelectionAdds
      ? [...this.areaSelectionBase, ...areaIds.filter(id => !this.areaSelectionBase.includes(id))]
      : areaIds
    store.setSelection(nextSelection)
  }

  private finalizeObjectSelection(event: MouseEvent) {
    if (!this.pendingSingleSelectionId) return

    const rect = this.app.canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const dragDistance = Math.hypot(sx - this.dragStart.x, sy - this.dragStart.y)
    if (dragDistance >= 4) return

    useEditorStore.getState().setSelection([this.pendingSingleSelectionId])
  }

  private renderAreaSelectionPreview() {
    this.previewLayer.clear()
    const x = Math.min(this.areaStartScreen.x, this.areaCurrentScreen.x)
    const y = Math.min(this.areaStartScreen.y, this.areaCurrentScreen.y)
    const width = Math.abs(this.areaCurrentScreen.x - this.areaStartScreen.x)
    const height = Math.abs(this.areaCurrentScreen.y - this.areaStartScreen.y)

    this.previewLayer.rect(x, y, width, height)
    this.previewLayer.fill({ color: COLORS.selection, alpha: 0.08 })
    this.previewLayer.stroke({ color: COLORS.selection, width: 1.25, alpha: 0.95 })
  }

  private captureDragStarts(ids: string[]) {
    const { document } = useEditorStore.getState()
    this.dragPropStarts.clear()
    this.dragOpeningStarts.clear()
    this.dragPolygonStarts.clear()
    this.dragWallStarts.clear()
    this.dragReferenceStarts.clear()

    for (const id of ids) {
      const object = getObject(document, id)
      if (!object) continue

      if (object.kind === "prop") {
        this.dragPropStarts.set(object.id, { x: object.x, y: object.y })
      } else if (object.kind === "door" || object.kind === "window") {
        this.dragOpeningStarts.set(object.id, { ...object.position })
      } else if (object.kind === "wall") {
        this.dragWallStarts.set(object.id, {
          a: { ...object.a },
          b: { ...object.b },
        })
      } else if (object.kind === "polygonWall") {
        this.dragPolygonStarts.set(object.id, object.vertices.map(vertex => ({ ...vertex })))
      } else if (object.kind === "referenceImage") {
        this.dragReferenceStarts.set(object.id, { x: object.x, y: object.y })
      }
    }
  }

  private handleObjectDrag(sx: number, sy: number) {
    const store = useEditorStore.getState()
    if (!this.dragObjectId) return

    const object = getObject(store.document, this.dragObjectId)
    if (!object) return

    const dx = (sx - this.dragStart.x) / (store.zoom * PPU)
    const dy = (sy - this.dragStart.y) / (store.zoom * PPU)
    const ids = this.dragSelectionIds.length ? this.dragSelectionIds : [this.dragObjectId]

    if (ids.length > 1) {
      const tx = this.snapToGrid(dx)
      const ty = this.snapToGrid(dy)

      for (const id of ids) {
        const propStart = this.dragPropStarts.get(id)
        if (propStart) {
          store.updateObject(id, {
            x: this.snapToGrid(propStart.x + dx),
            y: this.snapToGrid(propStart.y + dy),
          })
          continue
        }

        const openingStart = this.dragOpeningStarts.get(id)
        if (openingStart) {
          store.updateObject(id, {
            position: {
              x: this.snapToGrid(openingStart.x + dx),
              y: this.snapToGrid(openingStart.y + dy),
            },
          })
          continue
        }

        const wallStart = this.dragWallStarts.get(id)
        if (wallStart) {
          store.updateObject(id, {
            a: {
              x: wallStart.a.x + tx,
              y: wallStart.a.y + ty,
            },
            b: {
              x: wallStart.b.x + tx,
              y: wallStart.b.y + ty,
            },
          })
          continue
        }

        const polygonStart = this.dragPolygonStarts.get(id)
        if (polygonStart) {
          const polygon = getObject(store.document, id)
          if (polygon?.kind === "polygonWall" && !isLinkedPolygonWall(store.document, id)) {
            store.updateObject(id, { vertices: translatePolygon(polygonStart, tx, ty) })
          }
          continue
        }

        const referenceStart = this.dragReferenceStarts.get(id)
        if (referenceStart) {
          store.updateObject(id, {
            x: this.snapToGrid(referenceStart.x + dx),
            y: this.snapToGrid(referenceStart.y + dy),
          })
        }
      }
      return
    }

    if (object.kind === "prop") {
      const nx = this.snapToGrid(this.dragPropStart.x + dx)
      const ny = this.snapToGrid(this.dragPropStart.y + dy)
      store.updateObject(object.id, { x: nx, y: ny })
      return
    }

    if (object.kind === "wall") {
      const tx = this.snapToGrid(dx)
      const ty = this.snapToGrid(dy)
      store.updateObject(object.id, {
        a: {
          x: this.dragWallStart.a.x + tx,
          y: this.dragWallStart.a.y + ty,
        },
        b: {
          x: this.dragWallStart.b.x + tx,
          y: this.dragWallStart.b.y + ty,
        },
      })
      return
    }

    if (object.kind === "polygonWall") {
      if (isLinkedPolygonWall(store.document, object.id)) return
      const tx = this.snapToGrid(dx)
      const ty = this.snapToGrid(dy)
      store.updateObject(object.id, { vertices: translatePolygon(this.dragPolygonStart, tx, ty) })
      return
    }

    if (object.kind === "door" || object.kind === "window") {
      const nx = this.snapToGrid(this.dragOpeningStart.x + dx)
      const ny = this.snapToGrid(this.dragOpeningStart.y + dy)
      store.updateObject(object.id, { position: { x: nx, y: ny } })
      return
    }

    if (object.kind === "referenceImage") {
      const nx = this.snapToGrid((this.dragReferenceStarts.get(object.id)?.x ?? object.x) + dx)
      const ny = this.snapToGrid((this.dragReferenceStarts.get(object.id)?.y ?? object.y) + dy)
      store.updateObject(object.id, { x: nx, y: ny })
    }
  }

  private finalizeWall(x1: number, y1: number, x2: number, y2: number) {
    const store = useEditorStore.getState()
    const length = Math.hypot(x2 - x1, y2 - y1)
    if (length < store.snapSize) return

    const id = store.addWall({
      a: { x: x1, y: y1 },
      b: { x: x2, y: y2 },
      thickness: store.wallToolThickness,
    })
    store.setSelection([id])
  }

  private renderWallPreview(x1: number, y1: number, x2: number, y2: number) {
    this.previewLayer.clear()
    if (x1 === x2 && y1 === y2) return

    const { wallToolThickness } = useEditorStore.getState()
    const wall: Wall = {
      id: "preview",
      kind: "wall",
      a: { x: x1, y: y1 },
      b: { x: x2, y: y2 },
      thickness: wallToolThickness,
      polygonWallId: "preview-polygon",
    }
    const toScreen = this.getToScreen()
    this.drawQuad(
      this.previewLayer,
      getWallQuad(wall),
      toScreen,
      COLORS.wall,
      COLORS.selection,
      0.28,
      1.25,
      0.9
    )
  }

  private getOpeningPreview(point: Vec2, kind: WallOpeningKind): OpeningPreview | null {
    const { wallToolThickness } = useEditorStore.getState()
    const width = getOpeningDefaultWidth(kind)

    return {
      kind,
      width,
      depth: wallToolThickness,
      position: { x: this.snapToGrid(point.x), y: this.snapToGrid(point.y) },
      rotation: 0,
    }
  }

  private renderOpeningPreview(point: Vec2, kind: WallOpeningKind) {
    this.previewLayer.clear()
    const preview = this.getOpeningPreview(point, kind)
    if (!preview) return

    const toScreen = this.getToScreen()
    const previewOpening: Opening = {
      id: "preview",
      kind,
      position: preview.position,
      rotation: preview.rotation,
      width: preview.width,
      depth: preview.depth,
    }
    const color = kind === "door" ? COLORS.doorFill : COLORS.windowFill

    this.drawQuad(
      this.previewLayer,
      getRotatedRect(previewOpening.position, previewOpening.width, previewOpening.depth, previewOpening.rotation),
      toScreen,
      color,
      COLORS.selection,
      0.45,
      1.5,
      0.9
    )
  }

  private hitTest(sx: number, sy: number): string | null {
    const store = useEditorStore.getState()
    const point = this.screenToWorld(sx, sy)
    const hitPadding = Math.max(1.5, 8 / (store.zoom * PPU))
    const propRadius = Math.max(2, 10 / (store.zoom * PPU))

    for (const prop of [...store.document.props].reverse()) {
      if (Math.hypot(point.x - prop.x, point.y - prop.y) <= propRadius) {
        return prop.id
      }
    }

    // Reference images (behind objects, check after props)
    for (const img of [...store.document.referenceImages].reverse()) {
      if (this.pointHitsReferenceImage(point, img)) {
        return img.id
      }
    }

    for (const opening of [...store.document.openings].reverse()) {
      if (this.pointHitsOpening(point, opening, hitPadding)) {
        return opening.id
      }
    }

    for (const wall of [...store.document.walls].reverse()) {
      if (this.pointHitsWall(point, wall, hitPadding)) {
        return wall.id
      }
    }

    for (const polygonWall of [...store.document.polygonWalls].reverse()) {
      if (isLinkedPolygonWall(store.document, polygonWall.id)) continue
      if (pointInPolygon(point, getPolygonWallWorldVertices(polygonWall))) {
        return polygonWall.id
      }
    }

    return null
  }

  private pointHitsOpening(point: Vec2, opening: Opening, padding: number) {
    const expanded = getRotatedRect(opening.position, opening.width + padding * 2, opening.depth + padding * 2, opening.rotation)
    return pointInPolygon(point, expanded)
  }

  private pointHitsWall(point: Vec2, wall: Wall, padding: number) {
    return pointInPolygon(point, getWallQuad(wall, 0, wallLength(wall), wall.thickness + padding * 2))
  }

  private pointHitsReferenceImage(point: Vec2, img: ReferenceImage): boolean {
    const dx = point.x - img.x
    const dy = point.y - img.y
    const rad = (-img.rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const localX = dx * cos - dy * sin
    const localY = dx * sin + dy * cos
    const halfW = img.width / 2
    const halfH = img.height / 2
    return localX >= -halfW && localX <= halfW && localY >= -halfH && localY <= halfH
  }

  private getObjectsInBounds(bounds: Bounds) {
    const { document } = useEditorStore.getState()
    const selected: string[] = []

    for (const wall of document.walls) {
      if (this.polygonIntersectsBounds(getWallQuad(wall), bounds)) selected.push(wall.id)
    }

    for (const polygonWall of document.polygonWalls) {
      if (isLinkedPolygonWall(document, polygonWall.id)) continue
      if (this.polygonIntersectsBounds(getPolygonWallWorldVertices(polygonWall), bounds)) selected.push(polygonWall.id)
    }

    for (const opening of document.openings) {
      const vertices = getRotatedRect(opening.position, opening.width, opening.depth, opening.rotation)
      if (this.polygonIntersectsBounds(vertices, bounds)) selected.push(opening.id)
    }

    for (const prop of document.props) {
      if (this.pointInBounds({ x: prop.x, y: prop.y }, bounds)) selected.push(prop.id)
    }

    for (const img of document.referenceImages) {
      if (this.polygonIntersectsBounds(this.getReferenceImageWorldCorners(img), bounds)) selected.push(img.id)
    }

    return selected
  }

  private boundsFromPoints(a: Vec2, b: Vec2): Bounds {
    return {
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
    }
  }

  private pointInBounds(point: Vec2, bounds: Bounds) {
    return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY
  }

  private polygonIntersectsBounds(vertices: Vec2[], bounds: Bounds) {
    if (!vertices.length) return false
    if (vertices.some(vertex => this.pointInBounds(vertex, bounds))) return true

    const corners = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
    ]

    if (corners.some(corner => pointInPolygon(corner, vertices))) return true

    const rectEdges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]] as const)
    const polygonEdges = vertices.map((vertex, index) => [vertex, vertices[(index + 1) % vertices.length]] as const)

    return polygonEdges.some(([a, b]) =>
      rectEdges.some(([c, d]) => this.segmentsIntersect(a, b, c, d))
    )
  }

  private segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
    const direction = (p: Vec2, q: Vec2, r: Vec2) =>
      (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
    const onSegment = (p: Vec2, q: Vec2, r: Vec2) =>
      Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) &&
      Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y)

    const d1 = direction(a, b, c)
    const d2 = direction(a, b, d)
    const d3 = direction(c, d, a)
    const d4 = direction(c, d, b)

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true
    }

    const epsilon = 0.000001
    return (Math.abs(d1) < epsilon && onSegment(a, c, b)) ||
      (Math.abs(d2) < epsilon && onSegment(a, d, b)) ||
      (Math.abs(d3) < epsilon && onSegment(c, a, d)) ||
      (Math.abs(d4) < epsilon && onSegment(c, b, d))
  }

  private getReferenceImageWorldCorners(img: ReferenceImage) {
    const rad = (img.rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const hw = img.width / 2
    const hh = img.height / 2

    return [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ].map(local => ({
      x: local.x * cos - local.y * sin + img.x,
      y: local.x * sin + local.y * cos + img.y,
    }))
  }

  render() {
    const store = useEditorStore.getState()
    const { zoom, cameraX, cameraY, document, selection, gridVisible } = store

    const width = this.app.screen.width
    const height = this.app.screen.height
    const cx = width / 2
    const cy = height / 2

    const toScreen = (wx: number, wy: number) => ({
      x: (wx + cameraX) * zoom * PPU + cx,
      y: (wy + cameraY) * zoom * PPU + cy,
    })

    const gridSteps = getGridSteps(zoom)

    if (gridVisible) {
      this.renderGrid(width, height, cx, cy, zoom, cameraX, cameraY, gridSteps)
    } else {
      this.gridLayer.clear()
    }
    this.renderReferenceImages(document, selection, toScreen, zoom)
    this.renderRoom(toScreen, store.roomWidth, store.roomHeight)
    this.renderObjects(document, selection, toScreen, zoom)
    this.renderRulers(width, height, cx, cy, zoom, cameraX, cameraY, gridSteps)
  }

  private renderGrid(
    width: number,
    height: number,
    cx: number,
    cy: number,
    zoom: number,
    camX: number,
    camY: number,
    { thin, medium, strong }: ReturnType<typeof getGridSteps>
  ) {
    const graphics = this.gridLayer
    graphics.clear()

    const toScreen = (wx: number, wy: number) => ({
      x: (wx + camX) * zoom * PPU + cx,
      y: (wy + camY) * zoom * PPU + cy,
    })

    const worldLeft = (-cx / (zoom * PPU)) - camX - strong
    const worldTop = (-cy / (zoom * PPU)) - camY - strong
    const worldRight = (width - cx) / (zoom * PPU) - camX + strong
    const worldBottom = (height - cy) / (zoom * PPU) - camY + strong

    const drawGridLines = (
      step: number,
      color: number,
      alpha: number,
      lineWidth: number,
      predicate: (value: number) => boolean = () => true
    ) => {
      const startX = Math.floor(worldLeft / step) * step
      const startY = Math.floor(worldTop / step) * step

      for (let wx = startX; wx <= worldRight; wx += step) {
        if (!predicate(wx)) continue
        const isOrigin = Math.abs(wx) < 0.01
        const start = toScreen(wx, worldTop)
        const end = toScreen(wx, worldBottom)
        graphics.moveTo(start.x, start.y)
        graphics.lineTo(end.x, end.y)
        graphics.stroke({
          color: isOrigin && step === strong ? COLORS.gridOriginX : color,
          width: isOrigin && step === strong ? lineWidth + 0.5 : lineWidth,
          alpha,
        })
      }

      for (let wy = startY; wy <= worldBottom; wy += step) {
        if (!predicate(wy)) continue
        const isOrigin = Math.abs(wy) < 0.01
        const start = toScreen(worldLeft, wy)
        const end = toScreen(worldRight, wy)
        graphics.moveTo(start.x, start.y)
        graphics.lineTo(end.x, end.y)
        graphics.stroke({
          color: isOrigin && step === strong ? COLORS.gridOriginY : color,
          width: isOrigin && step === strong ? lineWidth + 0.5 : lineWidth,
          alpha,
        })
      }
    }

    // Fine grid: only when zoomed in enough, skip lines shared with medium tier
    if (zoom * PPU >= 4) {
      drawGridLines(
        thin,
        COLORS.gridThin,
        0.6,
        1,
        value => Math.abs(value % medium) > 0.001
      )
    }

    // Medium grid: skip lines shared with strong tier
    drawGridLines(
      medium,
      COLORS.gridMedium,
      0.75,
      1,
      value => Math.abs(value % strong) > 0.001
    )
    drawGridLines(strong, COLORS.gridStrong, 0.95, 1.1)
  }

  private renderRoom(
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    roomWidth: number,
    roomHeight: number
  ) {
    const graphics = this.roomLayer
    graphics.clear()

    const halfW = roomWidth / 2
    const halfH = roomHeight / 2
    const topLeft = toScreen(-halfW, -halfH)
    const bottomRight = toScreen(halfW, halfH)

    graphics.rect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y
    )
    graphics.fill({ color: COLORS.roomFill, alpha: 0.4 })
    graphics.stroke({ color: COLORS.roomBorder, width: 1.5, alpha: 0.6 })
  }

  private renderObjects(
    document: MapDocument,
    selection: string[],
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    zoom: number
  ) {
    const staleChildren = this.objectLayer.removeChildren()
    for (const child of staleChildren) child.destroy()
    this.overlayLayer.clear()

    const selected = new Set(selection)

    for (const polygonWall of document.polygonWalls) {
      const graphics = new PIXI.Graphics()
      const vertices = getPolygonWallWorldVertices(polygonWall)

      this.drawQuad(
        graphics,
        vertices,
        toScreen,
        COLORS.wallFill,
        COLORS.wall
      )

      const linkedWall = document.walls.find(wall => wall.polygonWallId === polygonWall.id)
      if (selected.has(polygonWall.id) || (linkedWall && selected.has(linkedWall.id))) {
        this.drawQuad(
          graphics,
          vertices,
          toScreen,
          COLORS.selection,
          COLORS.selection,
          0.08,
          1.8,
          1
        )
      }

      this.objectLayer.addChild(graphics)
    }

    for (const wall of document.walls) {
      if (!selected.has(wall.id)) continue

      const graphics = new PIXI.Graphics()
      this.drawQuad(
        graphics,
        getWallQuad(wall),
        toScreen,
        COLORS.selection,
        COLORS.selection,
        0.08,
        1.8,
        1
      )
      this.objectLayer.addChild(graphics)
    }

    for (const opening of document.openings) {
      const openingGraphics = new PIXI.Graphics()
      const fillColor = opening.kind === "door" ? COLORS.doorFill : COLORS.windowFill
      const strokeColor = opening.kind === "door" ? COLORS.door : COLORS.window

      this.drawQuad(
        openingGraphics,
        getRotatedRect(opening.position, opening.width, opening.depth, opening.rotation),
        toScreen,
        fillColor,
        strokeColor,
        0.38,
        1.1,
        0.95
      )

      if (selected.has(opening.id)) {
        this.drawQuad(
          openingGraphics,
          getRotatedRect(opening.position, opening.width + 1.5, opening.depth + 1.5, opening.rotation),
          toScreen,
          COLORS.selection,
          COLORS.selection,
          0.08,
          1.7,
          1
        )
      }

      this.objectLayer.addChild(openingGraphics)
    }

    for (const prop of document.props) {
      this.renderProp(prop.x, prop.y, prop.assetId, selected.has(prop.id), toScreen, zoom)
    }

    for (const selectedId of selection) {
      const object = getObject(document, selectedId)
      if (!object) continue

      if (object.kind === "wall") {
        this.renderWallSelection(object, toScreen, zoom, selection.length === 1)
      } else if (object.kind === "polygonWall") {
        this.renderPolygonWallSelection(object, toScreen, zoom, selection.length === 1)
      } else if (object.kind === "door" || object.kind === "window") {
        this.renderOpeningSelection(object, toScreen, zoom, selection.length === 1)
      }
    }
  }

  private renderReferenceImages(
    document: MapDocument,
    selection: string[],
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    zoom: number
  ) {
    const selected = new Set(selection)
    const currentIds = new Set(document.referenceImages.map(img => img.id))

    // Remove containers for deleted images
    for (const [id, container] of this.referenceContainers) {
      if (!currentIds.has(id)) {
        this.referenceImageLayer.removeChild(container)
        container.destroy(true)
        this.referenceContainers.delete(id)
        this.referenceSrcs.delete(id)
        this.refChildren.delete(id)
      }
    }

    for (const img of document.referenceImages) {
      let container = this.referenceContainers.get(img.id)
      let children = this.refChildren.get(img.id)

      if (!container) {
        container = new PIXI.Container()
        container.eventMode = "none"

        const gfx = new PIXI.Graphics()
        container.addChild(gfx)

        children = { gfx, sprite: null }
        this.referenceContainers.set(img.id, container)
        this.refChildren.set(img.id, children)
        this.referenceSrcs.set(img.id, img.src)
        this.referenceImageLayer.addChild(container)

        // Kick off async texture load
        this.loadReferenceTexture(img, container, children, zoom)
      } else if (children) {
        const oldSrc = this.referenceSrcs.get(img.id)
        if (oldSrc !== img.src) {
          // Source changed — reload
          if (children.sprite) {
            container.removeChild(children.sprite)
            children.sprite.destroy(true)
            children.sprite = null
          }
          this.referenceSrcs.set(img.id, img.src)
          this.loadReferenceTexture(img, container, children, zoom)
        }
      }

      if (!children) continue

      const screen = toScreen(img.x, img.y)
      container.position.set(screen.x, screen.y)
      container.angle = img.rotation
      container.visible = img.opacity > 0

      // Re-size sprite every frame (zoom may have changed)
      if (children.sprite) {
        const nw = img.naturalWidth
        const nh = img.naturalHeight
        if (nw > 0 && nh > 0) {
          children.sprite.scale.set(
            (img.width * zoom * PPU) / nw,
            (img.height * zoom * PPU) / nh,
          )
        }
        children.sprite.alpha = img.opacity
      }

      // Border + crosshair (always visible, independent of texture load)
      const dw = img.width * zoom * PPU
      const dh = img.height * zoom * PPU
      const gfx = children.gfx
      gfx.clear()
      const hw = dw / 2
      const hh = dh / 2

      gfx.rect(-hw, -hh, hw * 2, hh * 2)
      gfx.stroke({ color: 0xc8a840, width: 1.5, alpha: 0.7 })

      const cs = Math.min(16, Math.min(hw, hh) * 0.3)
      gfx.moveTo(-cs, 0)
      gfx.lineTo(cs, 0)
      gfx.moveTo(0, -cs)
      gfx.lineTo(0, cs)
      gfx.stroke({ color: 0xc8a840, width: 1, alpha: 0.4 })

      // Selection highlight on overlay layer
      if (selected.has(img.id)) {
        this.renderReferenceImageOutline(img, toScreen)
      }
    }
  }

  private loadReferenceTexture(
    img: ReferenceImage,
    container: PIXI.Container,
    children: { gfx: PIXI.Graphics; sprite: PIXI.Sprite | null },
    zoom: number,
  ) {
    const nw = img.naturalWidth
    const nh = img.naturalHeight

    // Use a native HTMLImageElement instead of PIXI.Assets.load().
    // blob: URLs and data: URLs are handled reliably by the browser's
    // native image decoder; PIXI.Assets has issues with some URL schemes.
    const htmlImg = new Image()
    htmlImg.onload = () => {
      // Image might have been deleted while loading
      if (!this.referenceContainers.has(img.id)) return

      // Texture.from(HTMLImageElement) is synchronous when the element is
      // already loaded — the texture will be valid immediately.
      const texture = PIXI.Texture.from(htmlImg)
      const sprite = new PIXI.Sprite(texture)
      sprite.anchor.set(0.5)
      if (nw > 0 && nh > 0) {
        sprite.scale.set(
          (img.width * zoom * PPU) / nw,
          (img.height * zoom * PPU) / nh,
        )
      }
      sprite.alpha = img.opacity

      // Replace any existing sprite
      if (children.sprite) {
        container.removeChild(children.sprite)
        children.sprite.destroy(true)
      }
      container.addChildAt(sprite, 0) // below the border graphics
      children.sprite = sprite
    }
    htmlImg.onerror = () => {
      console.error('[ReferenceImage] Failed to load:', img.src.slice(0, 80))
    }
    htmlImg.src = img.src
  }

  private renderReferenceImageOutline(
    img: ReferenceImage,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
  ) {
    const g = this.overlayLayer
    const rad = (img.rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const hw = img.width / 2
    const hh = img.height / 2

    const corners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ].map(local => {
      const rx = local.x * cos - local.y * sin + img.x
      const ry = local.x * sin + local.y * cos + img.y
      return toScreen(rx, ry)
    })

    g.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < corners.length; i++) {
      g.lineTo(corners[i].x, corners[i].y)
    }
    g.closePath()
    g.stroke({ color: COLORS.selection, width: 2, alpha: 1 })
  }

  private renderProp(
    x: number,
    y: number,
    assetId: string,
    selected: boolean,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    zoom: number
  ) {
    const graphics = new PIXI.Graphics()
    const screen = toScreen(x, y)
    const radius = Math.max(7, 13 * zoom)

    graphics.circle(screen.x, screen.y, radius)
    graphics.fill({ color: COLORS.propFill, alpha: 0.88 })
    graphics.stroke({ color: COLORS.prop, width: 1, alpha: 0.9 })

    if (selected) {
      graphics.circle(screen.x, screen.y, radius + 2)
      graphics.stroke({ color: COLORS.selection, width: 1.5, alpha: 1 })
    }

    const label = new PIXI.Text({
      text: assetId,
      style: { fontSize: Math.max(10, 11 * zoom), fill: 0xc8cdd4, fontFamily: "system-ui" },
    })
    label.x = screen.x - label.width / 2
    label.y = screen.y + radius + 2

    this.objectLayer.addChild(graphics)
    this.objectLayer.addChild(label)
  }

  private renderWallSelection(
    wall: Wall,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    zoom: number,
    showLabel: boolean
  ) {
    const graphics = this.overlayLayer
    const start = toScreen(wall.a.x, wall.a.y)
    const end = toScreen(wall.b.x, wall.b.y)
    const outline = getWallQuad(wall).map(point => toScreen(point.x, point.y))
    const normal = wallNormal(wall)
    const midpoint = wallLocalToWorld(wall, wallLength(wall) / 2, wall.thickness / 2 + 4)
    const midpointScreen = toScreen(midpoint.x, midpoint.y)
    const radius = 5

    graphics.moveTo(outline[0].x, outline[0].y)
    for (const point of outline.slice(1)) {
      graphics.lineTo(point.x, point.y)
    }
    graphics.closePath()
    graphics.stroke({ color: COLORS.selection, width: 2, alpha: 1 })

    graphics.moveTo(start.x, start.y)
    graphics.lineTo(end.x, end.y)
    graphics.stroke({ color: COLORS.selection, width: 1.2, alpha: 0.65 })

    for (const point of [start, end]) {
      graphics.circle(point.x, point.y, radius)
      graphics.fill({ color: COLORS.handleFill, alpha: 1 })
      graphics.stroke({ color: 0xffffff, width: 1, alpha: 0.6 })
    }

    if (!showLabel) return

    const label = new PIXI.Text({
      text: `${Math.round(wallLength(wall))}u · ${Math.round(wall.thickness)}u`,
      style: {
        fontSize: Math.max(10, Math.min(13, 11 * zoom)),
        fill: COLORS.dimLabel,
        fontFamily: "system-ui",
        fontWeight: "500",
      },
    })
    label.x = midpointScreen.x - label.width / 2 + normal.x
    label.y = midpointScreen.y - label.height / 2 + normal.y
    this.objectLayer.addChild(label)
  }

  private renderPolygonWallSelection(
    polygonWall: PolygonWall,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    zoom: number,
    showLabel: boolean
  ) {
    const graphics = this.overlayLayer
    const vertices = getPolygonWallWorldVertices(polygonWall)
    const points = vertices.map(vertex => toScreen(vertex.x, vertex.y))
    if (!points.length) return

    graphics.moveTo(points[0].x, points[0].y)
    for (const point of points.slice(1)) {
      graphics.lineTo(point.x, point.y)
    }
    graphics.closePath()
    graphics.stroke({ color: COLORS.selection, width: 2, alpha: 1 })

    for (const point of points) {
      graphics.circle(point.x, point.y, 4.5)
      graphics.fill({ color: COLORS.handleFill, alpha: 1 })
      graphics.stroke({ color: 0xffffff, width: 1, alpha: 0.6 })
    }

    if (!showLabel) return

    const centroid = polygonCentroid(vertices)
    const centroidScreen = toScreen(centroid.x, centroid.y)
    const label = new PIXI.Text({
      text: `${polygonWall.vertices.length} vertices`,
      style: {
        fontSize: Math.max(10, Math.min(13, 11 * zoom)),
        fill: COLORS.dimLabel,
        fontFamily: "system-ui",
        fontWeight: "500",
      },
    })
    label.x = centroidScreen.x - label.width / 2
    label.y = centroidScreen.y - label.height / 2
    this.objectLayer.addChild(label)
  }

  private renderOpeningSelection(
    opening: Opening,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    zoom: number,
    showLabel: boolean
  ) {
    const centerScreen = toScreen(opening.position.x, opening.position.y)
    const radius = 4.5
    const labelAnchor = {
      x: opening.position.x + opening.width / 2,
      y: opening.position.y - opening.depth / 2 - 5,
    }
    const labelScreen = toScreen(labelAnchor.x, labelAnchor.y)

    this.overlayLayer.circle(centerScreen.x, centerScreen.y, radius)
    this.overlayLayer.fill({ color: COLORS.selection, alpha: 1 })
    this.overlayLayer.stroke({ color: 0xffffff, width: 1, alpha: 0.6 })

    if (!showLabel) return

    const label = new PIXI.Text({
      text: `${Math.round(opening.width)}u x ${Math.round(opening.depth)}u`,
      style: {
        fontSize: Math.max(10, Math.min(13, 11 * zoom)),
        fill: COLORS.dimLabel,
        fontFamily: "system-ui",
        fontWeight: "500",
      },
    })
    label.x = labelScreen.x + 6
    label.y = labelScreen.y - label.height / 2
    this.objectLayer.addChild(label)
  }

  private renderRulers(
    width: number,
    height: number,
    cx: number,
    cy: number,
    zoom: number,
    camX: number,
    camY: number,
    { medium, strong }: ReturnType<typeof getGridSteps>
  ) {
    const graphics = this.rulerLayer
    graphics.clear()
    const staleText = this.rulerTextContainer.removeChildren()
    for (const child of staleText) child.destroy()

    const toScreen = (wx: number, wy: number) => ({
      x: (wx + camX) * zoom * PPU + cx,
      y: (wy + camY) * zoom * PPU + cy,
    })

    graphics.rect(RULER, 0, width - RULER, RULER)
    graphics.fill({ color: COLORS.rulerBg, alpha: 1 })

    graphics.rect(0, RULER, RULER, height - RULER)
    graphics.fill({ color: COLORS.rulerBg, alpha: 1 })

    graphics.rect(0, 0, RULER, RULER)
    graphics.fill({ color: COLORS.rulerCorner, alpha: 1 })

    graphics.moveTo(RULER, RULER)
    graphics.lineTo(width, RULER)
    graphics.stroke({ color: COLORS.rulerTick, width: 0.5, alpha: 0.5 })

    graphics.moveTo(RULER, RULER)
    graphics.lineTo(RULER, height)
    graphics.stroke({ color: COLORS.rulerTick, width: 0.5, alpha: 0.5 })

    const pixelsPerUnit = zoom * PPU
    let tickInterval = strong
    if (pixelsPerUnit * strong > 90) tickInterval = medium
    if (pixelsPerUnit * medium < 20) tickInterval = strong * 2

    const worldLeft = (-cx / (zoom * PPU)) - camX
    const worldRight = (width - cx) / (zoom * PPU) - camX
    const worldTop = (-cy / (zoom * PPU)) - camY
    const worldBottom = (height - cy) / (zoom * PPU) - camY

    const labelStyle: Partial<PIXI.TextStyleOptions> = {
      fontSize: 10,
      fill: COLORS.rulerText,
      fontFamily: "system-ui",
    }

    const startX = Math.floor(worldLeft / tickInterval) * tickInterval
    for (let wx = startX; wx <= worldRight; wx += tickInterval) {
      const sx = toScreen(wx, 0).x
      if (sx < RULER || sx > width) continue

      const isMajor = Math.abs(wx % (tickInterval * 2)) < 0.01
      const tickHeight = isMajor ? 8 : 4

      graphics.moveTo(sx, RULER - tickHeight)
      graphics.lineTo(sx, RULER)
      graphics.stroke({ color: COLORS.rulerTick, width: 0.5, alpha: 0.8 })

      if (isMajor || tickInterval <= medium) {
        const label = new PIXI.Text({ text: String(Math.round(wx)), style: labelStyle })
        label.x = sx + 2
        label.y = 3
        this.rulerTextContainer.addChild(label)
      }
    }

    const startY = Math.floor(worldTop / tickInterval) * tickInterval
    for (let wy = startY; wy <= worldBottom; wy += tickInterval) {
      const sy = toScreen(0, wy).y
      if (sy < RULER || sy > height) continue

      const isMajor = Math.abs(wy % (tickInterval * 2)) < 0.01
      const tickWidth = isMajor ? 8 : 4

      graphics.moveTo(RULER - tickWidth, sy)
      graphics.lineTo(RULER, sy)
      graphics.stroke({ color: COLORS.rulerTick, width: 0.5, alpha: 0.8 })

      if (isMajor || tickInterval <= medium) {
        const label = new PIXI.Text({ text: String(Math.round(wy)), style: labelStyle })
        label.angle = -90
        label.x = RULER - 3
        label.y = sy - 1
        this.rulerTextContainer.addChild(label)
      }
    }

  }

  destroy() {
    this.unsub()
    const canvas = this.app.canvas
    canvas.removeEventListener("wheel", this.onWheel)
    canvas.removeEventListener("mousedown", this.onMouseDown)
    canvas.removeEventListener("mousemove", this.onMouseMove)
    canvas.removeEventListener("mouseup", this.onMouseUp)
    canvas.removeEventListener("mouseleave", this.onMouseLeave)
    canvas.removeEventListener("contextmenu", this.onContextMenu)
    canvas.parentNode?.removeChild(canvas)
    // Clean up reference image containers
    for (const container of this.referenceContainers.values()) {
      container.destroy(true)
    }
    this.referenceContainers.clear()
    this.referenceSrcs.clear()
    this.refChildren.clear()
    this.app.destroy()
  }
}
