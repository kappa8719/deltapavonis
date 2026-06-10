import { useEffect, useRef } from "react"
import { PixiRenderer } from "../renderer/PixiRenderer"
import { useEditorStore } from "../store"

function ScaleGuide() {
  return (
    <div className="absolute top-4 right-4 bg-bg/90 border border-[#c8a840] rounded px-3 py-2 text-xs pointer-events-none z-10 select-none"
      style={{ minWidth: 160 }}
    >
      <div className="text-[#c8a840] font-semibold mb-1.5 text-[11px]">[ 스케일 가이드 ]</div>
      <div className="text-text-dim space-y-0.5">
        <div>1 unit = 10cm</div>
        <div>벽 두께: 8u (80cm)</div>
        <div>문 폭: 9u (90cm)</div>
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
    <div className="absolute bottom-4 right-4 pointer-events-none z-10 select-none">
      <div className="flex items-end gap-0 text-[10px] text-text-dim mb-0.5">
        <span className="mr-0" style={{ marginRight: halfPx - 8 }}>0</span>
        <span className="mr-0" style={{ marginRight: halfPx - 10 }}>5u</span>
        <span>10u</span>
      </div>
      <div className="relative h-3" style={{ width: barPx }}>
        {/* Bar background */}
        <div
          className="absolute bottom-0 left-0 h-1.5 border border-[#c8a840] rounded-sm"
          style={{ width: barPx, background: "transparent" }}
        />
        {/* Ticks */}
        <div className="absolute bottom-1.5 left-0 w-px h-2 bg-[#c8a840]" />
        <div className="absolute bottom-1.5 h-1.5 w-px bg-[#c8a840]" style={{ left: halfPx }} />
        <div className="absolute bottom-1.5 right-0 w-px h-2 bg-[#c8a840]" />
        {/* Fill halves */}
        <div
          className="absolute bottom-0 left-0 h-1.5"
          style={{ width: halfPx, background: "#c8a840", opacity: 0.6 }}
        />
      </div>
    </div>
  )
}

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PixiRenderer | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    PixiRenderer.create(container).then(renderer => {
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

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      <ScaleGuide />
      <ScaleBar />
    </div>
  )
}
