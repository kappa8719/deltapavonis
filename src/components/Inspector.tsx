import { useEditorStore } from "../store"
import { getObject, getObjectType } from "../types"
import type { Wall, Door, Window as MapWindow, Prop } from "../types"

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <span className="text-text-dim w-12 shrink-0">{label}</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 bg-muted border border-border rounded px-2 py-0.5 text-xs text-text focus:outline-none focus:border-accent w-0"
      />
    </div>
  )
}

export function Inspector() {
  const document = useEditorStore(s => s.document)
  const selection = useEditorStore(s => s.selection)
  const updateObject = useEditorStore(s => s.updateObject)
  const deleteSelected = useEditorStore(s => s.deleteSelected)

  const id = selection[0]
  const obj = id ? getObject(document, id) : null
  const type = id ? getObjectType(document, id) : null

  const update = (patch: Partial<Wall & Door & MapWindow & Prop>) => {
    if (id) updateObject(id, patch)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-text-dim uppercase tracking-widest border-b border-border">
        Inspector
      </div>
      {!obj ? (
        <div className="px-3 py-4 text-xs text-text-dim text-center">
          Nothing selected
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 py-1 mb-2">
            <span className="text-xs font-semibold text-accent capitalize">{type}</span>
            <div className="text-xs text-text-dim mt-0.5 font-mono">{id?.slice(0, 8)}</div>
          </div>
          <div className="border-t border-border pt-2">
            <div className="px-3 py-1 text-xs text-text-dim font-semibold">Transform</div>
            <NumField label="X" value={obj.x} onChange={v => update({ x: v })} />
            <NumField label="Y" value={obj.y} onChange={v => update({ y: v })} />
            {type !== "prop" && (
              <>
                <NumField
                  label="W"
                  value={(obj as Wall).width}
                  onChange={v => update({ width: Math.max(1, v) })}
                />
                <NumField
                  label="H"
                  value={(obj as Wall).height}
                  onChange={v => update({ height: Math.max(1, v) })}
                />
              </>
            )}
            {type === "prop" && (
              <div className="flex items-center gap-2 px-3 py-1">
                <span className="text-text-dim w-12 shrink-0">Asset</span>
                <span className="text-xs text-text">{(obj as Prop).assetId}</span>
              </div>
            )}
          </div>
          <div className="px-3 pt-4">
            <button
              onClick={deleteSelected}
              className="w-full py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded border border-red-900/50 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
