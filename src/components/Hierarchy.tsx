import { useEditorStore } from "../store"
import { cn } from "../lib/utils"
import {
  ChevronDown, ChevronRight, X, Search,
  Globe, Layers, Square, DoorOpen, AppWindow, Box,
} from "lucide-react"
import { useState } from "react"
import type { MapDocument } from "../types"

type GroupConfig = {
  key: keyof MapDocument
  prefix: string
  icon: React.FC<{ size?: number; className?: string }>
}

const GROUPS: GroupConfig[] = [
  { key: "walls",   prefix: "Wall",   icon: Square },
  { key: "doors",   prefix: "Door",   icon: DoorOpen },
  { key: "windows", prefix: "Window", icon: AppWindow },
  { key: "props",   prefix: "Prop",   icon: Box },
]

export function Hierarchy() {
  const document = useEditorStore(s => s.document)
  const selection = useEditorStore(s => s.selection)
  const setSelection = useEditorStore(s => s.setSelection)
  const getObjectName = useEditorStore(s => s.getObjectName)
  const [search, setSearch] = useState("")
  const [worldOpen, setWorldOpen] = useState(true)
  const [roomOpen, setRoomOpen] = useState(true)

  const allItems = GROUPS.flatMap(g =>
    (document[g.key] as { id: string }[]).map(item => ({
      id: item.id,
      name: getObjectName(item.id),
      icon: g.icon,
    }))
  )

  const filtered = search
    ? allItems.filter(item => item.name.toLowerCase().includes(search.toLowerCase()))
    : allItems

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-border shrink-0">
        <span className="text-[11px] font-semibold text-text-dim uppercase tracking-widest">Hierarchy</span>
        <button className="text-text-dim hover:text-text transition-colors">
          <X size={12} />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 shrink-0">
        <div className="flex items-center gap-1.5 bg-muted rounded px-2 py-1 border border-border/50">
          <Search size={10} className="text-text-dim shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-xs text-text placeholder-text-dim outline-none min-w-0"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-0.5">
        {/* World node */}
        <button
          onClick={() => setWorldOpen(v => !v)}
          className="flex items-center w-full px-2 py-0.5 gap-1 text-xs text-text-dim hover:text-text hover:bg-muted"
        >
          {worldOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <Globe size={11} className="text-text-dim/70" />
          <span className="font-medium">World</span>
        </button>

        {worldOpen && (
          <>
            {/* Room node */}
            <button
              onClick={() => setRoomOpen(v => !v)}
              className="flex items-center w-full pl-5 pr-2 py-0.5 gap-1 text-xs text-text-dim hover:text-text hover:bg-muted"
            >
              {roomOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              <Layers size={11} className="text-text-dim/70" />
              <span className="font-medium">Room_001</span>
            </button>

            {roomOpen && (
              <div>
                {filtered.length === 0 && (
                  <div className="pl-12 py-2 text-xs text-text-dim">
                    {search ? "No results" : "No objects"}
                  </div>
                )}
                {filtered.map(item => {
                  const Icon = item.icon
                  const isSelected = selection.includes(item.id)
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelection([item.id])}
                      className={cn(
                        "flex items-center w-full pl-9 pr-2 py-0.5 gap-1.5 text-xs truncate transition-colors",
                        isSelected
                          ? "bg-accent/20 text-accent"
                          : "text-text hover:bg-muted"
                      )}
                    >
                      <Icon size={10} className={isSelected ? "text-accent" : "text-text-dim"} />
                      <span className="truncate">{item.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
