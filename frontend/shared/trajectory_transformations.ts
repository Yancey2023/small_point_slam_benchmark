import type { TrajectoryPoint, TrajectoryResponse } from './contracts.js'

export interface PlanarDirection {
  x: number
  y: number
}

/**
 * Unit direction of the first motion in the XY plane: the first point that is at
 * least `minDistanceMeters` away from the start, falling back to the last point
 * for short trajectories. Returns null when the trajectory never moves.
 */
export function initialPlanarDirection(
  points: readonly TrajectoryPoint[],
  minDistanceMeters = 0.5,
): PlanarDirection | null {
  const start = points[0]
  if (!start) return null
  for (const point of points) {
    const dx = point.x - start.x
    const dy = point.y - start.y
    const length = Math.hypot(dx, dy)
    if (length >= minDistanceMeters) return { x: dx / length, y: dy / length }
  }
  const last = points.at(-1)
  if (!last) return null
  const dx = last.x - start.x
  const dy = last.y - start.y
  const length = Math.hypot(dx, dy)
  return length > 1e-9 ? { x: dx / length, y: dy / length } : null
}

function computeBounds(points: readonly TrajectoryPoint[]): TrajectoryResponse['bounds'] {
  const values = points.flatMap((point) => [point.x, point.y, point.z])
  return {
    minX: Math.min(...values),
    maxX: Math.max(...values),
    minY: Math.min(...values),
    maxY: Math.max(...values),
    minZ: Math.min(...values),
    maxZ: Math.max(...values),
  }
}

/**
 * Places the ground-truth start at the origin and, when a reference algorithm
 * trajectory is given, rotates it in the XY plane so both initial headings match.
 * Timestamps, pose count, and path length are preserved by the rigid transform.
 */
export function alignGroundTruthToReference(
  groundTruth: TrajectoryResponse,
  reference?: TrajectoryResponse,
): TrajectoryResponse {
  const points = groundTruth.points
  const start = points[0]
  if (!start) return groundTruth

  let cos = 1
  let sin = 0
  if (reference?.points.length) {
    const groundTruthDirection = initialPlanarDirection(points)
    const referenceDirection = initialPlanarDirection(reference.points)
    if (groundTruthDirection && referenceDirection) {
      const crossZ =
        groundTruthDirection.x * referenceDirection.y -
        groundTruthDirection.y * referenceDirection.x
      const dot =
        groundTruthDirection.x * referenceDirection.x +
        groundTruthDirection.y * referenceDirection.y
      const angle = Math.atan2(crossZ, dot)
      cos = Math.cos(angle)
      sin = Math.sin(angle)
    }
  }

  const transformed = points.map((point) => {
    const x = point.x - start.x
    const y = point.y - start.y
    return {
      timestampNs: point.timestampNs,
      x: cos * x - sin * y,
      y: sin * x + cos * y,
      z: point.z - start.z,
    }
  })
  return { ...groundTruth, points: transformed, bounds: computeBounds(transformed) }
}
