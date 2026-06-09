import { useEffect } from "react"
import { Toolbar } from "./components/Toolbar"
import { Hierarchy } from "./components/Hierarchy"
import { Viewport } from "./components/Viewport"
import { Inspector } from "./components/Inspector"
import { AssetBrowser } from "./components/AssetBrowser"
import { StatusBar } from "./components/StatusBar"
import { useEditorStore } from "./store"

export default function App() {
  const deleteSelected = useEditorStore(s => s.deleteSelected)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const active = document.activeElement
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return
        deleteSelected()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [deleteSelected])

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-bg">
      <Toolbar />

      <div className="flex flex-1 overflow-hidden">
        <div className="w-48 shrink-0 bg-panel border-r border-border overflow-hidden flex flex-col">
          <Hierarchy />
        </div>

        <div className="flex-1 overflow-hidden relative bg-bg">
          <Viewport />
        </div>

        <div className="w-52 shrink-0 bg-panel border-l border-border overflow-hidden flex flex-col">
          <Inspector />
        </div>
      </div>

      <div className="h-9 shrink-0 bg-panel">
        <AssetBrowser />
      </div>

      <StatusBar />
    </div>
  )
}
