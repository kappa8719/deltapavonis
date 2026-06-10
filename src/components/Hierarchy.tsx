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
      <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-dim uppercase tracking-widest">Hierarchy</span>
        <button className="text-text-dim hover:text-text transition-colors">
          <X size={13} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2 border border-border/50">
          <Search size={12} className="text-text-dim shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-sm text-text placeholder-text-dim outline-none min-w-0"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-0.5">
        {/* World node */}
        <button
          onClick={() => setWorldOpen(v => !v)}
          className="flex items-center w-full px-3 py-1.5 gap-1.5 text-sm text-text-dim hover:text-text hover:bg-muted"
        >
          {worldOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Globe size={13} className="text-text-dim/70" />
          <span className="font-medium">World</span>
        </button>

        {worldOpen && (
          <>
            {/* Room node */}
            <button
              onClick={() => setRoomOpen(v => !v)}
              className="flex items-center w-full pl-7 pr-3 py-1.5 gap-1.5 text-sm text-text-dim hover:text-text hover:bg-muted"
            >
              {roomOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Layers size={13} className="text-text-dim/70" />
              <span className="font-medium">Room_001</span>
            </button>

            {roomOpen && (
              <div>
                {filtered.length === 0 && (
                  <div className="pl-14 py-3 text-sm text-text-dim">
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
                        "flex items-center w-full pl-11 pr-3 py-1.5 gap-2 text-sm truncate transition-colors",
                        isSelected
                          ? "bg-accent/20 text-accent"
                          : "text-text hover:bg-muted"
                      )}
                    >
                      <Icon size={11} className={isSelected ? "text-accent" : "text-text-dim"} />
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
