import { describe, expect, it } from 'vitest'

import { parseEndPose, rotationMatrixToQuaternionXyzw } from './end_pose.js'

describe('parseEndPose', () => {
  it('parses the M3DGR end pose layout with blank lines and bag_time', () => {
    const parsed = parseEndPose(
      [
        '',
        '',
        '',
        '0.98990358  0.00487201  0.1416586',
        '-0.00561383  0.99997254  0.00483748',
        '-0.14163115 -0.00558389  0.98990375',
        '',
        '0.00714665',
        '-0.00422712',
        '0.00114489',
        '',
        'bag_time: 383s',
      ].join('\n'),
    )
    expect(parsed.position).toEqual({ x: 0.00714665, y: -0.00422712, z: 0.00114489 })
    expect(parsed.bagTimeSeconds).toBe(383)
    const [qx, qy, qz, qw] = parsed.quaternionXyzw
    expect(Math.hypot(qx, qy, qz, qw)).toBeCloseTo(1, 9)
    expect(qw).toBeGreaterThan(0)
    // Small rotation (~16 degrees around a mostly-Y axis): small x/z components.
    expect(Math.abs(qy)).toBeGreaterThan(Math.abs(qx))
    expect(Math.abs(qy)).toBeGreaterThan(Math.abs(qz))
  })

  it('accepts comma separated values without bag_time', () => {
    const parsed = parseEndPose(
      ['1,0,0', '0,1,0', '0,0,1', '1.5,', ' -2,', '3'].join('\n'),
    )
    expect(parsed.position).toEqual({ x: 1.5, y: -2, z: 3 })
    expect(parsed.quaternionXyzw).toEqual([0, 0, 0, 1])
    expect(parsed.bagTimeSeconds).toBeNull()
  })

  it('rejects wrong element counts and non-numeric tokens', () => {
    expect(() => parseEndPose('1 2 3')).toThrow(/12 个数值/)
    expect(() => parseEndPose('1 2 3\n4 5 6\n7 8 9\n1\n2\nx')).toThrow(/无法解析数值/)
    expect(() => parseEndPose(
      '1 0 0\n0 1 0\n0 0 1\n0\n0\n0\nbag_time: abcs',
    )).toThrow(/bag_time/)
  })

  it('converts a known yaw rotation to the matching quaternion', () => {
    const angle = Math.PI / 3
    const quaternion = rotationMatrixToQuaternionXyzw([
      [Math.cos(angle), -Math.sin(angle), 0],
      [Math.sin(angle), Math.cos(angle), 0],
      [0, 0, 1],
    ])
    expect(quaternion[3]).toBeCloseTo(Math.cos(angle / 2), 9)
    expect(quaternion[2]).toBeCloseTo(Math.sin(angle / 2), 9)
    expect(quaternion[0]).toBeCloseTo(0, 9)
    expect(quaternion[1]).toBeCloseTo(0, 9)
  })
})
