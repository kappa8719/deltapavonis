import { MousePointer2, Square, DoorOpen, AppWindow, Box } from "lucide-react"
import { useEditorStore } from "../store"
import type { ActiveTool } from "../types"
import { cn } from "../lib/utils"

const tools: { id: ActiveTool; label: string; icon: React.FC<{ size?: number }> }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "wall", label: "Wall", icon: Square },
  { id: "door", label: "Door", icon: DoorOpen },
  { id: "window", label: "Window", icon: AppWindow },
  { id: "prop", label: "Prop", icon: Box },
]

export function Toolbar() {
  const activeTool = useEditorStore(s => s.activeTool)
  const setActiveTool = useEditorStore(s => s.setActiveTool)

  return (
    <div className="flex items-center h-9 bg-panel border-b border-border px-2 gap-1 select-none shrink-0">
      <span className="text-text-dim text-xs font-semibold tracking-widest uppercase mr-3 pl-1">
        Delta Pavonis
      </span>
      <div className="w-px h-5 bg-border mx-1" />
      {tools.map(tool => (
        <button
          key={tool.id}
          onClick={() => setActiveTool(tool.id)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 h-6 rounded text-xs transition-colors",
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
    </div>
  )
}
