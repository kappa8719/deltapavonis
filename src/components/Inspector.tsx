import { useEditorStore } from "../store"
import { getObject, getObjectType } from "../types"
import type { Wall, Door, Window as MapWindow, Prop } from "../types"
import { cn } from "../lib/utils"

function FieldRow({
  label, value, onChange, unit, width = "w-14",
}: {
  label: string
  value: number
  onChange: (v: number) => void
  unit?: string
  width?: string
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={cn("text-text-dim text-sm shrink-0", width)}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 bg-muted border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent min-w-0"
      />
      {unit && <span className="text-text-dim text-sm shrink-0 w-4">{unit}</span>}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-4 pt-4 pb-2">
      <span className="text-xs font-semibold text-text-dim uppercase tracking-wide">{title}</span>
    </div>
  )
}

export function Inspector() {
  const document = useEditorStore(s => s.document)
  const selection = useEditorStore(s => s.selection)
  const updateObject = useEditorStore(s => s.updateObject)
  const deleteSelected = useEditorStore(s => s.deleteSelected)
  const getObjectName = useEditorStore(s => s.getObjectName)

  const id = selection[0]
  const obj = id ? getObject(document, id) : null
  const type = id ? getObjectType(document, id) : null
  const name = id ? getObjectName(id) : null

  const update = (patch: Partial<Wall & Door & MapWindow & Prop>) => {
    if (id) updateObject(id, patch)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center px-4 h-10 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-dim uppercase tracking-widest">Inspector</span>
      </div>

      {!obj ? (
        <div className="px-4 py-8 text-sm text-text-dim text-center">
          Nothing selected
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Object name */}
          <div className="px-4 py-3 border-b border-border">
            <div className="text-base font-semibold text-accent">{name}</div>
          </div>

          {/* Transform */}
          <SectionHeader title="Transform" />
          <div className="px-4 pb-2">
            <FieldRow label="X" value={obj.x} onChange={v => update({ x: v })} unit="u" />
            <FieldRow label="Y" value={obj.y} onChange={v => update({ y: v })} unit="u" />
            {type !== "prop" && (
              <>
                <FieldRow
                  label="W"
                  value={(obj as Wall).width}
                  onChange={v => update({ width: Math.max(1, v) })}
                  unit="u"
                />
                <FieldRow
                  label="H"
                  value={(obj as Wall).height}
                  onChange={v => update({ height: Math.max(1, v) })}
                  unit="u"
                />
              </>
            )}
            <FieldRow label="R" value={0} onChange={() => {}} unit="°" />
          </div>

          {/* Appearance (walls/doors/windows only) */}
          {type !== "prop" && (
            <>
              <div className="border-t border-border" />
              <SectionHeader title="Appearance" />
              <div className="px-4 pb-2">
                <div className="flex items-center gap-2 py-1">
                  <span className="text-text-dim text-sm w-16 shrink-0">Material</span>
                  <select className="flex-1 bg-muted border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent">
                    <option>Concrete_A</option>
                    <option>Concrete_B</option>
                    <option>Wood_A</option>
                    <option>Metal_A</option>
                    <option>Brick_A</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 py-1">
                  <span className="text-text-dim text-sm w-16 shrink-0">Color</span>
                  <div className="flex-1 h-8 bg-[#6b7684] rounded-md border border-border cursor-pointer hover:border-accent transition-colors" />
                </div>
              </div>
            </>
          )}

          {/* Properties (walls/doors/windows only) */}
          {type !== "prop" && (
            <>
              <div className="border-t border-border" />
              <SectionHeader title="Properties" />
              <div className="px-4 pb-2">
                <div className="flex items-center gap-2 py-1">
                  <span className="text-text-dim text-sm w-16 shrink-0">Thickness</span>
                  <input
                    type="number"
                    defaultValue={type === "wall" ? (obj as Wall).width : 8}
                    className="w-20 bg-muted border border-border rounded-md px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent"
                  />
                  <span className="text-text-dim text-sm">u</span>
                </div>
                <div className="flex items-center gap-2 py-1">
                  <span className="text-text-dim text-sm w-16 shrink-0">Collidable</span>
                  <input type="checkbox" defaultChecked />
                </div>
                <div className="flex items-center gap-2 py-1">
                  <span className="text-text-dim text-sm w-16 shrink-0">Visible</span>
                  <input type="checkbox" defaultChecked />
                </div>
              </div>
            </>
          )}

          {/* Prop info */}
          {type === "prop" && (
            <>
              <div className="border-t border-border" />
              <SectionHeader title="Appearance" />
              <div className="px-4 pb-2">
                <div className="flex items-center gap-2 py-1">
                  <span className="text-text-dim text-sm w-16 shrink-0">Asset</span>
                  <span className="text-sm text-text">{(obj as Prop).assetId}</span>
                </div>
              </div>
            </>
          )}

          {/* Delete */}
          <div className="px-4 py-4 border-t border-border mt-1">
            <button
              onClick={deleteSelected}
              className="w-full py-2 text-sm bg-red-800/80 hover:bg-red-700 text-white rounded-md transition-colors font-medium tracking-wide"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
