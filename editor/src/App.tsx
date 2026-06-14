import { useEffect } from "react"
import { Toolbar } from "./components/Toolbar"
import { Hierarchy } from "./components/Hierarchy"
import { Viewport } from "./components/Viewport"
import { Inspector } from "./components/Inspector"
import { AssetBrowser } from "./components/AssetBrowser"
import { StatusBar } from "./components/StatusBar"
import { useEditorStore } from "./store"
import { worldToTile } from "./lib/tilemap"

export default function App() {
  const deleteSelected = useEditorStore(s => s.deleteSelected)
  const deleteTileSelection = useEditorStore(s => s.deleteTileSelection)
  const copyTileSelection = useEditorStore(s => s.copyTileSelection)
  const cutTileSelection = useEditorStore(s => s.cutTileSelection)
  const pasteTileClipboard = useEditorStore(s => s.pasteTileClipboard)
  const undoTileEdit = useEditorStore(s => s.undoTileEdit)
  const redoTileEdit = useEditorStore(s => s.redoTileEdit)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return

      const store = useEditorStore.getState()
      const isModifier = e.ctrlKey || e.metaKey

      if (isModifier && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) redoTileEdit()
        else undoTileEdit()
        return
      }

      if (isModifier && e.key.toLowerCase() === "y") {
        e.preventDefault()
        redoTileEdit()
        return
      }

      if (isModifier && e.key.toLowerCase() === "c" && store.floor.selection) {
        e.preventDefault()
        copyTileSelection()
        return
      }

      if (isModifier && e.key.toLowerCase() === "x" && store.floor.selection) {
        e.preventDefault()
        cutTileSelection()
        return
      }

      if (isModifier && e.key.toLowerCase() === "v" && store.floor.clipboard) {
        e.preventDefault()
        pasteTileClipboard(worldToTile({ x: store.mouseX, y: store.mouseY }, store.document.tilemap.tileSize))
        return
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (store.floor.selection && store.activeTool === "tileSelection") {
          deleteTileSelection()
          return
        }
        deleteSelected()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [copyTileSelection, cutTileSelection, deleteSelected, deleteTileSelection, pasteTileClipboard, redoTileEdit, undoTileEdit])

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-bg">
      <Toolbar />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Hierarchy + Assets */}
        <div className="w-[248px] shrink-0 bg-panel border-r border-border overflow-hidden flex flex-col">
          <Hierarchy />
          <AssetBrowser />
        </div>

        {/* Main viewport */}
        <div className="flex-1 overflow-hidden relative bg-bg">
          <Viewport />
        </div>

        {/* Right panel: Inspector */}
        <div className="w-[256px] shrink-0 bg-panel border-l border-border overflow-hidden flex flex-col">
          <Inspector />
        </div>
      </div>

      <StatusBar />
    </div>
  )
}
