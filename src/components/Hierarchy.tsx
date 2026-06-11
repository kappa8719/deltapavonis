import { useState } from "react"
import {
  AppWindow,
  Box,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Globe,
  Image,
  Layers,
  Search,
  Square,
  X,
} from "lucide-react"
import { useEditorStore } from "../store"
import { cn } from "../lib/utils"

type Item = {
  id: string
  name: string
  type: "wall" | "door" | "window" | "prop" | "referenceImage"
}

const ICONS = {
  wall: Square,
  door: DoorOpen,
  window: AppWindow,
  prop: Box,
  referenceImage: Image,
} satisfies Record<Item["type"], React.FC<{ size?: number; className?: string }>>

export function Hierarchy() {
  const document = useEditorStore(state => state.document)
  const selection = useEditorStore(state => state.selection)
  const setSelection = useEditorStore(state => state.setSelection)
  const getObjectName = useEditorStore(state => state.getObjectName)
  const [search, setSearch] = useState("")
  const [worldOpen, setWorldOpen] = useState(true)
  const [roomOpen, setRoomOpen] = useState(true)

  const items: Item[] = [
    ...document.walls.map(wall => ({
      id: wall.id,
      name: getObjectName(wall.id),
      type: "wall" as const,
    })),
    ...document.walls.flatMap(wall =>
      wall.openings.map(opening => ({
        id: opening.id,
        name: getObjectName(opening.id),
        type: opening.kind,
      }))
    ),
    ...document.props.map(prop => ({
      id: prop.id,
      name: getObjectName(prop.id),
      type: "prop" as const,
    })),
    ...document.referenceImages.map(img => ({
      id: img.id,
      name: getObjectName(img.id),
      type: "referenceImage" as const,
    })),
  ]

  const filtered = search
    ? items.filter(item => item.name.toLowerCase().includes(search.toLowerCase()))
    : items

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-dim uppercase tracking-widest">Hierarchy</span>
        <button className="text-text-dim hover:text-text transition-colors">
          <X size={13} />
        </button>
      </div>

      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2 border border-border/50">
          <Search size={12} className="text-text-dim shrink-0" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-sm text-text placeholder-text-dim outline-none min-w-0"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-0.5">
        <button
          onClick={() => setWorldOpen(value => !value)}
          className="flex items-center w-full px-3 py-1.5 gap-1.5 text-sm text-text-dim hover:text-text hover:bg-muted"
        >
          {worldOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Globe size={13} className="text-text-dim/70" />
          <span className="font-medium">World</span>
        </button>

        {worldOpen && (
          <>
            <button
              onClick={() => setRoomOpen(value => !value)}
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
                  const Icon = ICONS[item.type]
                  const isSelected = selection.includes(item.id)

                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelection([item.id])}
                      className={cn(
                        "flex items-center w-full pl-11 pr-3 py-1.5 gap-2 text-sm truncate transition-colors",
                        isSelected ? "bg-accent/20 text-accent" : "text-text hover:bg-muted"
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
