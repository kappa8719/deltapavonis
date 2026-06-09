import { useEffect, useRef } from "react"
import { PixiRenderer } from "../renderer/PixiRenderer"

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<PixiRenderer | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new PixiRenderer(canvas)
    rendererRef.current = renderer

    const handleResize = () => {
      renderer.render()
    }
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      renderer.destroy()
      rendererRef.current = null
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ cursor: "crosshair" }}
    />
  )
}
