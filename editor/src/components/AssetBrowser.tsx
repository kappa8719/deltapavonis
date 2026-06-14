import { useMemo, useState } from "react"
import { ImagePlus, Plus, Trash2, X } from "lucide-react"
import { useEditorStore } from "../store"
import { cn } from "../lib/utils"
import type { TilesetAsset } from "../types"

const PROP_ASSETS = [
  { id: "crate", label: "Crate", color: "#5c4a2d" },
  { id: "locker", label: "Locker", color: "#2d3a4a" },
  { id: "table", label: "Table", color: "#4a3a2d" },
  { id: "computer", label: "Computer", color: "#1a2d3a" },
  { id: "shelf", label: "Shelf", color: "#3a2d1a" },
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

function createAssetId(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  return `${base || "tileset"}-${crypto.randomUUID().slice(0, 8)}`
}

function TilesetPalette() {
  const mapDoc = useEditorStore(s => s.document)
  const tilesetAssets = useEditorStore(s => s.tilesetAssets)
  const floor = useEditorStore(s => s.floor)
  const setActiveTileset = useEditorStore(s => s.setActiveTileset)
  const selectTiles = useEditorStore(s => s.selectTiles)
  const setPaletteZoom = useEditorStore(s => s.setPaletteZoom)
  const addTilesetAsset = useEditorStore(s => s.addTilesetAsset)
  const removeTileset = useEditorStore(s => s.removeTileset)
  const [dragStart, setDragStart] = useState<number | null>(null)

  const refs = mapDoc.tilemap.tilesets
  const activeRef = refs.find(ref => ref.tilesetId === floor.activeTilesetId) ?? refs[0] ?? null
  const activeAsset = activeRef ? tilesetAssets[activeRef.tilesetId] : null

  const selectedLocals = useMemo(() => {
    if (!activeRef) return new Set<number>()
    return new Set(floor.selectedTileIds.map(gid => gid - activeRef.firstGid))
  }, [activeRef, floor.selectedTileIds])

  const selectRect = (from: number, to: number) => {
    if (!activeAsset || !activeRef) return
    const ax = from % activeAsset.columns
    const ay = Math.floor(from / activeAsset.columns)
    const bx = to % activeAsset.columns
    const by = Math.floor(to / activeAsset.columns)
    const minX = Math.min(ax, bx)
    const minY = Math.min(ay, by)
    const maxX = Math.max(ax, bx)
    const maxY = Math.max(ay, by)
    const ids: number[] = []
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const localId = y * activeAsset.columns + x
        if (localId < activeAsset.tileCount) ids.push(localId)
      }
    }
    selectTiles(activeRef.tilesetId, ids)
  }

  const importTileset = () => {
    const input = globalThis.document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const texturePath = reader.result
        if (typeof texturePath !== "string") return
        const img = new Image()
        img.onload = () => {
          const tileSize = mapDoc.tilemap.tileSize
          if (img.naturalWidth % tileSize !== 0 || img.naturalHeight % tileSize !== 0) {
            alert(`Tileset image dimensions must be multiples of the map tile size (${tileSize}px).`)
            return
          }

          const columns = img.naturalWidth / tileSize
          const rows = img.naturalHeight / tileSize
          const asset: TilesetAsset = {
            id: createAssetId(file.name),
            name: file.name.replace(/\.[^.]+$/, ""),
            texturePath,
            tileWidth: tileSize,
            tileHeight: tileSize,
            columns,
            tileCount: columns * rows,
          }
          if (!addTilesetAsset(asset)) {
            alert(`Tileset tile size must match the map tile size (${tileSize}).`)
          }
        }
        img.src = texturePath
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const removeActiveTileset = () => {
    if (!activeRef) return
    const removed = removeTileset(activeRef.tilesetId)
    if (!removed) {
      alert("Cannot remove this tileset while its GIDs are still used in the tilemap.")
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {refs.map(ref => {
          const asset = tilesetAssets[ref.tilesetId]
          const active = ref.tilesetId === activeRef?.tilesetId
          return (
            <button
              key={ref.tilesetId}
              onClick={() => setActiveTileset(ref.tilesetId)}
              className={cn(
                "px-2.5 h-7 rounded-md border text-xs shrink-0",
                active ? "border-accent text-accent bg-accent/10" : "border-border text-text-dim hover:text-text"
              )}
              title={`GID ${ref.firstGid}+`}
            >
              {asset?.name ?? ref.tilesetId}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={importTileset}
          className="flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md border border-border text-xs text-text-dim hover:text-text hover:border-text-dim"
        >
          <ImagePlus size={12} />
          Add
        </button>
        <button
          onClick={removeActiveTileset}
          disabled={!activeRef}
          className="flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md border border-border text-xs text-text-dim hover:text-text hover:border-text-dim disabled:opacity-40"
        >
          <Trash2 size={12} />
          Remove
        </button>
        <div className="flex-1" />
        <span className="text-xs text-text-dim">Zoom</span>
        <input
          type="range"
          min={1}
          max={6}
          step={0.5}
          value={floor.paletteZoom}
          onChange={event => setPaletteZoom(Number(event.target.value))}
          className="w-16"
        />
      </div>

      {!activeAsset || !activeRef ? (
        <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-text-dim">
          No tileset attached
        </div>
      ) : (
        <>
          <div className="text-xs text-text-dim">
            Local tile {selectedLocals.size === 1 ? [...selectedLocals][0] : `${selectedLocals.size} selected`} · GID {floor.selectedTileIds[0] ?? 0}
          </div>
          <div className="overflow-auto rounded-md border border-border bg-bg/70 max-h-36">
            <div
              className="relative"
              style={{
                width: activeAsset.columns * activeAsset.tileWidth * floor.paletteZoom,
                height: Math.ceil(activeAsset.tileCount / activeAsset.columns) * activeAsset.tileHeight * floor.paletteZoom,
              }}
              onMouseLeave={() => setDragStart(null)}
            >
              <img
                src={activeAsset.texturePath}
                alt={activeAsset.name}
                draggable={false}
                className="absolute inset-0 select-none"
                style={{
                  width: activeAsset.columns * activeAsset.tileWidth * floor.paletteZoom,
                  height: Math.ceil(activeAsset.tileCount / activeAsset.columns) * activeAsset.tileHeight * floor.paletteZoom,
                  imageRendering: "pixelated",
                }}
              />
              {Array.from({ length: activeAsset.tileCount }, (_, localId) => {
                const x = localId % activeAsset.columns
                const y = Math.floor(localId / activeAsset.columns)
                const selected = selectedLocals.has(localId)
                return (
                  <button
                    key={localId}
                    type="button"
                    title={`Local ${localId} · GID ${activeRef.firstGid + localId}`}
                    onMouseDown={event => {
                      event.preventDefault()
                      setDragStart(localId)
                      selectRect(localId, localId)
                    }}
                    onMouseEnter={() => {
                      if (dragStart !== null) selectRect(dragStart, localId)
                    }}
                    onMouseUp={() => setDragStart(null)}
                    className={cn(
                      "absolute border border-black/30",
                      selected ? "ring-2 ring-accent ring-inset bg-accent/20" : "hover:ring-1 hover:ring-white/80"
                    )}
                    style={{
                      left: x * activeAsset.tileWidth * floor.paletteZoom,
                      top: y * activeAsset.tileHeight * floor.paletteZoom,
                      width: activeAsset.tileWidth * floor.paletteZoom,
                      height: activeAsset.tileHeight * floor.paletteZoom,
                    }}
                  />
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function AssetBrowser() {
  const [tab, setTab] = useState<Tab>("tilesets")
  const addProp = useEditorStore(s => s.addProp)
  const setSelection = useEditorStore(s => s.setSelection)

  const spawnProp = (assetId: string) => {
    const id = addProp({ x: 0, y: 0, assetId })
    setSelection([id])
  }

  return (
    <div className="flex flex-col border-t border-border shrink-0" style={{ height: 300 }}>
      <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-dim uppercase tracking-widest">Assets</span>
        <button className="text-text-dim hover:text-text transition-colors">
          <X size={13} />
        </button>
      </div>

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

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {tab === "tilesets" ? (
          <TilesetPalette />
        ) : (
          <>
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
            <button className="w-full mt-2 py-2 text-xs text-text-dim hover:text-text border border-dashed border-border hover:border-text-dim rounded-md transition-colors flex items-center justify-center gap-1.5">
              <Plus size={11} />
              Add Asset
            </button>
          </>
        )}
      </div>
    </div>
  )
}
