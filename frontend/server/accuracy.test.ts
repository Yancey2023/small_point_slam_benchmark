import { describe, expect, it } from 'vitest'

import { calculateAteRmse } from './accuracy.js'

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
