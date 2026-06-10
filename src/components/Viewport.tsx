import { useEffect, useRef } from "react"
import { PixiRenderer } from "../renderer/PixiRenderer"

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

  return <div ref={containerRef} className="w-full h-full" />
}
