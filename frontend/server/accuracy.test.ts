import { describe, expect, it } from 'vitest'

import { calculateAteRmse, calculateEndPointError } from './accuracy.js'

describe('ATE RMSE', () => {
  it('removes a rigid rotation and translation without scale correction', () => {
    const pairs = [
      { estimate: [0, 0, 0], reference: [10, -3, 2] },
      { estimate: [1, 0, 0], reference: [10, -2, 2] },
      { estimate: [1, 2, 0], reference: [8, -2, 2] },
      { estimate: [0, 2, 3], reference: [8, -3, 5] },
    ] as Array<{
      estimate: [number, number, number]
      reference: [number, number, number]
    }>
    expect(calculateAteRmse(pairs)).toBeLessThan(1e-9)
  })

  it('does not hide scale error', () => {
    const pairs = [
      { estimate: [0, 0, 0], reference: [0, 0, 0] },
      { estimate: [1, 0, 0], reference: [2, 0, 0] },
      { estimate: [0, 1, 0], reference: [0, 2, 0] },
    ] as Array<{
      estimate: [number, number, number]
      reference: [number, number, number]
    }>
    expect(calculateAteRmse(pairs)).toBeGreaterThan(0.5)
  })
})

describe('endpoint error', () => {
  it('measures straight-line distance to the true end pose', () => {
    expect(calculateEndPointError(
      { x: 3, y: 4, z: 12 },
      { x: 0, y: 0, z: 0 },
    )).toBeCloseTo(13, 9)
  })

  it('is zero when the algorithm ends exactly on the true end point', () => {
    expect(calculateEndPointError(
      { x: 1.25, y: -2.5, z: 0.75 },
      { x: 1.25, y: -2.5, z: 0.75 },
    )).toBe(0)
  })
})
