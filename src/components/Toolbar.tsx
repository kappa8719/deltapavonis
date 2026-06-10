import {
  MousePointer2, Square, DoorOpen, AppWindow, Box,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Maximize2,
  Grid3x3, ChevronUp, ChevronDown, Play, Settings,
  ZoomIn, ZoomOut,
} from "lucide-react"
import { useEditorStore } from "../store"
import type { ActiveTool } from "../types"
import { cn } from "../lib/utils"

const tools: { id: ActiveTool; label: string; icon: React.FC<{ size?: number }> }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "wall",   label: "Wall",   icon: Square },
  { id: "door",   label: "Door",   icon: DoorOpen },
  { id: "window", label: "Window", icon: AppWindow },
  { id: "prop",   label: "Prop",   icon: Box },
]

function Divider() {
  return <div className="w-px h-5 bg-border mx-1 shrink-0" />
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
        "flex items-center justify-center w-7 h-7 rounded text-xs transition-colors",
        active ? "bg-accent/20 text-accent" : "text-text-dim hover:text-text hover:bg-muted"
      )}
    >
      <Icon size={13} />
    </button>
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

  const zoomPct = Math.round(zoom * 100)

  const resetView = () => {
    setZoom(1)
    setCamera(0, 0)
  }

  return (
    <div className="flex items-center h-10 bg-panel border-b border-border px-3 gap-1 select-none shrink-0">
      {/* Branding */}
      <span className="text-text text-[11px] font-bold tracking-[0.12em] uppercase mr-2 whitespace-nowrap">
        DELTA PAVONIS
      </span>
      <Divider />

      {/* Tool buttons */}
      {tools.map(tool => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 h-7 rounded text-xs transition-colors whitespace-nowrap",
            activeTool === tool.id
              ? "bg-accent text-white"
              : "text-text-dim hover:text-text hover:bg-muted"
          )}
          title={tool.label}
        >
          <tool.icon size={12} />
          <span>{tool.label}</span>
        </button>
      ))}

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
        className="px-2 h-7 rounded text-xs text-text hover:bg-muted transition-colors font-mono min-w-[52px] text-center"
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
          "flex items-center gap-1.5 px-2 h-7 rounded text-xs transition-colors",
          gridVisible ? "text-text hover:bg-muted" : "text-text-dim hover:bg-muted"
        )}
        title="Toggle grid"
      >
        <Grid3x3 size={12} />
        <span>Grid</span>
      </button>

      {/* Snap control */}
      <div className="flex items-center gap-1 pl-2">
        <span className="text-xs text-text-dim">Snap</span>
        <span className="text-xs text-text font-mono min-w-[20px] text-center">{snapSize}</span>
        <div className="flex flex-col gap-px">
          <button
            onClick={() => setSnapSize(snapSize + 1)}
            className="text-text-dim hover:text-text leading-none"
          >
            <ChevronUp size={10} />
          </button>
          <button
            onClick={() => setSnapSize(snapSize - 1)}
            className="text-text-dim hover:text-text leading-none"
          >
            <ChevronDown size={10} />
          </button>
        </div>
      </div>

      <div className="flex-1" />

      {/* Play / Test */}
      <button className="flex items-center gap-1.5 px-3 h-7 rounded text-xs text-text-dim hover:text-text hover:bg-muted transition-colors">
        <Play size={11} />
        <span>Play / Test</span>
      </button>

      {/* Settings */}
      <button className="flex items-center gap-1.5 px-2 h-7 rounded text-xs text-text-dim hover:text-text hover:bg-muted transition-colors">
        <Settings size={12} />
        <span>Settings</span>
      </button>
    </div>
  )
}
