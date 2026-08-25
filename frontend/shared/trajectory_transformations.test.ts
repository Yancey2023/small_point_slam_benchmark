import { describe, expect, it } from 'vitest'

import type { TrajectoryPoint, TrajectoryResponse } from './contracts'
import {
  alignGroundTruthToReference,
  initialPlanarDirection,
} from './trajectory_transformations'

function trajectory(...coordinates: Array<[number, number, number]>): TrajectoryResponse {
  const points: TrajectoryPoint[] = coordinates.map(([x, y, z], index) => ({
    timestampNs: String(index),
    x,
    y,
    z,
  }))
  return {
    points,
    originalPointCount: points.length,
    distanceMeters: 42,
    bounds: { minX: -9, maxX: 9, minY: -9, maxY: 9, minZ: -9, maxZ: 9 },
  }
}

describe('initialPlanarDirection', () => {
  it('uses the first point beyond the minimum distance', () => {
    const direction = initialPlanarDirection(
      trajectory([0, 0, 0], [0.1, 0, 0], [2, 3, 0]).points,
    )
    expect(direction).not.toBeNull()
    expect(direction!.x).toBeCloseTo(2 / Math.hypot(2, 3))
    expect(direction!.y).toBeCloseTo(3 / Math.hypot(2, 3))
  })

  it('returns null for stationary trajectories', () => {
    expect(initialPlanarDirection(trajectory([1, 1, 1], [1, 1, 1]).points)).toBeNull()
    expect(initialPlanarDirection([])).toBeNull()
  })
})

describe('alignGroundTruthToReference', () => {
  it('moves the ground-truth start to the origin without a reference', () => {
    const aligned = alignGroundTruthToReference(
      trajectory([10, -4, 7], [12, -4, 7], [14, -4, 7]),
    )
    expect(aligned.points[0]).toMatchObject({ x: 0, y: 0, z: 0 })
    expect(aligned.points[1]).toMatchObject({ x: 2, y: 0, z: 0 })
    expect(aligned.bounds.minX).toBe(0)
  })

  it('rotates the initial heading onto the reference heading', () => {
    // Ground truth walks toward +X; the reference walks toward +Y.
    const aligned = alignGroundTruthToReference(
      trajectory([5, 5, 0], [8, 5, 0], [11, 5, 0]),
      trajectory([0, 0, 0], [0, 3, 0], [0, 6, 0]),
    )
    const direction = initialPlanarDirection(aligned.points)!
    expect(direction.x).toBeCloseTo(0, 6)
    expect(direction.y).toBeCloseTo(1, 6)
    // The start still sits at the origin after rotating.
    expect(aligned.points[0]).toMatchObject({ x: 0, y: 0, z: 0 })
  })

  it('keeps timestamps, pose count, and path length', () => {
    const groundTruth = trajectory([1, 2, 3], [4, 2, 3], [7, 2, 3])
    const aligned = alignGroundTruthToReference(
      groundTruth,
      trajectory([0, 0, 0], [1, 1, 0]),
    )
    expect(aligned.originalPointCount).toBe(groundTruth.originalPointCount)
    expect(aligned.distanceMeters).toBe(groundTruth.distanceMeters)
    expect(aligned.points.map((point) => point.timestampNs))
      .toEqual(groundTruth.points.map((point) => point.timestampNs))
  })

  it('ignores degenerate references instead of producing NaN', () => {
    const aligned = alignGroundTruthToReference(
      trajectory([1, 1, 0], [3, 1, 0]),
      trajectory([5, 5, 0], [5, 5, 0]),
    )
    expect(aligned.points[0]).toMatchObject({ x: 0, y: 0 })
    expect(Number.isFinite(aligned.points[1]!.x)).toBe(true)
  })

  it('returns empty trajectories unchanged', () => {
    const empty = trajectory()
    expect(alignGroundTruthToReference(empty)).toBe(empty)
  })
})
