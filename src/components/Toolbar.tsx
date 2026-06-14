import {
  MousePointer2, Square, DoorOpen, AppWindow, Box,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Maximize2,
  Grid3x3, ChevronUp, ChevronDown, Play, Settings,
  ZoomIn, ZoomOut, ImagePlus, Download, Upload,
} from "lucide-react"
import { useEditorStore } from "../store"
import type { ActiveTool } from "../types"
import { cn } from "../lib/utils"
import { saveMap, loadMap, MapFormatError } from "../lib/map-format"

const tools: { id: ActiveTool; label: string; icon: React.FC<{ size?: number }> }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "wall",   label: "Wall",   icon: Square },
  { id: "door",   label: "Door",   icon: DoorOpen },
  { id: "window", label: "Window", icon: AppWindow },
  { id: "prop",   label: "Prop",   icon: Box },
]

function Divider() {
  return <div className="w-px h-6 bg-border mx-1.5 shrink-0" />
}

function IconBtn({ icon: Icon, title, onClick, active }: {
  icon: React.FC<{ size?: number }>
  title: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex items-center justify-center w-8 h-8 rounded-md text-sm transition-colors",
        active ? "bg-accent/20 text-accent" : "text-text-dim hover:text-text hover:bg-muted"
      )}
    >
      <Icon size={14} />
    </button>
  )
}

