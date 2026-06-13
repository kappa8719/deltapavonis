import { describe, expect, test } from "bun:test"
import {
  buildWallPolygonGeometry,
  buildWallRenderCache,
  buildWallTerminalLookup,
  getNaiveTerminalCorners,
} from "../src/lib/map-geometry"
import type { MapDocument, Vec2, Wall } from "../src/types"

function createWall(id: string, start: Vec2, end: Vec2, thickness = 8): Wall {
  return {
    id,
    kind: "wall",
    start,
    end,
    thickness,
    openings: [],
  }
}

function expectVec(point: Vec2, expected: Vec2, epsilon = 0.001) {
  expect(point.x).toBeCloseTo(expected.x, Math.abs(Math.log10(epsilon)))
  expect(point.y).toBeCloseTo(expected.y, Math.abs(Math.log10(epsilon)))
}

function buildLookup(document: MapDocument) {
  return buildWallTerminalLookup(buildWallPolygonGeometry(document))
}

describe("wall junction geometry", () => {
  test("computes clean miters for a right-angle corner", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    const document: MapDocument = {
      walls: [east, north],
      wallPolygons: [
        {
          id: "corner",
          members: [
            { wallId: east.id, end: "start" },
            { wallId: north.id, end: "start" },
          ],
        },
      ],
      props: [],
      referenceImages: [],
    }

    const geometry = buildWallPolygonGeometry(document)
    const lookup = buildWallTerminalLookup(geometry)

    expect(geometry).toHaveLength(1)
    expect(geometry[0].fills).toHaveLength(1)
    expectVec(lookup[east.id]!.start!.left, { x: 4, y: 4 })
    expectVec(lookup[north.id]!.start!.right, { x: 4, y: 4 })
    expectVec(lookup[east.id]!.start!.right, { x: -4, y: -4 })
    expectVec(lookup[north.id]!.start!.left, { x: -4, y: -4 })
  })

  test("falls back to bevel when the miter exceeds the limit", () => {
    const base = createWall("base", { x: 0, y: 0 }, { x: 10, y: 0 })
    const acute = createWall("acute", { x: 0, y: 0 }, { x: 10, y: 1.2 })
    const document: MapDocument = {
      walls: [base, acute],
      wallPolygons: [
        {
          id: "acute",
          members: [
            { wallId: base.id, end: "start" },
            { wallId: acute.id, end: "start" },
          ],
        },
      ],
      props: [],
      referenceImages: [],
    }

    const geometry = buildWallPolygonGeometry(document)
    const lookup = buildWallTerminalLookup(geometry)
    const naiveBase = getNaiveTerminalCorners(base, "start")

    expect(geometry[0].fills.some(fill => fill.points.length === 3)).toBe(true)
    expectVec(lookup[base.id]!.start!.left, naiveBase.left)
  })

  test("supports unequal widths in a miter seam", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 }, 8)
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 }, 12)
    const lookup = buildLookup({
      walls: [east, north],
      wallPolygons: [
        {
          id: "corner",
          members: [
            { wallId: east.id, end: "start" },
            { wallId: north.id, end: "start" },
          ],
        },
      ],
      props: [],
      referenceImages: [],
    })

    expectVec(lookup[east.id]!.start!.left, { x: 6, y: 4 })
    expectVec(lookup[north.id]!.start!.right, { x: 6, y: 4 })
  })

  test("emits the expected fills for a three-way T junction", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 12, y: 0 })
    const west = createWall("west", { x: 0, y: 0 }, { x: -12, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 12 })
    const geometry = buildWallPolygonGeometry({
      walls: [east, west, north],
      wallPolygons: [
        {
          id: "tee",
          members: [
            { wallId: east.id, end: "start" },
            { wallId: west.id, end: "start" },
            { wallId: north.id, end: "start" },
          ],
        },
      ],
      props: [],
      referenceImages: [],
    })

    expect(geometry[0].fills).toHaveLength(2)
  })

  test("does not emit fill for a reflex two-wall sector", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    const geometry = buildWallPolygonGeometry({
      walls: [east, north],
      wallPolygons: [
        {
          id: "corner",
          members: [
            { wallId: east.id, end: "start" },
            { wallId: north.id, end: "start" },
          ],
        },
      ],
      props: [],
      referenceImages: [],
    })

    expect(geometry[0].fills).toEqual([
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 4 },
          { x: 4, y: 0 },
        ],
      },
    ])
  })

  test("emits four sectors for a cross junction", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 12, y: 0 })
    const west = createWall("west", { x: 0, y: 0 }, { x: -12, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 12 })
    const south = createWall("south", { x: 0, y: 0 }, { x: 0, y: -12 })
    const geometry = buildWallPolygonGeometry({
      walls: [east, west, north, south],
      wallPolygons: [
        {
          id: "cross",
          members: [
            { wallId: east.id, end: "start" },
            { wallId: west.id, end: "start" },
            { wallId: north.id, end: "start" },
            { wallId: south.id, end: "start" },
          ],
        },
      ],
      props: [],
      referenceImages: [],
    })

    expect(geometry[0].fills).toHaveLength(4)
  })

  test("builds stable geometry for a closed loop", () => {
    const top = createWall("top", { x: -10, y: -10 }, { x: 10, y: -10 })
    const right = createWall("right", { x: 10, y: -10 }, { x: 10, y: 10 })
    const bottom = createWall("bottom", { x: -10, y: 10 }, { x: 10, y: 10 })
    const left = createWall("left", { x: -10, y: 10 }, { x: -10, y: -10 })
    const geometry = buildWallPolygonGeometry({
      walls: [top, right, bottom, left],
      wallPolygons: [
        { id: "tl", members: [{ wallId: top.id, end: "start" }, { wallId: left.id, end: "end" }] },
        { id: "tr", members: [{ wallId: top.id, end: "end" }, { wallId: right.id, end: "start" }] },
        { id: "br", members: [{ wallId: bottom.id, end: "end" }, { wallId: right.id, end: "end" }] },
        { id: "bl", members: [{ wallId: bottom.id, end: "start" }, { wallId: left.id, end: "start" }] },
      ],
      props: [],
      referenceImages: [],
    })

    expect(geometry).toHaveLength(4)
    for (const polygon of geometry) {
      for (const terminal of polygon.terminals) {
        expect(Number.isFinite(terminal.corners.left.x)).toBe(true)
        expect(Number.isFinite(terminal.corners.left.y)).toBe(true)
        expect(Number.isFinite(terminal.corners.right.x)).toBe(true)
        expect(Number.isFinite(terminal.corners.right.y)).toBe(true)
      }
    }
  })

  test("builds a single merged polygon for a joined corner group", () => {
    const east = createWall("east", { x: 0, y: 0 }, { x: 10, y: 0 })
    const north = createWall("north", { x: 0, y: 0 }, { x: 0, y: 10 })
    const cache = buildWallRenderCache({
      walls: [east, north],
      wallPolygons: [
        {
          id: "corner",
          members: [
            { wallId: east.id, end: "start" },
            { wallId: north.id, end: "start" },
          ],
        },
      ],
      props: [],
      referenceImages: [],
    })

    expect(cache.wallGroups).toHaveLength(1)
    expect(cache.wallGroups[0].polygons).toHaveLength(1)
    expect(cache.wallGroups[0].polygons[0].holes).toEqual([])
    expect(cache.wallGroups[0].polygons[0].outer).toContainEqual({ x: 4, y: 4 })
    expect(cache.wallGroups[0].polygons[0].outer).toContainEqual({ x: -4, y: -4 })
    expect(cache.wallGroups[0].polygons[0].outer).toContainEqual({ x: 10, y: -4 })
    expect(cache.wallGroups[0].polygons[0].outer).toContainEqual({ x: -4, y: 10 })
  })

  test("uses joined terminals when building an acute apex wall group", () => {
    const left = createWall("left", { x: -20, y: 20 }, { x: 0, y: 0 })
    const right = createWall("right", { x: 0, y: 0 }, { x: 20, y: 20 })
    const cache = buildWallRenderCache({
      walls: [left, right],
      wallPolygons: [
        {
          id: "apex",
          members: [
            { wallId: left.id, end: "end" },
            { wallId: right.id, end: "start" },
          ],
        },
      ],
      props: [],
      referenceImages: [],
    })

    expect(cache.wallGroups).toHaveLength(1)
    expect(cache.wallGroups[0].polygons).toHaveLength(1)
    expect(cache.wallGroups[0].polygons[0].holes).toEqual([])
    expect(cache.wallGroups[0].polygons[0].outer).toContainEqual({ x: 0, y: -5.65685424949238 })
    expect(cache.wallGroups[0].polygons[0].outer).toContainEqual({ x: 0, y: 5.65685424949238 })
  })

  test("preserves inner holes for a closed wall loop", () => {
    const top = createWall("top", { x: -10, y: -10 }, { x: 10, y: -10 })
    const right = createWall("right", { x: 10, y: -10 }, { x: 10, y: 10 })
    const bottom = createWall("bottom", { x: -10, y: 10 }, { x: 10, y: 10 })
    const left = createWall("left", { x: -10, y: 10 }, { x: -10, y: -10 })
    const cache = buildWallRenderCache({
      walls: [top, right, bottom, left],
      wallPolygons: [
        { id: "tl", members: [{ wallId: top.id, end: "start" }, { wallId: left.id, end: "end" }] },
        { id: "tr", members: [{ wallId: top.id, end: "end" }, { wallId: right.id, end: "start" }] },
        { id: "br", members: [{ wallId: bottom.id, end: "end" }, { wallId: right.id, end: "end" }] },
        { id: "bl", members: [{ wallId: bottom.id, end: "start" }, { wallId: left.id, end: "start" }] },
      ],
      props: [],
      referenceImages: [],
    })

    expect(cache.wallGroups).toHaveLength(1)
    expect(cache.wallGroups[0].polygons).toHaveLength(1)
    expect(cache.wallGroups[0].polygons[0].holes).toHaveLength(1)
    expect(cache.wallGroups[0].polygons[0].holes).toContainEqual([
      { x: 6, y: -6 },
      { x: -6, y: -6 },
      { x: -6, y: 6 },
      { x: 6, y: 6 },
    ])
  })
})
