import { describe, expect, test } from "bun:test"
import { loadMap, saveMap } from "../src/lib/map-format"
import {
  canJoinWallSelection,
  deleteWall,
  getWallEndpointPosition,
  getWallPolygonForEndpoint,
  joinWallEndpoints,
  joinWallSelection,
  moveWallBody,
  moveWallPolygon,
  resolveWallJoinSelection,
  unjoinWallEndpoint,
} from "../src/lib/wall-topology"
import type { MapDocument, Vec2, Wall } from "../src/types"

function createWall(id: string, start: Vec2, end: Vec2): Wall {
  return {
    id,
    kind: "wall",
    start,
    end,
    thickness: 8,
    openings: [],
  }
}

function createDocument(walls: Wall[]): MapDocument {
  return {
    walls,
    wallPolygons: [],
    props: [],
    referenceImages: [],
  }
}

describe("wall topology model", () => {
  test("joining two free endpoints creates one polygon", () => {
    const first = createWall("a", { x: 0, y: 0 }, { x: 10, y: 0 })
    const second = createWall("b", { x: 0, y: 0 }, { x: 0, y: 10 })
    const document = joinWallEndpoints(
      createDocument([first, second]),
      { wallId: first.id, end: "start" },
      { wallId: second.id, end: "start" },
    )

    expect(document.wallPolygons).toHaveLength(1)
    expect(document.wallPolygons[0].members).toEqual([
      { wallId: "a", end: "start" },
      { wallId: "b", end: "start" },
    ])
  })

  test("adding a third endpoint extends an existing polygon", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    const west = createWall("west", { x: 0, y: 0 }, { x: -10, y: 0 })
    const firstJoin = joinWallEndpoints(
      createDocument([east, north, west]),
      { wallId: east.id, end: "start" },
      { wallId: north.id, end: "start" },
    )
    const secondJoin = joinWallEndpoints(
      firstJoin,
      { wallId: west.id, end: "start" },
      { wallId: east.id, end: "start" },
    )

    expect(secondJoin.wallPolygons).toHaveLength(1)
    expect(secondJoin.wallPolygons[0].members).toHaveLength(3)
  })

  test("joining into an existing polygon preserves the existing junction position", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    const west = createWall("west", { x: 5, y: 5 }, { x: -10, y: 5 })
    const corner = joinWallEndpoints(
      createDocument([east, north, west]),
      { wallId: east.id, end: "start" },
      { wallId: north.id, end: "start" },
    )

    const joined = joinWallEndpoints(
      corner,
      { wallId: east.id, end: "start" },
      { wallId: west.id, end: "start" },
    )

    expect(getWallEndpointPosition(joined.walls[0], "start")).toEqual({ x: 0, y: 0 })
    expect(getWallEndpointPosition(joined.walls[1], "start")).toEqual({ x: 0, y: 0 })
    expect(getWallEndpointPosition(joined.walls[2], "start")).toEqual({ x: 0, y: 0 })
  })

  test("a wall can participate in two different polygons", () => {
    const center = createWall("center", { x: 0, y: 0 }, { x: 10, y: 0 })
    const west = createWall("west", { x: 0, y: 0 }, { x: -10, y: 0 })
    const east = createWall("east", { x: 10, y: 0 }, { x: 20, y: 0 })

    let document = createDocument([center, west, east])
    document = joinWallEndpoints(document, { wallId: center.id, end: "start" }, { wallId: west.id, end: "start" })
    document = joinWallEndpoints(document, { wallId: center.id, end: "end" }, { wallId: east.id, end: "start" })

    expect(document.wallPolygons).toHaveLength(2)
    expect(getWallPolygonForEndpoint(document, center.id, "start")?.id).not.toBe(
      getWallPolygonForEndpoint(document, center.id, "end")?.id
    )
  })

  test("moving a junction updates every member endpoint", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    let document = joinWallEndpoints(
      createDocument([east, north]),
      { wallId: east.id, end: "start" },
      { wallId: north.id, end: "start" },
    )

    document = moveWallPolygon(document, document.wallPolygons[0].id, { x: 5, y: 7 })

    expect(getWallEndpointPosition(document.walls[0], "start")).toEqual({ x: 5, y: 7 })
    expect(getWallEndpointPosition(document.walls[1], "start")).toEqual({ x: 5, y: 7 })
  })

  test("selection-based join resolves one coincident endpoint per selected wall", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    const west = createWall("west", { x: 0, y: 0 }, { x: -10, y: 0 })
    const document = createDocument([east, north, west])

    expect(resolveWallJoinSelection(document, ["east", "north", "west"])).toEqual({
      members: [
        { wallId: "east", end: "start" },
        { wallId: "north", end: "start" },
        { wallId: "west", end: "start" },
      ],
      point: { x: 0, y: 0 },
    })
    expect(canJoinWallSelection(document, ["east", "north", "west"])).toBe(true)
  })

  test("selection-based join rejects ambiguous multi-corner wall selections", () => {
    const top = createWall("top", { x: 0, y: 0 }, { x: 10, y: 0 })
    const right = createWall("right", { x: 10, y: 0 }, { x: 10, y: 10 })
    const bottom = createWall("bottom", { x: 0, y: 10 }, { x: 10, y: 10 })
    const left = createWall("left", { x: 0, y: 0 }, { x: 0, y: 10 })
    const document = createDocument([top, right, bottom, left])

    expect(resolveWallJoinSelection(document, ["top", "right", "bottom", "left"])).toBeNull()
    expect(canJoinWallSelection(document, ["top", "right", "bottom", "left"])).toBe(false)
  })

  test("joining selected walls creates one polygon without drag-time auto-join", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    const west = createWall("west", { x: 0, y: 0 }, { x: -10, y: 0 })

    const document = joinWallSelection(
      createDocument([east, north, west]),
      ["east", "north", "west"],
    )

    expect(document.wallPolygons).toHaveLength(1)
    expect(document.wallPolygons[0].members).toEqual([
      { wallId: "east", end: "start" },
      { wallId: "north", end: "start" },
      { wallId: "west", end: "start" },
    ])
  })

  test("joining selected offset walls resolves the nearest corner and aligns endpoints", () => {
    const horizontal = createWall("horizontal", { x: 4, y: 0 }, { x: 14, y: 0 })
    const vertical = createWall("vertical", { x: 0, y: -10 }, { x: 0, y: -4 })

    const resolved = resolveWallJoinSelection(
      createDocument([horizontal, vertical]),
      ["horizontal", "vertical"],
    )

    expect(resolved).not.toBeNull()
    expect(resolved?.members).toEqual([
      { wallId: "horizontal", end: "start" },
      { wallId: "vertical", end: "end" },
    ])
    expect(resolved?.point).toEqual({ x: 0, y: 0 })

    const document = joinWallSelection(
      createDocument([horizontal, vertical]),
      ["horizontal", "vertical"],
    )

    expect(document.wallPolygons).toHaveLength(1)
    expect(getWallEndpointPosition(document.walls[0], "start")).toEqual({ x: 0, y: 0 })
    expect(getWallEndpointPosition(document.walls[1], "end")).toEqual({ x: 0, y: 0 })
  })

  test("dragging one wall in a joined group moves the whole connected wall set", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    let document = joinWallEndpoints(
      createDocument([east, north]),
      { wallId: east.id, end: "start" },
      { wallId: north.id, end: "start" },
    )

    document = moveWallBody(document, east.id, { x: 5, y: 7 })

    expect(getWallEndpointPosition(document.walls[0], "start")).toEqual({ x: 5, y: 7 })
    expect(getWallEndpointPosition(document.walls[0], "end")).toEqual({ x: 15, y: 7 })
    expect(getWallEndpointPosition(document.walls[1], "start")).toEqual({ x: 5, y: 7 })
    expect(getWallEndpointPosition(document.walls[1], "end")).toEqual({ x: 5, y: 17 })
  })

  test("unjoining removes one member and deletes at fewer than two members", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    const west = createWall("west", { x: 0, y: 0 }, { x: -10, y: 0 })
    let document = createDocument([east, north, west])
    document = joinWallEndpoints(document, { wallId: east.id, end: "start" }, { wallId: north.id, end: "start" })
    document = joinWallEndpoints(document, { wallId: west.id, end: "start" }, { wallId: east.id, end: "start" })

    document = unjoinWallEndpoint(document, west.id, "start")
    expect(document.wallPolygons).toHaveLength(1)
    expect(document.wallPolygons[0].members).toHaveLength(2)

    document = unjoinWallEndpoint(document, north.id, "start")
    expect(document.wallPolygons).toHaveLength(0)
  })

  test("deleting a wall cleans up affected polygons", () => {
    const center = createWall("center", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    const east = createWall("east", { x: 10, y: 0 }, { x: 20, y: 0 })

    let document = createDocument([center, north, east])
    document = joinWallEndpoints(document, { wallId: center.id, end: "start" }, { wallId: north.id, end: "start" })
    document = joinWallEndpoints(document, { wallId: center.id, end: "end" }, { wallId: east.id, end: "start" })

    document = deleteWall(document, center.id)

    expect(document.walls.map(wall => wall.id)).toEqual(["north", "east"])
    expect(document.wallPolygons).toHaveLength(0)
  })

  test("save/load round-trips editor wall polygons", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    const document = joinWallEndpoints(
      createDocument([east, north]),
      { wallId: east.id, end: "start" },
      { wallId: north.id, end: "start" },
    )

    const json = saveMap(document, { name: "test" }, { x: -20, y: -20, w: 40, h: 40 })
    const loaded = loadMap(json)

    expect(loaded.document.wallPolygons).toEqual(document.wallPolygons)
  })
})
