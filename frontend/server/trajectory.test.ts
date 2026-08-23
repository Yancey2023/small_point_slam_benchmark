import { describe, expect, it } from 'vitest'

import { summarizeTrajectory } from './trajectory.js'

describe('summarizeTrajectory', () => {
  it('computes distance, bounds and preserves the last sampled point', () => {
    const result = summarizeTrajectory(
      [
        { timestampNs: '1', x: 0, y: 0, z: 0 },
        { timestampNs: '2', x: 3, y: 4, z: 0 },
        { timestampNs: '3', x: 3, y: 4, z: 12 },
      ],
      2,
    )
    expect(result.distanceMeters).toBe(17)
    expect(result.bounds).toEqual({ minX: 0, maxX: 3, minY: 0, maxY: 4, minZ: 0, maxZ: 12 })
    expect(result.points.at(-1)?.timestampNs).toBe('3')
  })
})
