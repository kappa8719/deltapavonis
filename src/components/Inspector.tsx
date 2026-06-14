import { useEditorStore } from "../store"
import { cn } from "../lib/utils"
import {
  polygonCentroid,
  wallLength,
} from "../lib/map-geometry"
import {
  getObject,
  isLinkedPolygonWall,
} from "../types"
import type { ObjectPatch, Opening, PolygonWall, Prop, ReferenceImage, Wall } from "../types"

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

function WallInspector({
  wall,
  updateObject,
  convertWallToPolygon,
}: {
  wall: Wall
  updateObject: (id: string, patch: ObjectPatch) => void
  convertWallToPolygon: (wallId: string) => string | null
}) {
  return (
    <>
      <SectionHeader title="Editor Wall" />
      <div className="px-4 pb-2">
        <FieldRow
          label="A X"
          value={wall.a.x}
          onChange={value => updateObject(wall.id, { a: { ...wall.a, x: value } })}
          unit="u"
        />
        <FieldRow
          label="A Y"
          value={wall.a.y}
          onChange={value => updateObject(wall.id, { a: { ...wall.a, y: value } })}
          unit="u"
        />
        <FieldRow
          label="B X"
          value={wall.b.x}
          onChange={value => updateObject(wall.id, { b: { ...wall.b, x: value } })}
          unit="u"
        />
        <FieldRow
          label="B Y"
          value={wall.b.y}
          onChange={value => updateObject(wall.id, { b: { ...wall.b, y: value } })}
          unit="u"
        />
        <FieldRow label="Length" value={Math.round(wallLength(wall) * 100) / 100} unit="u" readOnly />
        <FieldRow
          label="Thickness"
          value={wall.thickness}
          onChange={value => updateObject(wall.id, { thickness: Math.max(1, value) })}
          unit="u"
        />
        <InfoRow label="Polygon" value={wall.polygonWallId.slice(0, 8)} />
        <button
          onClick={() => convertWallToPolygon(wall.id)}
          className="mt-3 w-full py-2 text-sm bg-muted hover:bg-muted/70 text-text rounded-md border border-border transition-colors"
        >
          Convert to polygon
        </button>
      </div>
    </>
  )
}

function PolygonWallInspector({
  polygonWall,
  updateObject,
  readOnly,
}: {
  polygonWall: PolygonWall
  updateObject: (id: string, patch: ObjectPatch) => void
  readOnly: boolean
}) {
  const centroid = polygonCentroid(polygonWall.vertices)
  const updateVertex = (index: number, patch: Partial<{ x: number; y: number }>) => {
    const vertices = polygonWall.vertices.map((vertex, candidateIndex) =>
      candidateIndex === index ? { ...vertex, ...patch } : vertex
    )
    updateObject(polygonWall.id, { vertices })
  }

  return (
    <>
      <SectionHeader title="Polygon Wall" />
      <div className="px-4 pb-2">
        {readOnly && <InfoRow label="Linked" value="Editor wall controls this polygon" />}
        <FieldRow label="Vertices" value={polygonWall.vertices.length} readOnly />
        <FieldRow label="Center X" value={Math.round(centroid.x * 100) / 100} unit="u" readOnly />
        <FieldRow label="Center Y" value={Math.round(centroid.y * 100) / 100} unit="u" readOnly />
        <FieldRow
          label="Rotation"
          value={polygonWall.rotation}
          onChange={value => updateObject(polygonWall.id, { rotation: value })}
          unit="deg"
          readOnly={readOnly}
        />
        {!readOnly && polygonWall.vertices.map((vertex, index) => (
          <div key={index} className="pt-2">
            <div className="text-xs text-text-dim pb-1">Vertex {index + 1}</div>
            <FieldRow
              label="X"
              value={vertex.x}
              onChange={value => updateVertex(index, { x: value })}
              unit="u"
              width="w-10"
            />
            <FieldRow
              label="Y"
              value={vertex.y}
              onChange={value => updateVertex(index, { y: value })}
              unit="u"
              width="w-10"
            />
          </div>
        ))}
      </div>
    </>
  )
}

function OpeningInspector({
  opening,
  updateObject,
}: {
  opening: Opening
  updateObject: (id: string, patch: ObjectPatch) => void
}) {
  return (
    <>
      <SectionHeader title="Opening" />
      <div className="px-4 pb-2">
        <InfoRow label="Type" value={opening.kind === "door" ? "Door" : "Window"} />
        <FieldRow
          label="X"
          value={opening.position.x}
          onChange={value => updateObject(opening.id, { position: { ...opening.position, x: value } })}
          unit="u"
        />
        <FieldRow
          label="Y"
          value={opening.position.y}
          onChange={value => updateObject(opening.id, { position: { ...opening.position, y: value } })}
          unit="u"
        />
        <FieldRow
          label="Rotation"
          value={opening.rotation}
          onChange={value => updateObject(opening.id, { rotation: value })}
          unit="deg"
        />
        <FieldRow
          label="Width"
          value={opening.width}
          onChange={value => updateObject(opening.id, { width: Math.max(1, value) })}
          unit="u"
        />
        <FieldRow
          label="Depth"
          value={opening.depth}
          onChange={value => updateObject(opening.id, { depth: Math.max(1, value) })}
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

function ReferenceImageInspector({
  image,
  updateObject,
}: {
  image: ReferenceImage
  updateObject: (id: string, patch: ObjectPatch) => void
}) {
  return (
    <>
      <SectionHeader title="Reference Image" />
      <div className="px-4 pb-2">
        <FieldRow label="X" value={image.x} onChange={value => updateObject(image.id, { x: value })} unit="u" />
        <FieldRow label="Y" value={image.y} onChange={value => updateObject(image.id, { y: value })} unit="u" />
        <FieldRow
          label="Width"
          value={image.width}
          onChange={value => updateObject(image.id, { width: Math.max(1, value) })}
          unit="u"
        />
        <FieldRow
          label="Height"
          value={image.height}
          onChange={value => updateObject(image.id, { height: Math.max(1, value) })}
          unit="u"
        />
        <FieldRow
          label="Rotation"
          value={image.rotation}
          onChange={value => updateObject(image.id, { rotation: value })}
          unit="deg"
        />
        <FieldRow
          label="Opacity"
          value={Math.round(image.opacity * 100)}
          onChange={value => updateObject(image.id, { opacity: Math.max(0, Math.min(1, value / 100)) })}
          unit="%"
        />
      </div>
    </>
  )
}

export function Inspector() {
  const document = useEditorStore(state => state.document)
  const selection = useEditorStore(state => state.selection)
  const updateObject = useEditorStore(state => state.updateObject)
  const deleteSelected = useEditorStore(state => state.deleteSelected)
  const convertWallToPolygon = useEditorStore(state => state.convertWallToPolygon)
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
            <WallInspector wall={object} updateObject={updateObject} convertWallToPolygon={convertWallToPolygon} />
          )}

          {object.kind === "polygonWall" && (
            <PolygonWallInspector
              polygonWall={object}
              updateObject={updateObject}
              readOnly={isLinkedPolygonWall(document, object.id)}
            />
          )}

          {(object.kind === "door" || object.kind === "window") && (
            <OpeningInspector opening={object} updateObject={updateObject} />
          )}

          {object.kind === "prop" && (
            <PropInspector prop={object} updateObject={updateObject} />
          )}

          {object.kind === "referenceImage" && (
            <ReferenceImageInspector image={object} updateObject={updateObject} />
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
