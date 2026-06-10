import * as PIXI from "pixi.js"
import { useEditorStore } from "../store"
import type { MapDocument, Wall } from "../types"

// 1 world unit = 6 pixels at zoom=1 (matches "1 unit = 10cm" with 6px/u display scale)
const PPU = 6

// Grid intervals in world units
const GRID_MINOR = 5   // thin lines every 5u
const GRID_MAJOR = 10  // thick lines every 10u

// Ruler strip size in screen pixels
const RULER = 24

const COLORS = {
  bg:          0x111315,
  rulerBg:     0x181b1f,
  rulerTick:   0x4a5568,
  rulerText:   0x6b7684,
  rulerCorner: 0x252a30,
  gridMinor:   0x1a1f25,
  gridMajor:   0x222830,
  gridOriginX: 0x3a2828,
  gridOriginY: 0x28382a,
  roomBorder:  0x3a4450,
  roomFill:    0x14171a,
  wall:        0x4a5568,
  wallFill:    0x2d3748,
  door:        0x744210,
  doorFill:    0x92400e,
  window:      0x1a365d,
  windowFill:  0x2b4c7e,
  prop:        0x2d6b2d,
  propFill:    0x3a7c3a,
  selection:   0x4ea1ff,
  handleFill:  0x4ea1ff,
  dimLabel:    0x4ea1ff,
}

export class PixiRenderer {
  app: PIXI.Application
  private rulerLayer: PIXI.Graphics
  private rulerTextContainer: PIXI.Container
  private gridLayer: PIXI.Graphics
  private roomLayer: PIXI.Graphics
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

