import { useEffect, useRef, useState } from "react"
import { PixiRenderer } from "../renderer/PixiRenderer"
import { useEditorStore } from "../store"
import { getObject } from "../types"

type ContextMenuState = {
  x: number
  y: number
  targetId: string | null
} | null

function ScaleGuide() {
  return (
    <div className="absolute top-5 right-5 bg-bg/90 border border-[#c8a840] rounded-md px-4 py-3 text-sm pointer-events-none z-10 select-none"
      style={{ minWidth: 196 }}
    >
      <div className="text-[#c8a840] font-semibold mb-2 text-xs">[ 스케일 가이드 ]</div>
      <div className="text-text-dim space-y-1">
        <div>1 unit = 10cm</div>
        <div>벽 두께: 8u (80cm)</div>
        <div>문 폭: 9u (90cm)</div>
        <div>창 폭: 6u (60cm)</div>
        <div>캐릭터 반경: 3u (30cm)</div>
      </div>
    </div>
  )
}

function ScaleBar() {
  const zoom = useEditorStore(s => s.zoom)
  const PPU = 6
  const barUnits = 10
  const barPx = barUnits * PPU * zoom
  const halfPx = barPx / 2

  return (
    <div className="absolute bottom-5 right-5 pointer-events-none z-10 select-none">
      <div className="flex items-end gap-0 text-xs text-text-dim mb-1">
        <span className="mr-0" style={{ marginRight: halfPx - 10 }}>0</span>
        <span className="mr-0" style={{ marginRight: halfPx - 12 }}>5u</span>
        <span>10u</span>
      </div>
      <div className="relative h-4" style={{ width: barPx }}>
        {/* Bar background */}
        <div
          className="absolute bottom-0 left-0 h-2 border border-[#c8a840] rounded-sm"
          style={{ width: barPx, background: "transparent" }}
        />
        {/* Ticks */}
        <div className="absolute bottom-2 left-0 w-px h-2.5 bg-[#c8a840]" />
        <div className="absolute bottom-2 h-2 w-px bg-[#c8a840]" style={{ left: halfPx }} />
        <div className="absolute bottom-2 right-0 w-px h-2.5 bg-[#c8a840]" />
        {/* Fill halves */}
        <div
          className="absolute bottom-0 left-0 h-2"
          style={{ width: halfPx, background: "#c8a840", opacity: 0.6 }}
        />
      </div>
    </div>
  )
}

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PixiRenderer | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const document = useEditorStore(s => s.document)
  const selection = useEditorStore(s => s.selection)
  const setSelection = useEditorStore(s => s.setSelection)
  const convertWallToPolygon = useEditorStore(s => s.convertWallToPolygon)
  const joinWalls = useEditorStore(s => s.joinWalls)

  const contextObjectIds = contextMenu
    ? (contextMenu.targetId && !selection.includes(contextMenu.targetId) ? [contextMenu.targetId] : selection)
    : []
  const contextWallIds = contextObjectIds
    .filter(id => getObject(document, id)?.kind === "wall")
  const contextJoinIds = contextObjectIds
    .filter(id => {
      const object = getObject(document, id)
      return object?.kind === "wall" || object?.kind === "polygonWall"
    })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    PixiRenderer.create(container, {
      onContextMenu: request => setContextMenu(request),
    }).then(renderer => {
      if (cancelled) {
        renderer.destroy()
        return
      }
      rendererRef.current = renderer
    })

    const handleResize = () => {
      rendererRef.current?.render()
    }
    window.addEventListener("resize", handleResize)

    return () => {
      cancelled = true
      window.removeEventListener("resize", handleResize)
      rendererRef.current?.destroy()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!contextMenu) return

    const close = () => setContextMenu(null)
    window.addEventListener("mousedown", close)
    window.addEventListener("wheel", close, { passive: true })
    return () => {
      window.removeEventListener("mousedown", close)
      window.removeEventListener("wheel", close)
    }
  }, [contextMenu])

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {contextMenu && (contextWallIds.length > 0 || contextJoinIds.length >= 2) && (
        <div
          className="fixed z-50 min-w-36 overflow-hidden rounded-md border border-border bg-panel shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={event => event.stopPropagation()}
        >
          {contextJoinIds.length >= 2 && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-muted"
              onClick={() => {
                const joinedId = joinWalls(contextJoinIds)
                if (joinedId) setSelection([joinedId])
                setContextMenu(null)
              }}
            >
              Join
            </button>
          )}
          {contextWallIds.length > 0 && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-muted"
              onClick={() => {
                const polygonIds = contextWallIds
                  .map(wallId => convertWallToPolygon(wallId))
                  .filter((id): id is string => Boolean(id))
                setSelection(polygonIds)
                setContextMenu(null)
              }}
            >
              To polygon
            </button>
          )}
        </div>
      )}
      <ScaleGuide />
      <ScaleBar />
    </div>
  )
}
