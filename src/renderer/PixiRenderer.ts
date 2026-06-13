import * as PIXI from "pixi.js"
import {
  canPlaceOpeningOnWall,
  clamp,
  findNearestValidOpeningOffset,
  getOpeningDefaultWidth,
  getOpeningInterval,
  getOpeningQuad,
  getWallQuad,
  PIXELS_PER_UNIT,
  pointInPolygon,
  projectPointOntoWall,
  wallLength,
  wallLocalToWorld,
  wallNormal,
  worldToWallLocal,
  type WallGroupPolygon,
  type WallGroupGeometry,
} from "../lib/map-geometry"
import {
  getWallEndpointPosition,
  getWallPolygonForEndpoint,
} from "../lib/wall-topology"
import { useEditorStore } from "../store"
import { getObject, getWallByOpeningId } from "../types"
import type {
  EditorHandle,
  MapDocument,
  ReferenceImage,
  Vec2,
  Wall,
  WallEnd,
  WallOpening,
  WallOpeningKind,
} from "../types"

export type ViewportContextMenuRequest = {
  x: number
  y: number
}

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
  handleMuted: 0x8fb7e1,
  dimLabel: 0x4ea1ff,
  invalid: 0xc2410c,
}

type OpeningPreview = {
  wall: Wall
  kind: WallOpeningKind
  width: number
  offset: number
  valid: boolean
}

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

function getGridSteps(zoom: number) {
  const gridStep = snapToNiceStep(1 / zoom)
  return {
    thin: gridStep,
    medium: gridStep * 5,
    strong: gridStep * 10,
  }
}

function handlesEqual(a: EditorHandle | null, b: EditorHandle | null) {
  return Boolean(
    a &&
    b &&
    a.kind === "wallEndpoint" &&
    b.kind === "wallEndpoint" &&
    a.wallId === b.wallId &&
    a.end === b.end
  )
}

export class PixiRenderer {
  app: PIXI.Application
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
  private refChildren = new Map<string, { gfx: PIXI.Graphics; sprite: PIXI.Sprite | null }>()

  private isPanning = false
  private panStart = { x: 0, y: 0 }
  private cameraPanStart = { x: 0, y: 0 }

  private isDraggingObject = false
  private dragObjectId: string | null = null
  private dragStart = { x: 0, y: 0 }
  private dragPropStart = { x: 0, y: 0 }
  private dragWallDelta = { x: 0, y: 0 }

  private isDraggingEndpoint = false
  private dragEndpoint: { wallId: string; end: WallEnd } | null = null

  private isDrawingWall = false
  private drawStart = { worldX: 0, worldY: 0 }
  private pointerScreen = { x: 0, y: 0 }
  private onContextMenuRequest?: (request: ViewportContextMenuRequest) => void

