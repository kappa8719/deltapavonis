import { useEditorStore } from "../store"
import { worldToTile } from "../lib/tilemap"
import { getOpeningCount } from "../types"

export function StatusBar() {
  const activeTool = useEditorStore(s => s.activeTool)
  const mouseX = useEditorStore(s => s.mouseX)
  const mouseY = useEditorStore(s => s.mouseY)
  const zoom = useEditorStore(s => s.zoom)
  const snapSize = useEditorStore(s => s.snapSize)
  const wallToolThickness = useEditorStore(s => s.wallToolThickness)
  const doc = useEditorStore(s => s.document)
  const floor = useEditorStore(s => s.floor)
  const roomWidth = useEditorStore(s => s.roomWidth)
  const roomHeight = useEditorStore(s => s.roomHeight)
  const activeLayer = doc.tilemap.layers.find(layer => layer.id === floor.activeLayerId)
  const tile = worldToTile({ x: mouseX, y: mouseY }, doc.tilemap.tileSize)
  const isFloorTool = ["pencil", "eraser", "rectangle", "bucket", "tileSelection", "stamp"].includes(activeTool)

  const total =
    doc.walls.length +
    doc.polygonWalls.length +
    getOpeningCount(doc) +
    doc.props.length +
    doc.referenceImages.length

  return (
    <div className="flex items-center h-8 bg-panel border-t border-border px-4 gap-0 text-sm text-text-dim select-none shrink-0">
      <Seg label="Mouse" value={`(${mouseX}, ${mouseY})`} mono />
      {isFloorTool && (
        <>
          <Sep />
          <Seg label="Tile" value={`(${tile.x}, ${tile.y})`} mono />
          <Sep />
          <Seg label="Layer" value={activeLayer?.name ?? "None"} />
        </>
      )}
      <Sep />
      <Seg label="Grid" value={`${snapSize}u`} />
      <Sep />
      <Seg label="Zoom" value={`${Math.round(zoom * 100)}%`} />
      {activeTool === "wall" && (
        <>
          <Sep />
          <Seg label="Wall" value={`${wallToolThickness}u`} />
        </>
      )}
      <Sep />
      <span className="text-accent font-medium">1 unit = 10cm</span>
      <Sep />
      <Seg label="Objects" value={String(total)} />
      <Sep />
      <Seg label="Room Size" value={`${roomWidth} x ${roomHeight} u`} />
      <div className="flex-1" />
      <span className="text-text-dim/40 text-xs">
        MMB drag: pan · wheel: {activeTool === "wall" ? "wall thickness" : "zoom"} · Del: delete
      </span>
    </div>
  )
}

function Seg({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="px-2.5">
      <span className="text-text-dim">{label}:</span>{" "}
      <span className={`text-text${mono ? " font-mono" : ""}`}>{value}</span>
    </span>
  )
}

function Sep() {
  return <span className="text-border">|</span>
}
