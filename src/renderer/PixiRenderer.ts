import * as PIXI from "pixi.js"
import { useEditorStore } from "../store"
import type { MapDocument, Wall } from "../types"

const GRID_MINOR = 20
const GRID_MAJOR = 100

const COLORS = {
  gridMinor: 0x1e2328,
  gridMajor: 0x252b32,
  wall: 0x4a5568,
  wallFill: 0x2d3748,
  door: 0x744210,
  doorFill: 0x92400e,
  window: 0x1a365d,
  windowFill: 0x2b4c7e,
  prop: 0x2d4a2d,
  propFill: 0x3a5c3a,
  selection: 0x4ea1ff,
  origin: 0x333a42,
}

export class PixiRenderer {
  app: PIXI.Application
  private gridLayer: PIXI.Graphics
  private objectLayer: PIXI.Container
  private overlayLayer: PIXI.Graphics
  private previewLayer: PIXI.Graphics
  private unsub: () => void

  private isPanning = false
  private panStart = { x: 0, y: 0 }
  private cameraPanStart = { x: 0, y: 0 }

  private isDraggingObject = false
  private dragObjectId: string | null = null
  private dragStart = { x: 0, y: 0 }
  private dragObjectStart = { x: 0, y: 0 }

  private isDrawing = false
  private drawStart = { worldX: 0, worldY: 0 }