  private constructor(app: PIXI.Application) {
    this.app = app

    this.rulerLayer = new PIXI.Graphics()
    this.rulerTextContainer = new PIXI.Container()
    this.gridLayer = new PIXI.Graphics()
    this.roomLayer = new PIXI.Graphics()
    this.objectLayer = new PIXI.Container()
    this.overlayLayer = new PIXI.Graphics()
    this.previewLayer = new PIXI.Graphics()

    this.app.stage.addChild(this.gridLayer)
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

  static async create(container: HTMLElement): Promise<PixiRenderer> {
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
    return new PixiRenderer(app)
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

  private snapToGrid(v: number) {
    const snap = useEditorStore.getState().snapSize
    return Math.round(v / snap) * snap
  }

  private bindEvents() {
    const canvas = this.app.canvas
    canvas.addEventListener("wheel", this.onWheel, { passive: false })
    canvas.addEventListener("mousedown", this.onMouseDown)
    canvas.addEventListener("mousemove", this.onMouseMove)
    canvas.addEventListener("mouseup", this.onMouseUp)
    canvas.addEventListener("contextmenu", e => e.preventDefault())
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const store = useEditorStore.getState()
    const factor = e.deltaY < 0 ? 1.1 : 0.909
    const newZoom = Math.min(10, Math.max(0.1, store.zoom * factor))

    const rect = this.app.canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2

    const wx = (sx - cx) / (store.zoom * PPU) - store.cameraX
    const wy = (sy - cy) / (store.zoom * PPU) - store.cameraY

    const newCamX = (sx - cx) / (newZoom * PPU) - wx
    const newCamY = (sy - cy) / (newZoom * PPU) - wy

    store.setZoom(newZoom)
    store.setCamera(newCamX, newCamY)
  }

  private onMouseDown = (e: MouseEvent) => {
    const rect = this.app.canvas.getBoundingClientRect()
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
    const rect = this.app.canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
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
      const dx = (sx - this.dragStart.x) / (store.zoom * PPU)
      const dy = (sy - this.dragStart.y) / (store.zoom * PPU)
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
    const rect = this.app.canvas.getBoundingClientRect()
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

    const minSize = store.snapSize
    if (w < minSize || h < minSize) return

    let id: string | null = null
    if (tool === "wall")   id = store.addWall({ x, y, width: w, height: h })
    else if (tool === "door")   id = store.addDoor({ x, y, width: w, height: h })
    else if (tool === "window") id = store.addWindow({ x, y, width: w, height: h })

    if (id) store.setSelection([id])
  }

  private renderPreview(x1: number, y1: number, x2: number, y2: number, tool: string) {
    this.previewLayer.clear()
    const { zoom, cameraX, cameraY } = useEditorStore.getState()
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2
    const toScreen = (wx: number, wy: number) => ({
      x: (wx + cameraX) * zoom * PPU + cx,
      y: (wy + cameraY) * zoom * PPU + cy,
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

    this.previewLayer.rect(rx, ry, rw, rh)
    this.previewLayer.fill({ color, alpha: 0.3 })
    this.previewLayer.stroke({ color: COLORS.selection, width: 1, alpha: 0.8 })
  }

  private hitTest(sx: number, sy: number): string | null {
    const store = useEditorStore.getState()
    const doc = store.document
    const { zoom, cameraX, cameraY } = store
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2

    const toScreen = (wx: number, wy: number) => ({
      x: (wx + cameraX) * zoom * PPU + cx,
      y: (wy + cameraY) * zoom * PPU + cy,
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
    const { zoom, cameraX, cameraY, document: doc, selection, gridVisible } = store

    const w = this.app.screen.width
    const h = this.app.screen.height
    const cx = w / 2
    const cy = h / 2

    const toScreen = (wx: number, wy: number) => ({
      x: (wx + cameraX) * zoom * PPU + cx,
      y: (wy + cameraY) * zoom * PPU + cy,
    })

    if (gridVisible) {
      this.renderGrid(w, h, cx, cy, zoom, cameraX, cameraY)
    } else {
      this.gridLayer.clear()
    }
    this.renderRoom(toScreen, store.roomWidth, store.roomHeight)
    this.renderObjects(doc, selection, toScreen, zoom)
    this.renderRulers(w, h, cx, cy, zoom, cameraX, cameraY)
  }

  private renderGrid(
    w: number, h: number,
    cx: number, cy: number,
    zoom: number, camX: number, camY: number
  ) {
    const g = this.gridLayer
    g.clear()

    const toScreen = (wx: number, wy: number) => ({
      x: (wx + camX) * zoom * PPU + cx,
      y: (wy + camY) * zoom * PPU + cy,
    })

    const worldLeft   = (-cx / (zoom * PPU)) - camX - GRID_MAJOR
    const worldTop    = (-cy / (zoom * PPU)) - camY - GRID_MAJOR
    const worldRight  = (w - cx) / (zoom * PPU) - camX + GRID_MAJOR
    const worldBottom = (h - cy) / (zoom * PPU) - camY + GRID_MAJOR

    const startX = Math.floor(worldLeft / GRID_MINOR) * GRID_MINOR
    const startY = Math.floor(worldTop  / GRID_MINOR) * GRID_MINOR

    // Minor grid lines (every 5u)
    for (let wx = startX; wx <= worldRight; wx += GRID_MINOR) {
      const isMajor = Math.abs(wx % GRID_MAJOR) < 0.01 || Math.abs((wx % GRID_MAJOR) - GRID_MAJOR) < 0.01
      if (!isMajor) {
        const s = toScreen(wx, worldTop)
        const e = toScreen(wx, worldBottom)
        g.moveTo(s.x, s.y)
        g.lineTo(e.x, e.y)
      }
    }
    for (let wy = startY; wy <= worldBottom; wy += GRID_MINOR) {
      const isMajor = Math.abs(wy % GRID_MAJOR) < 0.01 || Math.abs((wy % GRID_MAJOR) - GRID_MAJOR) < 0.01
      if (!isMajor) {
        const s = toScreen(worldLeft, wy)
        const e = toScreen(worldRight, wy)
        g.moveTo(s.x, s.y)
        g.lineTo(e.x, e.y)
      }
    }
    g.stroke({ color: COLORS.gridMinor, width: 1, alpha: 0.8 })

    // Major grid lines (every 10u)
    for (let wx = startX; wx <= worldRight; wx += GRID_MINOR) {
      const isMajor = Math.abs(wx % GRID_MAJOR) < 0.01 || Math.abs((wx % GRID_MAJOR) - GRID_MAJOR) < 0.01
      if (isMajor) {
        const isOrigin = Math.abs(wx) < 0.01
        const s = toScreen(wx, worldTop)
        const e = toScreen(wx, worldBottom)
        g.moveTo(s.x, s.y)
        g.lineTo(e.x, e.y)
        if (!isOrigin) g.stroke({ color: COLORS.gridMajor, width: 1, alpha: 1 })
        else g.stroke({ color: COLORS.gridOriginX, width: 1.5, alpha: 0.8 })
      }
    }
    for (let wy = startY; wy <= worldBottom; wy += GRID_MINOR) {
      const isMajor = Math.abs(wy % GRID_MAJOR) < 0.01 || Math.abs((wy % GRID_MAJOR) - GRID_MAJOR) < 0.01
      if (isMajor) {
        const isOrigin = Math.abs(wy) < 0.01
        const s = toScreen(worldLeft, wy)
        const e = toScreen(worldRight, wy)
        g.moveTo(s.x, s.y)
        g.lineTo(e.x, e.y)
        if (!isOrigin) g.stroke({ color: COLORS.gridMajor, width: 1, alpha: 1 })
        else g.stroke({ color: COLORS.gridOriginY, width: 1.5, alpha: 0.8 })
      }
    }
  }

  private renderRoom(
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    roomW: number, roomH: number
  ) {
    const g = this.roomLayer
    g.clear()

    const halfW = roomW / 2
    const halfH = roomH / 2
    const rs1 = toScreen(-halfW, -halfH)
    const rs2 = toScreen(halfW, halfH)

    g.rect(rs1.x, rs1.y, rs2.x - rs1.x, rs2.y - rs1.y)
    g.fill({ color: COLORS.roomFill, alpha: 0.4 })
    g.stroke({ color: COLORS.roomBorder, width: 1.5, alpha: 0.6 })
  }

  private renderObjects(
    doc: MapDocument,
    selection: string[],
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    zoom: number
  ) {
    const staleObj = this.objectLayer.removeChildren()
    for (const c of staleObj) c.destroy()
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

      g.rect(s1.x, s1.y, rw, rh)
      g.fill({ color: fillColor, alpha: 0.88 })
      g.stroke({ color: lineColor, width: 1, alpha: 0.9 })

      if (selected) {
        g.rect(s1.x - 1, s1.y - 1, rw + 2, rh + 2)
        g.stroke({ color: COLORS.selection, width: 1.5, alpha: 1 })
      }
      this.objectLayer.addChild(g)
    }

    const drawProp = (x: number, y: number, assetId: string, selected: boolean) => {
      const g = new PIXI.Graphics()
      const s = toScreen(x, y)
      const r = Math.max(7, 13 * zoom)

      g.circle(s.x, s.y, r)
      g.fill({ color: COLORS.propFill, alpha: 0.88 })
      g.stroke({ color: COLORS.prop, width: 1, alpha: 0.9 })

      if (selected) {
        g.circle(s.x, s.y, r + 2)
        g.stroke({ color: COLORS.selection, width: 1.5, alpha: 1 })
      }

      const label = new PIXI.Text({
        text: assetId,
        style: { fontSize: Math.max(10, 11 * zoom), fill: 0xc8cdd4, fontFamily: "system-ui" },
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

    // Selection overlays: handles + dimension labels
    if (selection.length === 1) {
      const obj = this.getObject(selection[0])
      if (obj && "width" in obj) {
        const rect = obj as Wall
        this.renderSelectionHandles(rect, toScreen, zoom)
      }
    }
  }

  private renderSelectionHandles(
    rect: Wall,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    zoom: number
  ) {
    const g = this.overlayLayer
    const { x, y, width: w, height: h } = rect
    const s1 = toScreen(x, y)
    const s2 = toScreen(x + w, y + h)
    const mx = (s1.x + s2.x) / 2
    const my = (s1.y + s2.y) / 2
    const R = 5

    const handles = [
      { x: s1.x, y: s1.y }, { x: mx, y: s1.y }, { x: s2.x, y: s1.y },
      { x: s1.x, y: my },                         { x: s2.x, y: my },
      { x: s1.x, y: s2.y }, { x: mx, y: s2.y }, { x: s2.x, y: s2.y },
    ]

    for (const pt of handles) {
      g.circle(pt.x, pt.y, R)
      g.fill({ color: COLORS.handleFill, alpha: 1 })
      g.stroke({ color: 0xffffff, width: 1, alpha: 0.6 })
    }

    // Dimension labels
    const pxW = Math.abs(s2.x - s1.x)
    const pxH = Math.abs(s2.y - s1.y)
    const fontSize = Math.max(10, Math.min(13, 11 * zoom))

    if (pxW > 20) {
      const wLabel = new PIXI.Text({
        text: `${w} u`,
        style: { fontSize, fill: COLORS.dimLabel, fontFamily: "system-ui", fontWeight: "500" },
      })
      wLabel.x = mx - wLabel.width / 2
      wLabel.y = s1.y - fontSize - 4
      this.objectLayer.addChild(wLabel)
    }

    if (pxH > 20) {
      const hLabel = new PIXI.Text({
        text: `${h} u`,
        style: { fontSize, fill: COLORS.dimLabel, fontFamily: "system-ui", fontWeight: "500" },
      })
      hLabel.x = s2.x + 4
      hLabel.y = my - hLabel.height / 2
      this.objectLayer.addChild(hLabel)
    }
  }

  private renderRulers(
    w: number, h: number,
    cx: number, cy: number,
    zoom: number, camX: number, camY: number
  ) {
    const g = this.rulerLayer
    g.clear()
    const staleText = this.rulerTextContainer.removeChildren()
    for (const c of staleText) c.destroy()

    const toScreen = (wx: number, wy: number) => ({
      x: (wx + camX) * zoom * PPU + cx,
      y: (wy + camY) * zoom * PPU + cy,
    })

    // Ruler backgrounds
    g.rect(RULER, 0, w - RULER, RULER)
    g.fill({ color: COLORS.rulerBg, alpha: 1 })

    g.rect(0, RULER, RULER, h - RULER)
    g.fill({ color: COLORS.rulerBg, alpha: 1 })

    // Corner square
    g.rect(0, 0, RULER, RULER)
    g.fill({ color: COLORS.rulerCorner, alpha: 1 })

    // Bottom edge of horizontal ruler
    g.moveTo(RULER, RULER)
    g.lineTo(w, RULER)
    g.stroke({ color: COLORS.rulerTick, width: 0.5, alpha: 0.5 })

    // Right edge of vertical ruler
    g.moveTo(RULER, RULER)
    g.lineTo(RULER, h)
    g.stroke({ color: COLORS.rulerTick, width: 0.5, alpha: 0.5 })

    // Determine tick interval based on zoom
    const pixPerUnit = zoom * PPU
    let tickInterval = GRID_MAJOR // default 10u ticks
    if (pixPerUnit * 10 > 80) tickInterval = GRID_MINOR  // show 5u ticks when zoomed in
    if (pixPerUnit * 10 < 20) tickInterval = 20           // show 20u ticks when zoomed out

    const worldLeft   = (-cx / (zoom * PPU)) - camX
    const worldRight  = (w - cx) / (zoom * PPU) - camX
    const worldTop    = (-cy / (zoom * PPU)) - camY
    const worldBottom = (h - cy) / (zoom * PPU) - camY

    const labelStyle: Partial<PIXI.TextStyleOptions> = {
      fontSize: 10,
      fill: COLORS.rulerText,
      fontFamily: "system-ui",
    }

    // Horizontal ruler ticks
    const startX = Math.floor(worldLeft / tickInterval) * tickInterval
    for (let wx = startX; wx <= worldRight; wx += tickInterval) {
      const sx = toScreen(wx, 0).x
      if (sx < RULER || sx > w) continue

      const isMajor = Math.abs(wx % (tickInterval * 2)) < 0.01
      const tickH = isMajor ? 8 : 4

      g.moveTo(sx, RULER - tickH)
      g.lineTo(sx, RULER)
      g.stroke({ color: COLORS.rulerTick, width: 0.5, alpha: 0.8 })

      if (isMajor || tickInterval <= GRID_MINOR) {
        const label = new PIXI.Text({ text: String(Math.round(wx)), style: labelStyle })
        label.x = sx + 2
        label.y = 3
        this.rulerTextContainer.addChild(label)
      }
    }

    // Vertical ruler ticks
    const startY = Math.floor(worldTop / tickInterval) * tickInterval
    for (let wy = startY; wy <= worldBottom; wy += tickInterval) {
      const sy = toScreen(0, wy).y
      if (sy < RULER || sy > h) continue

      const isMajor = Math.abs(wy % (tickInterval * 2)) < 0.01
      const tickW = isMajor ? 8 : 4

      g.moveTo(RULER - tickW, sy)
      g.lineTo(RULER, sy)
      g.stroke({ color: COLORS.rulerTick, width: 0.5, alpha: 0.8 })

      if (isMajor || tickInterval <= GRID_MINOR) {
        const label = new PIXI.Text({ text: String(Math.round(wy)), style: labelStyle })
        label.angle = -90
        label.x = RULER - 3
        label.y = sy - 1
        this.rulerTextContainer.addChild(label)
      }
    }

    // Room label in canvas center area
    const { roomWidth, roomHeight } = useEditorStore.getState()
    const roomCenter = toScreen(0, 0)

    if (
      roomCenter.x > RULER && roomCenter.x < w - 60 &&
      roomCenter.y > RULER && roomCenter.y < h - 30
    ) {
      const nameLabel = new PIXI.Text({
        text: `Room_001\n${roomWidth} x ${roomHeight} u`,
        style: {
          fontSize: 13,
          fill: 0x3a4450,
          fontFamily: "system-ui",
          align: "center",
          lineHeight: 18,
        },
      })
      nameLabel.x = roomCenter.x - nameLabel.width / 2
      nameLabel.y = roomCenter.y - nameLabel.height / 2
      this.rulerTextContainer.addChild(nameLabel)
    }
  }

  destroy() {
    this.unsub()
    const canvas = this.app.canvas
    canvas.removeEventListener("wheel", this.onWheel)
    canvas.removeEventListener("mousedown", this.onMouseDown)
    canvas.removeEventListener("mousemove", this.onMouseMove)
    canvas.removeEventListener("mouseup", this.onMouseUp)
    canvas.parentNode?.removeChild(canvas)
    this.app.destroy()
  }
}
