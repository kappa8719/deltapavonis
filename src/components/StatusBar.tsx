import { useEditorStore } from "../store"

export function StatusBar() {
  const mouseX = useEditorStore(s => s.mouseX)
  const mouseY = useEditorStore(s => s.mouseY)
  const zoom = useEditorStore(s => s.zoom)
  const activeTool = useEditorStore(s => s.activeTool)
  const doc = useEditorStore(s => s.document)
  const selection = useEditorStore(s => s.selection)

  const total =
    doc.walls.length +
    doc.doors.length +
    doc.windows.length +
    doc.props.length

  return (
    <div className="flex items-center h-6 bg-panel border-t border-border px-3 gap-4 text-xs text-text-dim select-none shrink-0">
      <span>
        <span className="text-text-dim">Tool:</span>{" "}
        <span className="text-text capitalize">{activeTool}</span>
      </span>
      <span className="text-border">|</span>
      <span>
        <span className="text-text-dim">Mouse:</span>{" "}
        <span className="text-text font-mono">
          {mouseX}, {mouseY}
        </span>
      </span>
      <span className="text-border">|</span>
      <span>
        <span className="text-text-dim">Zoom:</span>{" "}
        <span className="text-text">{(zoom * 100).toFixed(0)}%</span>
      </span>
      <span className="text-border">|</span>
      <span>
        <span className="text-text-dim">Objects:</span>{" "}
        <span className="text-text">{total}</span>
      </span>
      {selection.length > 0 && (
        <>
          <span className="text-border">|</span>
          <span>
            <span className="text-accent">{selection.length} selected</span>
          </span>
        </>
      )}
      <span className="ml-auto text-text-dim/50">
        MMB drag: pan &nbsp;·&nbsp; wheel: zoom &nbsp;·&nbsp; Del: delete
      </span>
    </div>
  )
}