  constructor(canvas: HTMLCanvasElement) {
    this.app = new PIXI.Application({
      view: canvas,
      resizeTo: canvas,
      backgroundColor: 0x111315,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    this.gridLayer = new PIXI.Graphics()
    this.objectLayer = new PIXI.Container()
    this.overlayLayer = new PIXI.Graphics()
    this.previewLayer = new PIXI.Graphics()

    this.app.stage.addChild(this.gridLayer)
    this.app.stage.addChild(this.objectLayer)
    this.app.stage.addChild(this.overlayLayer)
    this.app.stage.addChild(this.previewLayer)

    this.app.stage.interactive = true
    this.app.stage.hitArea = new PIXI.Rectangle(-1e6, -1e6, 2e6, 2e6)

    this.bindEvents()

    this.unsub = useEditorStore.subscribe(() => this.render())
    this.render()
  }

  private screenToWorld(sx: number, sy: number) {
    const { zoom, cameraX, cameraY } = useEditorStore.getState()
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2
    return {
      x: (sx - cx) / zoom - cameraX,
      y: (sy - cy) / zoom - cameraY,
    }
  }

  private snapToGrid(v: number) {
    return Math.round(v / GRID_MINOR) * GRID_MINOR
  }

  private bindEvents() {
    const view = this.app.view as HTMLCanvasElement

    view.addEventListener("wheel", this.onWheel, { passive: false })
    view.addEventListener("mousedown", this.onMouseDown)
    view.addEventListener("mousemove", this.onMouseMove)
    view.addEventListener("mouseup", this.onMouseUp)
    view.addEventListener("contextmenu", e => e.preventDefault())
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const store = useEditorStore.getState()
    const factor = e.deltaY < 0 ? 1.1 : 0.909
    const newZoom = Math.min(10, Math.max(0.1, store.zoom * factor))

    const rect = (this.app.view as HTMLCanvasElement).getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2

    const wx = (sx - cx) / store.zoom - store.cameraX
    const wy = (sy - cy) / store.zoom - store.cameraY

    const newCamX = (sx - cx) / newZoom - wx
    const newCamY = (sy - cy) / newZoom - wy

    store.setZoom(newZoom)
    store.setCamera(newCamX, newCamY)
  }

  private onMouseDown = (e: MouseEvent) => {
    const rect = (this.app.view as HTMLCanvasElement).getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const store = useEditorStore.getState()

    if (e.button === 1) {
      e.preventDefault()
      this.isPanning = true
      this.panStart = { x: sx, y: sy }
      this.cameraPanStart = { x: store.cameraX, y: store.cameraY }
      return
    }

    if (e.button === 0) {
      const tool = store.activeTool
      const world = this.screenToWorld(sx, sy)
      const wx = this.snapToGrid(world.x)
      const wy = this.snapToGrid(world.y)

      if (tool === "select") {
        const hit = this.hitTest(sx, sy)
        if (hit) {
          this.isDraggingObject = true
          this.dragObjectId = hit
          this.dragStart = { x: sx, y: sy }
          const obj = this.getObject(hit)
          if (obj) this.dragObjectStart = { x: obj.x, y: obj.y }
          store.setSelection([hit])
        } else {
          store.setSelection([])
        }
      } else {
        this.isDrawing = true
        this.drawStart = { worldX: wx, worldY: wy }
      }
    }
  }

  private onMouseMove = (e: MouseEvent) => {
    const rect = (this.app.view as HTMLCanvasElement).getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const world = this.screenToWorld(sx, sy)
    const store = useEditorStore.getState()

    store.setMouse(Math.round(world.x), Math.round(world.y))

    if (this.isPanning) {
      const dx = (sx - this.panStart.x) / store.zoom
      const dy = (sy - this.panStart.y) / store.zoom
      store.setCamera(this.cameraPanStart.x + dx, this.cameraPanStart.y + dy)
      return
    }

    if (this.isDraggingObject && this.dragObjectId) {
      const dx = (sx - this.dragStart.x) / store.zoom
      const dy = (sy - this.dragStart.y) / store.zoom
      const nx = this.snapToGrid(this.dragObjectStart.x + dx)
      const ny = this.snapToGrid(this.dragObjectStart.y + dy)
      store.updateObject(this.dragObjectId, { x: nx, y: ny })
      return
    }

    if (this.isDrawing) {
      const wx = this.snapToGrid(world.x)
      const wy = this.snapToGrid(world.y)
      this.renderPreview(this.drawStart.worldX, this.drawStart.worldY, wx, wy, store.activeTool)
    }
  }

  private onMouseUp = (e: MouseEvent) => {
    const rect = (this.app.view as HTMLCanvasElement).getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (e.button === 1) {
      this.isPanning = false
      return
    }

    if (e.button === 0) {
      if (this.isDraggingObject) {
        this.isDraggingObject = false
        this.dragObjectId = null
      }

      if (this.isDrawing) {
        this.isDrawing = false
        this.previewLayer.clear()
        const world = this.screenToWorld(sx, sy)
        const wx = this.snapToGrid(world.x)
        const wy = this.snapToGrid(world.y)
        this.finalizeShape(this.drawStart.worldX, this.drawStart.worldY, wx, wy)
      }
    }
  }

  private finalizeShape(x1: number, y1: number, x2: number, y2: number) {
    const store = useEditorStore.getState()
    const tool = store.activeTool
    const x = Math.min(x1, x2)
    const y = Math.min(y1, y2)
    const w = Math.abs(x2 - x1)
    const h = Math.abs(y2 - y1)

    if (w < GRID_MINOR || h < GRID_MINOR) return

    let id: string | null = null
    if (tool === "wall") id = store.addWall({ x, y, width: w, height: h })
    else if (tool === "door") id = store.addDoor({ x, y, width: w, height: h })
    else if (tool === "window") id = store.addWindow({ x, y, width: w, height: h })

    if (id) store.setSelection([id])
  }

  private renderPreview(x1: number, y1: number, x2: number, y2: number, tool: string) {
    this.previewLayer.clear()
    const { zoom, cameraX, cameraY } = useEditorStore.getState()
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2

    const toScreen = (wx: number, wy: number) => ({
      x: (wx + cameraX) * zoom + cx,
      y: (wy + cameraY) * zoom + cy,
    })

    const sx1 = toScreen(x1, y1)
    const sx2 = toScreen(x2, y2)
    const rx = Math.min(sx1.x, sx2.x)
    const ry = Math.min(sx1.y, sx2.y)
    const rw = Math.abs(sx2.x - sx1.x)
    const rh = Math.abs(sx2.y - sx1.y)

    let color = COLORS.wall
    if (tool === "door") color = COLORS.door
    if (tool === "window") color = COLORS.window

    this.previewLayer.lineStyle(1, COLORS.selection, 0.8)
    this.previewLayer.beginFill(color, 0.3)
    this.previewLayer.drawRect(rx, ry, rw, rh)
    this.previewLayer.endFill()
  }

  private hitTest(sx: number, sy: number): string | null {
    const store = useEditorStore.getState()
    const doc = store.document
    const { zoom, cameraX, cameraY } = store
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2

    const toScreen = (wx: number, wy: number) => ({
      x: (wx + cameraX) * zoom + cx,
      y: (wy + cameraY) * zoom + cy,
    })

    const testRect = (id: string, x: number, y: number, w: number, h: number) => {
      const s1 = toScreen(x, y)
      const s2 = toScreen(x + w, y + h)
      return sx >= s1.x && sx <= s2.x && sy >= s1.y && sy <= s2.y ? id : null
    }

    const testPoint = (id: string, x: number, y: number) => {
      const s = toScreen(x, y)
      const r = Math.max(8, 16 * zoom)
      return sx >= s.x - r && sx <= s.x + r && sy >= s.y - r && sy <= s.y + r ? id : null
    }

    for (const o of [...doc.props].reverse()) {
      const hit = testPoint(o.id, o.x, o.y)
      if (hit) return hit
    }
    for (const arr of [doc.walls, doc.doors, doc.windows]) {
      for (const o of [...arr].reverse()) {
        const rect = o as Wall
        const hit = testRect(rect.id, rect.x, rect.y, rect.width, rect.height)
        if (hit) return hit
      }
    }
    return null
  }

  private getObject(id: string) {
    const doc = useEditorStore.getState().document
    return (
      doc.walls.find(o => o.id === id) ||
      doc.doors.find(o => o.id === id) ||
      doc.windows.find(o => o.id === id) ||
      doc.props.find(o => o.id === id) ||
      null
    )
  }

  render() {
    const store = useEditorStore.getState()
    const { zoom, cameraX, cameraY, document: doc, selection } = store

    const w = this.app.screen.width
    const h = this.app.screen.height
    const cx = w / 2
    const cy = h / 2

    const toScreen = (wx: number, wy: number) => ({
      x: (wx + cameraX) * zoom + cx,
      y: (wy + cameraY) * zoom + cy,
    })

    this.renderGrid(w, h, cx, cy, zoom, cameraX, cameraY)
    this.renderObjects(doc, selection, toScreen, zoom)
  }

  private renderGrid(
    w: number, h: number,
    cx: number, cy: number,
    zoom: number, camX: number, camY: number
  ) {
    const g = this.gridLayer
    g.clear()

    const toScreen = (wx: number, wy: number) => ({
      x: (wx + camX) * zoom + cx,
      y: (wy + camY) * zoom + cy,
    })

    const worldLeft = (-cx / zoom) - camX - GRID_MAJOR
    const worldTop = (-cy / zoom) - camY - GRID_MAJOR
    const worldRight = (w - cx) / zoom - camX + GRID_MAJOR
    const worldBottom = (h - cy) / zoom - camY + GRID_MAJOR

    const startX = Math.floor(worldLeft / GRID_MINOR) * GRID_MINOR
    const startY = Math.floor(worldTop / GRID_MINOR) * GRID_MINOR

    for (let wx = startX; wx <= worldRight; wx += GRID_MINOR) {
      const isMajor = Math.abs(wx % GRID_MAJOR) < 0.001 || Math.abs(wx % GRID_MAJOR - GRID_MAJOR) < 0.001
      const color = isMajor ? COLORS.gridMajor : COLORS.gridMinor
      const alpha = isMajor ? 1 : 0.7
      g.lineStyle(1, color, alpha)
      const s = toScreen(wx, worldTop)
      const e = toScreen(wx, worldBottom)
      g.moveTo(s.x, s.y)
      g.lineTo(e.x, e.y)
    }

    for (let wy = startY; wy <= worldBottom; wy += GRID_MINOR) {
      const isMajor = Math.abs(wy % GRID_MAJOR) < 0.001 || Math.abs(wy % GRID_MAJOR - GRID_MAJOR) < 0.001
      const color = isMajor ? COLORS.gridMajor : COLORS.gridMinor
      const alpha = isMajor ? 1 : 0.7
      g.lineStyle(1, color, alpha)
      const s = toScreen(worldLeft, wy)
      const e = toScreen(worldRight, wy)
      g.moveTo(s.x, s.y)
      g.lineTo(e.x, e.y)
    }

    // Origin cross
    const os = toScreen(0, 0)
    g.lineStyle(1, 0x4ea1ff, 0.3)
    g.moveTo(os.x - 10, os.y)
    g.lineTo(os.x + 10, os.y)
    g.moveTo(os.x, os.y - 10)
    g.lineTo(os.x, os.y + 10)
  }

  private renderObjects(
    doc: MapDocument,
    selection: string[],
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    zoom: number
  ) {
    this.objectLayer.removeChildren()
    this.overlayLayer.clear()
    const selSet = new Set(selection)

    const drawRect = (
      x: number, y: number, w: number, h: number,
      fillColor: number, lineColor: number,
      selected: boolean
    ) => {
      const g = new PIXI.Graphics()
      const s1 = toScreen(x, y)
      const s2 = toScreen(x + w, y + h)
      const rw = s2.x - s1.x
      const rh = s2.y - s1.y

      g.lineStyle(1, lineColor, 0.9)
      g.beginFill(fillColor, 0.85)
      g.drawRect(s1.x, s1.y, rw, rh)
      g.endFill()

      if (selected) {
        g.lineStyle(2, COLORS.selection, 1)
        g.drawRect(s1.x - 1, s1.y - 1, rw + 2, rh + 2)
      }
      this.objectLayer.addChild(g)
    }

    const drawProp = (x: number, y: number, assetId: string, selected: boolean) => {
      const g = new PIXI.Graphics()
      const s = toScreen(x, y)
      const r = Math.max(6, 12 * zoom)

      g.lineStyle(1, COLORS.prop, 0.9)
      g.beginFill(COLORS.propFill, 0.85)
      g.drawCircle(s.x, s.y, r)
      g.endFill()

      if (selected) {
        g.lineStyle(2, COLORS.selection, 1)
        g.drawCircle(s.x, s.y, r + 2)
      }

      // Label
      const label = new PIXI.Text(assetId, {
        fontSize: Math.max(8, 10 * zoom),
        fill: 0xc8cdd4,
        fontFamily: "system-ui",
      })
      label.x = s.x - label.width / 2
      label.y = s.y + r + 2
      this.objectLayer.addChild(g)
      this.objectLayer.addChild(label)
    }

    for (const wall of doc.walls) {
      drawRect(wall.x, wall.y, wall.width, wall.height, COLORS.wallFill, COLORS.wall, selSet.has(wall.id))
    }
    for (const door of doc.doors) {
      drawRect(door.x, door.y, door.width, door.height, COLORS.doorFill, COLORS.door, selSet.has(door.id))
    }
    for (const win of doc.windows) {
      drawRect(win.x, win.y, win.width, win.height, COLORS.windowFill, COLORS.window, selSet.has(win.id))
    }
    for (const prop of doc.props) {
      drawProp(prop.x, prop.y, prop.assetId, selSet.has(prop.id))
    }
  }

  destroy() {
    this.unsub()
    const view = this.app.view as HTMLCanvasElement
    view.removeEventListener("wheel", this.onWheel)
    view.removeEventListener("mousedown", this.onMouseDown)
    view.removeEventListener("mousemove", this.onMouseMove)
    view.removeEventListener("mouseup", this.onMouseUp)
    this.app.destroy(false)
  }
}
