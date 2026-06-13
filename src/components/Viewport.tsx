import { useEffect, useRef, useState } from "react"
import { getWallPolygonForEndpoint } from "../lib/wall-topology"
import { PixiRenderer } from "../renderer/PixiRenderer"
import { useEditorStore } from "../store"

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const document = useEditorStore(state => state.document)
  const selection = useEditorStore(state => state.selection)
  const selectedHandle = useEditorStore(state => state.selectedHandle)
  const debugMessages = useEditorStore(state => state.debugMessages)
  const canJoinSelection = useEditorStore(state => state.canJoinSelection)
  const joinSelectedWalls = useEditorStore(state => state.joinSelectedWalls)
  const unjoinWallEndpoint = useEditorStore(state => state.unjoinWallEndpoint)
  const pushDebugMessage = useEditorStore(state => state.pushDebugMessage)
  const clearDebugMessages = useEditorStore(state => state.clearDebugMessages)

  const selectedEndpointPolygon = selectedHandle
    ? getWallPolygonForEndpoint(document, selectedHandle.wallId, selectedHandle.end)
    : null
  const selectedWallCount = selection.filter(id =>
    document.walls.some(wall => wall.id === id)
  ).length
  const menuActions = [
    ...(selectedWallCount >= 2
      ? [{
        id: "join-selected",
        label: "Join Selected Walls",
        disabled: !canJoinSelection(),
        onClick: () => {
          pushDebugMessage(
            `context join click: walls=${selection.join(", ") || "(none)"} enabled=${String(canJoinSelection())}`
          )
          if (!canJoinSelection()) return
          joinSelectedWalls()
          setContextMenu(null)
        },
      }]
      : []),
    ...(selectedHandle
      ? [{
        id: "unjoin-endpoint",
        label: "Unjoin Endpoint",
        disabled: !selectedEndpointPolygon,
        onClick: () => {
          pushDebugMessage(
            `context unjoin click: ${selectedHandle.wallId}:${selectedHandle.end} joined=${String(Boolean(selectedEndpointPolygon))}`
          )
          if (!selectedEndpointPolygon) return
          unjoinWallEndpoint(selectedHandle.wallId, selectedHandle.end)
          setContextMenu(null)
        },
      }]
      : []),
  ]

  const openContextMenu = (request: { x: number; y: number }) => {
    const state = useEditorStore.getState()
    const hasSelection = state.selection.length > 0 || Boolean(state.selectedHandle)
    state.pushDebugMessage(
      `context menu open @(${request.x.toFixed(0)}, ${request.y.toFixed(0)}): selection=[${state.selection.join(", ")}] handle=${state.selectedHandle ? `${state.selectedHandle.wallId}:${state.selectedHandle.end}` : "none"}`
    )
    setContextMenu(hasSelection ? request : null)
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    PixiRenderer.create(container, {
      onContextMenu: openContextMenu,
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {contextMenu && (
        <>
          <div className="absolute inset-0 z-20" onMouseDown={() => setContextMenu(null)} />
          <div
            className="absolute z-30 min-w-52 overflow-hidden rounded-md border border-border bg-panel shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={event => event.stopPropagation()}
          >
            {menuActions.length > 0 ? menuActions.map(action => (
              <button
                key={action.id}
                onClick={action.onClick}
                disabled={action.disabled}
                className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors disabled:cursor-default disabled:text-text-dim/50 hover:bg-muted disabled:hover:bg-transparent"
              >
                <span className={action.disabled ? "text-text-dim/50" : "text-text"}>
                  {action.label}
                </span>
              </button>
            )) : (
              <div className="px-3 py-2 text-sm text-text-dim/60">No actions available</div>
            )}
          </div>
        </>
      )}
      <div className="absolute left-5 bottom-5 z-20 max-w-[420px] rounded-md border border-border bg-bg/92 px-3 py-2 text-xs text-text-dim shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-semibold text-text">Join Debug</span>
          <button
            onClick={clearDebugMessages}
            className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-dim hover:bg-muted"
          >
            Clear
          </button>
        </div>
        <div className="space-y-1 font-mono leading-4">
          {debugMessages.length > 0 ? debugMessages.map((message, index) => (
            <div key={`${index}-${message}`} className="break-words">
              {message}
            </div>
          )) : (
            <div>No join debug events yet.</div>
          )}
        </div>
      </div>
      <ScaleGuide />
      <ScaleBar />
    </div>
  )
}