  private constructor(
    app: PIXI.Application,
    options?: { onContextMenu?: (request: ViewportContextMenuRequest) => void }
  ) {
    this.app = app
    this.onContextMenuRequest = options?.onContextMenu

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

  static async create(
    container: HTMLElement,
    options?: { onContextMenu?: (request: ViewportContextMenuRequest) => void }
  ): Promise<PixiRenderer> {
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

  private getHandleWorldRadius(px = 8) {
    const zoom = useEditorStore.getState().zoom
    return Math.max(1.5, px / (zoom * PPU))
  }

  private getJoinedEndpointHandleOffset() {
    const zoom = useEditorStore.getState().zoom
    return Math.max(2, 14 / (zoom * PPU))
  }

  private drawPolygon(
    graphics: PIXI.Graphics,
    points: Vec2[],
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    fillColor: number,
    strokeColor: number,
    fillAlpha = 0.88,
    strokeWidth = 1,
    strokeAlpha = 0.9
  ) {
    if (points.length < 3) return
    const screenPoints = points.map(point => toScreen(point.x, point.y))
    this.traceScreenPolygon(graphics, screenPoints)
    graphics.fill({ color: fillColor, alpha: fillAlpha })
    graphics.stroke({ color: strokeColor, width: strokeWidth, alpha: strokeAlpha })
  }

  private traceScreenPolygon(
    graphics: PIXI.Graphics,
    screenPoints: Array<{ x: number; y: number }>
  ) {
    if (screenPoints.length < 3) return
    graphics.moveTo(screenPoints[0].x, screenPoints[0].y)
    for (const point of screenPoints.slice(1)) {
      graphics.lineTo(point.x, point.y)
    }
    graphics.closePath()
  }

  private drawWallGroupPolygon(
    graphics: PIXI.Graphics,
    polygon: WallGroupPolygon,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    fillColor: number,
    strokeColor: number,
    fillAlpha = 0.88,
    strokeWidth = 1,
    strokeAlpha = 0.9
  ) {
    if (polygon.outer.length < 3) return

    const outer = polygon.outer.map(point => toScreen(point.x, point.y))
    this.traceScreenPolygon(graphics, outer)
    graphics.fill({ color: fillColor, alpha: fillAlpha })

    for (const hole of polygon.holes) {
      if (hole.length < 3) continue
      const screenHole = hole.map(point => toScreen(point.x, point.y))
      this.traceScreenPolygon(graphics, screenHole)
      graphics.cut()
    }

    this.traceScreenPolygon(graphics, outer)
    graphics.stroke({ color: strokeColor, width: strokeWidth, alpha: strokeAlpha })

    for (const hole of polygon.holes) {
      if (hole.length < 3) continue
      const screenHole = hole.map(point => toScreen(point.x, point.y))
      this.traceScreenPolygon(graphics, screenHole)
      graphics.stroke({ color: strokeColor, width: strokeWidth, alpha: strokeAlpha })
    }
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
    this.drawPolygon(graphics, points, toScreen, fillColor, strokeColor, fillAlpha, strokeWidth, strokeAlpha)
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
    const multiSelect = event.shiftKey || event.metaKey || event.ctrlKey

    if (tool === "select") {
      this.previewLayer.clear()

      const handle = this.hitTestHandle(sx, sy)
      if (handle) {
        if (multiSelect) {
          store.toggleSelection(handle.wallId)
          store.setSelectedHandle(null)
          return
        }

        store.setSelection([handle.wallId])
        store.setSelectedHandle(handle)
        this.isDraggingEndpoint = true
        this.dragEndpoint = { wallId: handle.wallId, end: handle.end }
        this.dragStart = { x: sx, y: sy }
        return
      }

      const hit = this.hitTestObject(sx, sy)
      if (!hit) {
        if (multiSelect) return
        store.setSelectedHandle(null)
        store.setSelection([])
        return
      }

      if (multiSelect) {
        store.toggleSelection(hit)
        store.setSelectedHandle(null)
        return
      }

      this.isDraggingObject = true
      this.dragObjectId = hit
      this.dragStart = { x: sx, y: sy }
      store.setSelectedHandle(null)
      store.setSelection([hit])

      const object = getObject(store.document, hit)
      if (!object) return

      if (object.kind === "prop") {
        this.dragPropStart = { x: object.x, y: object.y }
        return
      }

      if (object.kind === "wall") {
        this.dragWallDelta = { x: 0, y: 0 }
        return
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
      if (!preview?.valid) return

      const id = tool === "door"
        ? store.addDoor(preview.wall.id, { offset: preview.offset, width: preview.width })
        : store.addWindow(preview.wall.id, { offset: preview.offset, width: preview.width })

      if (id) {
        store.setSelectedHandle(null)
        store.setSelection([id])
      }
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

    if (this.isDraggingEndpoint && this.dragEndpoint) {
      const snapped = this.getSnappedWorldPoint(sx, sy)
      store.moveWallEndpoint(this.dragEndpoint.wallId, this.dragEndpoint.end, snapped)
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

    if (store.activeTool === "door" || store.activeTool === "window") {
      store.setHoveredHandle(null)
      this.renderOpeningPreview(world, store.activeTool)
      return
    }

    if (store.activeTool === "select") {
      store.setHoveredHandle(this.hitTestHandle(sx, sy))
    } else {
      store.setHoveredHandle(null)
    }

    this.previewLayer.clear()
  }

  private onMouseUp = (event: MouseEvent) => {
    if (event.button === 1) {
      this.isPanning = false
      return
    }

    if (event.button !== 0) return

    if (this.isDraggingEndpoint && this.dragEndpoint) {
      this.isDraggingEndpoint = false
      this.dragEndpoint = null
      return
    }

    if (this.isDraggingObject) {
      this.isDraggingObject = false
      this.dragObjectId = null
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
    const store = useEditorStore.getState()
    store.setHoveredHandle(null)
    if (!this.isDrawingWall && !this.isDraggingObject && !this.isDraggingEndpoint) {
      this.previewLayer.clear()
    }
  }

  private onContextMenu = (event: MouseEvent) => {
    event.preventDefault()

    const store = useEditorStore.getState()
    if (store.activeTool !== "select") return

    const rect = this.app.canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const handle = this.hitTestEndpointHandle(sx, sy)
    const hit = handle ? null : this.hitTestObject(sx, sy)

    if (handle) {
      if (!store.selection.includes(handle.wallId)) {
        store.setSelection([handle.wallId])
      }
      store.setSelectedHandle(handle)
    } else if (hit) {
      if (!store.selection.includes(hit)) {
        store.setSelection([hit])
      }
      store.setSelectedHandle(null)
    } else {
      store.setSelectedHandle(null)
    }

    this.onContextMenuRequest?.({ x: sx, y: sy })
  }

  private getSnappedWorldPoint(sx: number, sy: number) {
    const world = this.screenToWorld(sx, sy)
    return {
      x: this.snapToGrid(world.x),
      y: this.snapToGrid(world.y),
    }
  }

  private isJoinedEndpoint(wallId: string, end: WallEnd) {
    return Boolean(getWallPolygonForEndpoint(useEditorStore.getState().document, wallId, end))
  }

  private getEndpointHandlePosition(wall: Wall, end: WallEnd): Vec2 {
    const actual = getWallEndpointPosition(wall, end)
    const polygon = getWallPolygonForEndpoint(useEditorStore.getState().document, wall.id, end)
    if (!polygon) return actual

    const length = wallLength(wall)
    if (length <= 0) return actual

    const offset = this.getJoinedEndpointHandleOffset()
    const along = end === "start" ? offset : length - offset
    return wallLocalToWorld(wall, along, 0)
  }

  private handleObjectDrag(sx: number, sy: number) {
    const store = useEditorStore.getState()
    if (!this.dragObjectId) return

    const object = getObject(store.document, this.dragObjectId)
    if (!object) return

    const dx = (sx - this.dragStart.x) / (store.zoom * PPU)
    const dy = (sy - this.dragStart.y) / (store.zoom * PPU)

    if (object.kind === "prop") {
      const nx = this.snapToGrid(this.dragPropStart.x + dx)
      const ny = this.snapToGrid(this.dragPropStart.y + dy)
      store.updateObject(object.id, { x: nx, y: ny })
      return
    }

    if (object.kind === "wall") {
      const tx = this.snapToGrid(dx)
      const ty = this.snapToGrid(dy)
      if (tx === this.dragWallDelta.x && ty === this.dragWallDelta.y) return

      store.moveWallBody(object.id, {
        x: tx - this.dragWallDelta.x,
        y: ty - this.dragWallDelta.y,
      })
      this.dragWallDelta = { x: tx, y: ty }
      return
    }

    const wall = getWallByOpeningId(store.document, object.id)
    if (!wall) return

    const world = this.screenToWorld(sx, sy)
    const projection = projectPointOntoWall(world, wall)
    const desiredOffset = this.snapToGrid(projection.offset)
    const nextOffset = findNearestValidOpeningOffset(wall, object.width, desiredOffset, object.id)
    if (nextOffset == null) return

    store.updateObject(object.id, { offset: nextOffset })
  }

  private finalizeWall(x1: number, y1: number, x2: number, y2: number) {
    const store = useEditorStore.getState()
    const length = Math.hypot(x2 - x1, y2 - y1)
    if (length < store.snapSize) return

    const id = store.addWall({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: store.wallToolThickness,
      openings: [],
    })
    store.setSelectedHandle(null)
    store.setSelection([id])
  }

  private renderWallPreview(x1: number, y1: number, x2: number, y2: number) {
    this.previewLayer.clear()
    if (x1 === x2 && y1 === y2) return

    const { wallToolThickness } = useEditorStore.getState()
    const wall: Wall = {
      id: "preview",
      kind: "wall",
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: wallToolThickness,
      openings: [],
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
    const { document } = useEditorStore.getState()
    const width = getOpeningDefaultWidth(kind)

    let nearest: { wall: Wall; score: number; projectionOffset: number; withinSegment: boolean } | null = null

    for (const wall of document.walls) {
      const projection = projectPointOntoWall(point, wall)
      const endDistance = Math.hypot(
        point.x - projection.clampedPoint.x,
        point.y - projection.clampedPoint.y
      )
      const score = projection.withinSegment ? projection.distance : endDistance

      if (!nearest || score < nearest.score) {
        nearest = {
          wall,
          score,
          projectionOffset: projection.offset,
          withinSegment: projection.withinSegment,
        }
      }
    }

    if (!nearest) return null

    const length = wallLength(nearest.wall)
    const desiredOffset = this.snapToGrid(nearest.projectionOffset)
    const previewOffset = clamp(desiredOffset, 0, length)
    const valid = nearest.withinSegment &&
      canPlaceOpeningOnWall(nearest.wall, { offset: desiredOffset, width })

    return {
      wall: nearest.wall,
      kind,
      width,
      offset: previewOffset,
      valid,
    }
  }

  private renderOpeningPreview(point: Vec2, kind: WallOpeningKind) {
    this.previewLayer.clear()
    const preview = this.getOpeningPreview(point, kind)
    if (!preview) return

    const toScreen = this.getToScreen()
    const previewOpening: WallOpening = {
      id: "preview",
      kind,
      offset: preview.offset,
      width: preview.width,
    }
    const color = kind === "door" ? COLORS.doorFill : COLORS.windowFill
    const stroke = preview.valid ? COLORS.selection : COLORS.invalid

    this.drawQuad(
      this.previewLayer,
      getOpeningQuad(preview.wall, previewOpening),
      toScreen,
      color,
      stroke,
      preview.valid ? 0.45 : 0.25,
      1.5,
      0.9
    )
  }

  private hitTestHandle(sx: number, sy: number): EditorHandle | null {
    return this.hitTestEndpointHandle(sx, sy)
  }

  private hitTestEndpointHandle(
    sx: number,
    sy: number,
    exclude?: { wallId: string; end: WallEnd }
  ) {
    const store = useEditorStore.getState()
    const point = this.screenToWorld(sx, sy)
    const radius = this.getHandleWorldRadius(8)

    for (const wall of [...store.document.walls].reverse()) {
      for (const end of ["start", "end"] as const) {
        if (exclude && exclude.wallId === wall.id && exclude.end === end) continue
        const handlePoint = this.getEndpointHandlePosition(wall, end)
        if (Math.hypot(point.x - handlePoint.x, point.y - handlePoint.y) <= radius) {
          return { kind: "wallEndpoint", wallId: wall.id, end } as const
        }
      }
    }

    return null
  }

  private hitTestObject(sx: number, sy: number): string | null {
    const store = useEditorStore.getState()
    const point = this.screenToWorld(sx, sy)
    const hitPadding = Math.max(1.5, 8 / (store.zoom * PPU))
    const propRadius = Math.max(2, 10 / (store.zoom * PPU))

    for (const wall of [...store.document.walls].reverse()) {
      for (const opening of [...wall.openings].reverse()) {
        if (this.pointHitsOpening(point, wall, opening, hitPadding)) {
          return opening.id
        }
      }
    }

    for (const group of [...store.wallRenderCache.wallGroups].sort((a, b) => b.order - a.order)) {
      if (!this.pointHitsWallGroup(point, group)) continue

      let nearestWallId: string | null = null
      let nearestScore = Number.POSITIVE_INFINITY

      for (const wallId of group.wallIds) {
        const wall = store.document.walls.find(candidate => candidate.id === wallId)
        if (!wall) continue

        const local = worldToWallLocal(point, wall)
        const alongClamped = clamp(local.along, 0, wallLength(wall))
        const dx = local.along - alongClamped
        const dy = local.perp
        const score = Math.hypot(dx, dy)

        if (score < nearestScore) {
          nearestScore = score
          nearestWallId = wallId
        }
      }

      return nearestWallId
    }

    for (const prop of [...store.document.props].reverse()) {
      if (Math.hypot(point.x - prop.x, point.y - prop.y) <= propRadius) {
        return prop.id
      }
    }

    for (const img of [...store.document.referenceImages].reverse()) {
      if (this.pointHitsReferenceImage(point, img)) {
        return img.id
      }
    }

    return null
  }

  private pointHitsOpening(point: Vec2, wall: Wall, opening: WallOpening, padding: number) {
    const local = worldToWallLocal(point, wall)
    const interval = getOpeningInterval(opening)
    return (
      local.along >= interval.from - padding &&
      local.along <= interval.to + padding &&
      Math.abs(local.perp) <= wall.thickness / 2 + padding
    )
  }

  private pointHitsWallGroup(point: Vec2, group: WallGroupGeometry) {
    return group.polygons.some(polygon =>
      pointInPolygon(point, polygon.outer) &&
      !polygon.holes.some(hole => pointInPolygon(point, hole))
    )
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

    if (zoom * PPU >= 4) {
      drawGridLines(
        thin,
        COLORS.gridThin,
        0.6,
        1,
        value => Math.abs(value % medium) > 0.001
      )
    }

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
    const store = useEditorStore.getState()
    const selectedHandle = store.selectedHandle
    const hoveredHandle = store.hoveredHandle
    const cache = store.wallRenderCache

    for (const group of [...cache.wallGroups].sort((a, b) => a.order - b.order)) {
      const graphics = new PIXI.Graphics()
      for (const polygon of group.polygons) {
        this.drawWallGroupPolygon(
          graphics,
          polygon,
          toScreen,
          COLORS.wallFill,
          COLORS.wall,
          0.9,
          1,
          0.9
        )
      }
      this.objectLayer.addChild(graphics)
    }

    for (const wall of document.walls) {
      const terminals = cache.terminals[wall.id]
      for (const opening of wall.openings) {
        const openingGraphics = new PIXI.Graphics()
        const fillColor = opening.kind === "door" ? COLORS.doorFill : COLORS.windowFill
        const strokeColor = opening.kind === "door" ? COLORS.door : COLORS.window

        this.drawQuad(
          openingGraphics,
          getOpeningQuad(wall, opening, wall.thickness, terminals),
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
            getOpeningQuad(wall, opening, wall.thickness + 1.5, terminals),
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
    }

    for (const prop of document.props) {
      this.renderProp(prop.x, prop.y, prop.assetId, selected.has(prop.id), toScreen, zoom)
    }

    if (store.activeTool === "select") {
      this.renderHandles(document, toScreen, selectedHandle, hoveredHandle)
    }

    const selectedObjects = selection
      .map(id => getObject(document, id))
      .filter((object): object is NonNullable<ReturnType<typeof getObject>> => Boolean(object))

    for (const object of selectedObjects) {
      if (object.kind === "wall") {
        this.renderWallSelection(
          object,
          toScreen,
          zoom,
          cache.wallGroups,
          selection.length === 1
        )
      } else if (object.kind === "door" || object.kind === "window") {
        const wall = getWallByOpeningId(document, object.id)
        if (wall && selection.length === 1) {
          this.renderOpeningSelection(wall, object, toScreen, zoom)
        }
      }
    }
  }

  private renderHandles(
    document: MapDocument,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    selectedHandle: EditorHandle | null,
    hoveredHandle: EditorHandle | null
  ) {
    const graphics = this.overlayLayer

    for (const wall of document.walls) {
      for (const end of ["start", "end"] as const) {
        const actual = getWallEndpointPosition(wall, end)
        const handle = { kind: "wallEndpoint", wallId: wall.id, end } as const
        const handlePoint = this.getEndpointHandlePosition(wall, end)
        const screen = toScreen(handlePoint.x, handlePoint.y)
        const actualScreen = toScreen(actual.x, actual.y)
        const joined = this.isJoinedEndpoint(wall.id, end)
        const isSelected = handlesEqual(selectedHandle, handle)
        const isHovered = handlesEqual(hoveredHandle, handle)

        if (joined && (Math.abs(handlePoint.x - actual.x) > 0.001 || Math.abs(handlePoint.y - actual.y) > 0.001)) {
          graphics.moveTo(actualScreen.x, actualScreen.y)
          graphics.lineTo(screen.x, screen.y)
          graphics.stroke({ color: COLORS.handleMuted, width: 1, alpha: 0.45 })
        }

        if (joined) {
          const size = isSelected ? 4.5 : isHovered ? 4.25 : 4
          graphics.rect(screen.x - size, screen.y - size, size * 2, size * 2)
          graphics.fill({ color: COLORS.handleFill, alpha: isSelected || isHovered ? 0.95 : 0.78 })
          graphics.stroke({ color: 0xffffff, width: isSelected ? 1.4 : 1, alpha: 0.65 })
        } else {
          const radius = isSelected ? 4.8 : isHovered ? 4.5 : 4.2
          graphics.circle(screen.x, screen.y, radius)
          graphics.fill({ color: COLORS.handleFill, alpha: isSelected || isHovered ? 0.95 : 0.82 })
          graphics.stroke({ color: 0xffffff, width: isSelected ? 1.4 : 1, alpha: 0.65 })
        }
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
        this.loadReferenceTexture(img, container, children, zoom)
      } else if (children) {
        const oldSrc = this.referenceSrcs.get(img.id)
        if (oldSrc !== img.src) {
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
    const htmlImg = new Image()
    htmlImg.onload = () => {
      if (!this.referenceContainers.has(img.id)) return

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

      if (children.sprite) {
        container.removeChild(children.sprite)
        children.sprite.destroy(true)
      }
      container.addChildAt(sprite, 0)
      children.sprite = sprite
    }
    htmlImg.onerror = () => {
      console.error("[ReferenceImage] Failed to load:", img.src.slice(0, 80))
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
    wallGroups: WallGroupGeometry[],
    showLabel: boolean
  ) {
    const graphics = this.overlayLayer
    const group = wallGroups.find(candidate => candidate.wallIds.includes(wall.id))
    const start = toScreen(wall.start.x, wall.start.y)
    const end = toScreen(wall.end.x, wall.end.y)
    const normal = wallNormal(wall)
    const midpoint = wallLocalToWorld(wall, wallLength(wall) / 2, wall.thickness / 2 + 4)
    const midpointScreen = toScreen(midpoint.x, midpoint.y)

    if (group && group.polygons.length > 0) {
      for (const polygon of group.polygons) {
        this.drawWallGroupPolygon(
          graphics,
          polygon,
          toScreen,
          COLORS.selection,
          COLORS.selection,
          0.08,
          1.8,
          1
        )
      }
    } else {
      graphics.moveTo(start.x, start.y)
      graphics.lineTo(end.x, end.y)
      graphics.stroke({ color: COLORS.selection, width: 1.5, alpha: 1 })
    }

    if (showLabel) {
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
  }

  private renderOpeningSelection(
    wall: Wall,
    opening: WallOpening,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    zoom: number
  ) {
    const interval = getOpeningInterval(opening)
    const center = wallLocalToWorld(wall, opening.offset, 0)
    const centerScreen = toScreen(center.x, center.y)
    const radius = 4.5
    const labelAnchor = wallLocalToWorld(wall, interval.to, wall.thickness / 2 + 5)
    const labelScreen = toScreen(labelAnchor.x, labelAnchor.y)

    this.overlayLayer.circle(centerScreen.x, centerScreen.y, radius)
    this.overlayLayer.fill({ color: COLORS.selection, alpha: 1 })
    this.overlayLayer.stroke({ color: 0xffffff, width: 1, alpha: 0.6 })

    const label = new PIXI.Text({
      text: `${Math.round(opening.width)}u @ ${Math.round(opening.offset)}u`,
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
        label.x = 2
        label.y = sy + 1
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
    this.app.destroy(true, { children: true })
  }
}