function ReferenceImageImportButton() {
  const addReferenceImage = useEditorStore(s => s.addReferenceImage)
  const setSelection = useEditorStore(s => s.setSelection)

  const handleImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = () => {
        const src = reader.result
        if (typeof src !== "string") return

        const img = new Image()
        img.onload = () => {
          const nw = img.naturalWidth
          const nh = img.naturalHeight
          // 1 source pixel = 1 world unit, so width/height = natural pixel dimensions
          const id = addReferenceImage({
            src,
            x: 0,
            y: 0,
            width: nw,
            height: nh,
            rotation: 0,
            opacity: 0.5,
            locked: false,
            naturalWidth: nw,
            naturalHeight: nh,
          })
          setSelection([id])
        }
        img.src = src
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  return (
    <IconBtn icon={ImagePlus} title="Import Reference Image" onClick={handleImport} />
  )
}

export function Toolbar() {
  const activeTool = useEditorStore(s => s.activeTool)
  const setActiveTool = useEditorStore(s => s.setActiveTool)
  const zoom = useEditorStore(s => s.zoom)
  const setZoom = useEditorStore(s => s.setZoom)
  const snapSize = useEditorStore(s => s.snapSize)
  const setSnapSize = useEditorStore(s => s.setSnapSize)
  const gridVisible = useEditorStore(s => s.gridVisible)
  const setGridVisible = useEditorStore(s => s.setGridVisible)
  const setCamera = useEditorStore(s => s.setCamera)
  const mapDoc = useEditorStore(s => s.document)
  const roomWidth = useEditorStore(s => s.roomWidth)
  const roomHeight = useEditorStore(s => s.roomHeight)
  const importMapAction = useEditorStore(s => s.importMap)

  const zoomPct = Math.round(zoom * 100)

  const resetView = () => {
    setZoom(1)
    setCamera(0, 0)
  }

  const handleExportMap = () => {
    if (!mapDoc) return
    const json = saveMap(mapDoc, { name: "untitled" }, {
      x: -roomWidth / 2,
      y: -roomHeight / 2,
      w: roomWidth,
      h: roomHeight,
    })
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = globalThis.document.createElement("a")
    a.href = url
    a.download = "map.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportMap = () => {
    const input = globalThis.document.createElement("input")
    input.type = "file"
    input.accept = ".json,application/json"
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result
        if (typeof text !== "string") return
        try {
          const result = loadMap(text)
          importMapAction(result)
        } catch (err) {
          if (err instanceof MapFormatError) {
            alert(`Failed to import map:\n${err.message}`)
          } else {
            alert(`Failed to import map: unexpected error`)
            console.error(err)
          }
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="flex items-center h-11 bg-panel border-b border-border px-4 gap-1.5 select-none shrink-0">
      {/* Branding */}
      <span className="text-text text-xs font-bold tracking-[0.14em] uppercase mr-2 whitespace-nowrap">
        DELTA PAVONIS
      </span>
      <Divider />

      {/* Tool buttons */}
      {tools.map(tool => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          className={cn(
            "flex items-center gap-2 px-3 h-8 rounded-md text-sm transition-colors whitespace-nowrap",
            activeTool === tool.id
              ? "bg-accent text-white"
              : "text-text-dim hover:text-text hover:bg-muted"
          )}
          title={tool.label}
        >
          <tool.icon size={13} />
          <span>{tool.label}</span>
        </button>
      ))}

      <Divider />

      {/* Import Reference Image */}
      <ReferenceImageImportButton />

      <Divider />

      {/* Alignment tools */}
      <IconBtn icon={AlignLeft}    title="Align Left" />
      <IconBtn icon={AlignCenter}  title="Align Center" />
      <IconBtn icon={AlignRight}   title="Align Right" />
      <IconBtn icon={AlignJustify} title="Distribute" />
      <IconBtn icon={Maximize2}    title="Fit to Room" onClick={resetView} />

      <Divider />

      {/* Zoom controls */}
      <IconBtn icon={ZoomOut} title="Zoom Out" onClick={() => setZoom(Math.max(0.1, zoom / 1.25))} />
      <button
        onClick={resetView}
        className="px-2.5 h-8 rounded-md text-sm text-text hover:bg-muted transition-colors font-mono min-w-[60px] text-center"
        title="Reset zoom (100%)"
      >
        {zoomPct}%
      </button>
      <IconBtn icon={ZoomIn} title="Zoom In" onClick={() => setZoom(Math.min(10, zoom * 1.25))} />

      <Divider />

      {/* Grid toggle */}
      <button
        onClick={() => setGridVisible(!gridVisible)}
        className={cn(
          "flex items-center gap-2 px-2.5 h-8 rounded-md text-sm transition-colors",
          gridVisible ? "text-text hover:bg-muted" : "text-text-dim hover:bg-muted"
        )}
        title="Toggle grid"
      >
        <Grid3x3 size={13} />
        <span>Grid</span>
      </button>

      {/* Snap control */}
      <div className="flex items-center gap-1.5 pl-2">
        <span className="text-sm text-text-dim">Snap</span>
        <span className="text-sm text-text font-mono min-w-[24px] text-center">{snapSize}</span>
        <div className="flex flex-col gap-px">
          <button
            onClick={() => setSnapSize(snapSize + 1)}
            className="text-text-dim hover:text-text leading-none"
          >
            <ChevronUp size={11} />
          </button>
          <button
            onClick={() => setSnapSize(snapSize - 1)}
            className="text-text-dim hover:text-text leading-none"
          >
            <ChevronDown size={11} />
          </button>
        </div>
      </div>

      <div className="flex-1" />

      {/* Import / Export */}
      <button
        onClick={handleImportMap}
        title="Import Map (.json)"
        className="flex items-center gap-2 px-2.5 h-8 rounded-md text-sm text-text-dim hover:text-text hover:bg-muted transition-colors"
      >
        <Upload size={13} />
        <span>Import</span>
      </button>
      <button
        onClick={handleExportMap}
        title="Export Map (.json)"
        className="flex items-center gap-2 px-2.5 h-8 rounded-md text-sm text-text-dim hover:text-text hover:bg-muted transition-colors"
      >
        <Download size={13} />
        <span>Export</span>
      </button>

      <Divider />

      {/* Play / Test */}
      <button className="flex items-center gap-2 px-3 h-8 rounded-md text-sm text-text-dim hover:text-text hover:bg-muted transition-colors">
        <Play size={12} />
        <span>Play / Test</span>
      </button>

      {/* Settings */}
      <button className="flex items-center gap-2 px-2.5 h-8 rounded-md text-sm text-text-dim hover:text-text hover:bg-muted transition-colors">
        <Settings size={13} />
        <span>Settings</span>
      </button>
    </div>
  )
}
