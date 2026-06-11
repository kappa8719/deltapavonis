import { useEditorStore } from "../store"
import { cn } from "../lib/utils"
import {
  canPlaceOpeningOnWall,
  wallLength,
} from "../lib/map-geometry"
import {
  getObject,
  getWallByOpeningId,
} from "../types"
import type { MapDocument, ObjectPatch, Prop, Wall, WallOpeningObject } from "../types"

function FieldRow({
  label,
  value,
  onChange,
  unit,
  width = "w-20",
  readOnly = false,
}: {
  label: string
  value: number
  onChange?: (value: number) => void
  unit?: string
  width?: string
  readOnly?: boolean
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={cn("text-text-dim text-sm shrink-0", width)}>{label}</span>
      <input
        type="number"
        value={value}
        readOnly={readOnly}
        onChange={event => onChange?.(Number(event.target.value))}
        className={cn(
          "flex-1 bg-muted border border-border rounded-md px-3 py-1.5 text-sm text-text min-w-0",
          readOnly ? "opacity-70 cursor-default" : "focus:outline-none focus:border-accent"
        )}
      />
      {unit && <span className="text-text-dim text-sm shrink-0 w-6">{unit}</span>}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-text-dim text-sm shrink-0 w-20">{label}</span>
      <span className="text-sm text-text">{value}</span>
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

function updateWall(
  wall: Wall,
  patch: ObjectPatch,
  updateObject: (id: string, patch: ObjectPatch) => void
) {
  updateObject(wall.id, {
    start: patch.start ?? wall.start,
    end: patch.end ?? wall.end,
    thickness: patch.thickness ?? wall.thickness,
  })
}

function OpeningInspector({
  document,
  opening,
  getObjectName,
  updateObject,
}: {
  document: MapDocument
  opening: WallOpeningObject
  getObjectName: (id: string) => string
  updateObject: (id: string, patch: ObjectPatch) => void
}) {
  const wall = getWallByOpeningId(document, opening.id)
  if (!wall) return null

  const updateOpening = (patch: Partial<Pick<WallOpeningObject, "offset" | "width">>) => {
    const nextWidth = patch.width ?? opening.width
    const nextOffset = patch.offset ?? opening.offset
    if (!canPlaceOpeningOnWall(wall, { offset: nextOffset, width: nextWidth }, opening.id)) {
      return
    }
    updateObject(opening.id, { offset: nextOffset, width: nextWidth })
  }

  return (
    <>
      <SectionHeader title="Opening" />
      <div className="px-4 pb-2">
        <InfoRow label="Type" value={opening.kind === "door" ? "Door" : "Window"} />
        <InfoRow label="Attached" value={getObjectName(wall.id)} />
        <FieldRow
          label="Offset"
          value={opening.offset}
          onChange={value => updateOpening({ offset: value })}
          unit="u"
        />
        <FieldRow
          label="Width"
          value={opening.width}
          onChange={value => updateOpening({ width: Math.max(1, value) })}
          unit="u"
        />
      </div>
    </>
  )
}

function WallInspector({
  wall,
  updateObject,
}: {
  wall: Wall
  updateObject: (id: string, patch: ObjectPatch) => void
}) {
  return (
    <>
      <SectionHeader title="Wall" />
      <div className="px-4 pb-2">
        <FieldRow
          label="Start X"
          value={wall.start.x}
          onChange={value => updateWall(wall, { start: { ...wall.start, x: value } }, updateObject)}
          unit="u"
        />
        <FieldRow
          label="Start Y"
          value={wall.start.y}
          onChange={value => updateWall(wall, { start: { ...wall.start, y: value } }, updateObject)}
          unit="u"
        />
        <FieldRow
          label="End X"
          value={wall.end.x}
          onChange={value => updateWall(wall, { end: { ...wall.end, x: value } }, updateObject)}
          unit="u"
        />
        <FieldRow
          label="End Y"
          value={wall.end.y}
          onChange={value => updateWall(wall, { end: { ...wall.end, y: value } }, updateObject)}
          unit="u"
        />
        <FieldRow label="Length" value={Math.round(wallLength(wall) * 100) / 100} unit="u" readOnly />
        <FieldRow
          label="Thickness"
          value={wall.thickness}
          onChange={value => updateObject(wall.id, { thickness: Math.max(1, value) })}
          unit="u"
        />
      </div>
    </>
  )
}

function PropInspector({
  prop,
  updateObject,
}: {
  prop: Prop
  updateObject: (id: string, patch: ObjectPatch) => void
}) {
  return (
    <>
      <SectionHeader title="Prop" />
      <div className="px-4 pb-2">
        <FieldRow label="X" value={prop.x} onChange={value => updateObject(prop.id, { x: value })} unit="u" />
        <FieldRow label="Y" value={prop.y} onChange={value => updateObject(prop.id, { y: value })} unit="u" />
        <InfoRow label="Asset" value={prop.assetId} />
      </div>
    </>
  )
}

export function Inspector() {
  const document = useEditorStore(state => state.document)
  const selection = useEditorStore(state => state.selection)
  const updateObject = useEditorStore(state => state.updateObject)
  const deleteSelected = useEditorStore(state => state.deleteSelected)
  const getObjectName = useEditorStore(state => state.getObjectName)

  const id = selection[0]
  const object = id ? getObject(document, id) : null
  const name = id ? getObjectName(id) : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-4 h-10 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-text-dim uppercase tracking-widest">Inspector</span>
      </div>

      {!object ? (
        <div className="px-4 py-8 text-sm text-text-dim text-center">Nothing selected</div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-base font-semibold text-accent">{name}</div>
          </div>

          {object.kind === "wall" && (
            <WallInspector wall={object} updateObject={updateObject} />
          )}

          {(object.kind === "door" || object.kind === "window") && (
            <OpeningInspector
              document={document}
              opening={object}
              getObjectName={getObjectName}
              updateObject={updateObject}
            />
          )}

          {object.kind === "prop" && (
            <PropInspector prop={object} updateObject={updateObject} />
          )}

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
