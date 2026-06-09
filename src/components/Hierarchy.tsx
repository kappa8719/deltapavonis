import { useEditorStore } from "../store"
import { cn } from "../lib/utils"
import { ChevronRight } from "lucide-react"
import { useState } from "react"
import type { MapDocument } from "../types"

type Group = { label: string; key: keyof MapDocument }

const GROUPS: Group[] = [
  { label: "Walls", key: "walls" },
  { label: "Doors", key: "doors" },
  { label: "Windows", key: "windows" },
  { label: "Props", key: "props" },
]

export function Hierarchy() {
  const document = useEditorStore(s => s.document)
  const selection = useEditorStore(s => s.selection)
  const setSelection = useEditorStore(s => s.setSelection)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggle = (key: string) => setCollapsed(c => ({ ...c, [key]: !c[key] }))

  const total = GROUPS.reduce((n, g) => n + document[g.key].length, 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-text-dim uppercase tracking-widest border-b border-border">
        Hierarchy
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {total === 0 && (
          <div className="px-3 py-4 text-xs text-text-dim text-center">
            No objects
          </div>
        )}
        {GROUPS.map(group => {
          const items = document[group.key] as { id: string }[]
          if (items.length === 0) return null
          const isCollapsed = collapsed[group.key]
          return (
            <div key={group.key}>
              <button
                onClick={() => toggle(group.key)}
                className="flex items-center w-full px-2 py-0.5 text-xs text-text-dim hover:text-text hover:bg-muted gap-1"
              >
                <ChevronRight
                  size={10}
                  className={cn("transition-transform text-text-dim", !isCollapsed && "rotate-90")}
                />
                <span className="font-medium">{group.label}</span>
                <span className="ml-auto text-text-dim">{items.length}</span>
              </button>
              {!isCollapsed && items.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelection([item.id])}
                  className={cn(
                    "flex items-center w-full px-4 py-0.5 text-xs truncate transition-colors",
                    selection.includes(item.id)
                      ? "bg-accent/20 text-accent"
                      : "text-text hover:bg-muted"
                  )}
                >
                  {item.id.slice(0, 8)}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
