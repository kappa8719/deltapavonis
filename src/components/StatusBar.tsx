import { useEditorStore } from "../store"
import { getOpeningCount } from "../types"

export function StatusBar() {
  const mouseX = useEditorStore(s => s.mouseX)
  const mouseY = useEditorStore(s => s.mouseY)
  const zoom = useEditorStore(s => s.zoom)
  const snapSize = useEditorStore(s => s.snapSize)
  const doc = useEditorStore(s => s.document)
  const roomWidth = useEditorStore(s => s.roomWidth)
  const roomHeight = useEditorStore(s => s.roomHeight)

  const total =
    doc.walls.length +
    getOpeningCount(doc) +
    doc.props.length

  return (
    <div className="flex items-center h-8 bg-panel border-t border-border px-4 gap-0 text-sm text-text-dim select-none shrink-0">
      <Seg label="Mouse" value={`(${mouseX}, ${mouseY})`} mono />
      <Sep />
      <Seg label="Grid" value={`${snapSize}u`} />
      <Sep />
      <Seg label="Zoom" value={`${Math.round(zoom * 100)}%`} />
      <Sep />
      <span className="text-accent font-medium">1 unit = 10cm</span>
      <Sep />
      <Seg label="Objects" value={String(total)} />
      <Sep />
      <Seg label="Room Size" value={`${roomWidth} x ${roomHeight} u`} />
      <div className="flex-1" />
      <span className="text-text-dim/40 text-xs">
        MMB drag: pan · wheel: zoom · Del: delete
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
