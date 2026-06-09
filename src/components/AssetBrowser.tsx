import { useEditorStore } from "../store"

const ASSETS = [
  { id: "crate", label: "Crate" },
  { id: "locker", label: "Locker" },
  { id: "table", label: "Table" },
  { id: "computer", label: "Computer" },
  { id: "shelf", label: "Shelf" },
]

export function AssetBrowser() {
  const addProp = useEditorStore(s => s.addProp)
  const setSelection = useEditorStore(s => s.setSelection)

  const spawn = (assetId: string) => {
    const id = addProp({ x: 0, y: 0, assetId })
    setSelection([id])
  }

  return (
    <div className="flex items-center h-full px-3 gap-3 border-t border-border bg-panel overflow-x-auto">
      <span className="text-xs font-semibold text-text-dim uppercase tracking-widest shrink-0">
        Assets
      </span>
      <div className="w-px h-5 bg-border shrink-0" />
      {ASSETS.map(asset => (
        <button
          key={asset.id}
          onClick={() => spawn(asset.id)}
          className="flex items-center gap-1.5 px-2.5 h-6 rounded text-xs text-text-dim hover:text-text hover:bg-muted transition-colors shrink-0"
        >
          {asset.label}
        </button>
      ))}
    </div>
  )
}
