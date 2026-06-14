import { useState } from "react"
import { X, Plus } from "lucide-react"
import { useEditorStore } from "../store"
import { cn } from "../lib/utils"

const TILESET_CATEGORIES = [
  {
    label: "Basic",
    items: [
      { id: "wall-tile",   label: "Wall",   color: "#4a5568", tool: "wall" as const },
      { id: "door-tile",   label: "Door",   color: "#744210", tool: "door" as const },
      { id: "window-tile", label: "Window", color: "#1a365d", tool: "window" as const },
    ],
  },
  {
    label: "Corner",
    items: [
      { id: "corner-tl", label: "TL", color: "#3d4a55" },
      { id: "corner-tr", label: "TR", color: "#3d4a55" },
      { id: "corner-bl", label: "BL", color: "#3d4a55" },
    ],
  },
  {
    label: "Others",
    items: [
      { id: "pillar", label: "Pillar", color: "#3a4555" },
      { id: "shelf",  label: "Shelf",  color: "#4a4030" },
      { id: "plant",  label: "Plant",  color: "#2d4a2d" },
    ],
  },
]

const PROP_ASSETS = [
  { id: "crate",    label: "Crate",    color: "#5c4a2d" },
  { id: "locker",   label: "Locker",   color: "#2d3a4a" },
  { id: "table",    label: "Table",    color: "#4a3a2d" },
  { id: "computer", label: "Computer", color: "#1a2d3a" },
  { id: "shelf",    label: "Shelf",    color: "#3a2d1a" },
]

type Tab = "tilesets" | "props"

function TileBtn({
  label, color, onClick,
}: {
  label: string
  color: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 group"
      title={label}
    >
      <div
        className="w-12 h-12 rounded-md border border-border group-hover:border-accent transition-colors"
        style={{ background: color }}
      />
      <span className="text-[11px] text-text-dim group-hover:text-text transition-colors">{label}</span>
    </button>
  )
}

export function AssetBrowser() {
  const [tab, setTab] = useState<Tab>("tilesets")
  const setActiveTool = useEditorStore(s => s.setActiveTool)
  const addProp = useEditorStore(s => s.addProp)
  const setSelection = useEditorStore(s => s.setSelection)

  const spawnProp = (assetId: string) => {
    const id = addProp({ x: 0, y: 0, assetId })
    setSelection([id])
  }

  return (
    <div className="flex flex-col border-t border-border shrink-0" style={{ height: 256 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-dim uppercase tracking-widest">Assets</span>
        <button className="text-text-dim hover:text-text transition-colors">
          <X size={13} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {(["tilesets", "props"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm transition-colors capitalize",
              tab === t
                ? "text-accent border-b border-accent -mb-px"
                : "text-text-dim hover:text-text"
            )}
          >
            {t === "tilesets" ? "Tilesets" : "Props"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {tab === "tilesets" ? (
          <>
            {TILESET_CATEGORIES.map(cat => (
              <div key={cat.label} className="mb-3">
                <div className="text-[11px] font-semibold text-text-dim px-1 py-1 uppercase tracking-wide">
                  {cat.label}
                </div>
                <div className="flex gap-3 flex-wrap px-1">
                  {cat.items.map(item => (
                    <TileBtn
                      key={item.id}
                      label={item.label}
                      color={item.color}
                      onClick={"tool" in item ? () => setActiveTool(item.tool!) : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="flex gap-3 flex-wrap px-1 py-1">
            {PROP_ASSETS.map(asset => (
              <TileBtn
                key={asset.id}
                label={asset.label}
                color={asset.color}
                onClick={() => spawnProp(asset.id)}
              />
            ))}
          </div>
        )}

        <button className="w-full mt-2 py-2 text-xs text-text-dim hover:text-text border border-dashed border-border hover:border-text-dim rounded-md transition-colors flex items-center justify-center gap-1.5">
          <Plus size={11} />
          Add Asset
        </button>
      </div>
    </div>
  )
}
