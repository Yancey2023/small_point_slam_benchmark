import { readFile } from 'node:fs/promises'

import type { EndPoseResponse } from '../shared/contracts.js'

export interface ParsedEndPose {
  position: { x: number; y: number; z: number }
  quaternionXyzw: [number, number, number, number]
  bagTimeSeconds: number | null
}

/**
 * Parses a dataset "end pose" file: a 3x3 rotation matrix (row-major) followed
 * by a 3x1 translation, describing where the robot ended up relative to its
 * start frame, plus an optional `bag_time: NNs` duration line.
 */
export function parseEndPose(content: string): ParsedEndPose {
  const numbers: number[] = []
  let bagTimeSeconds: number | null = null
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const bagTime = line.match(/^bag_time\s*:\s*([0-9.]+)\s*s?$/i)
    if (bagTime) {
      bagTimeSeconds = Number(bagTime[1])
      if (!Number.isFinite(bagTimeSeconds)) throw new Error('bag_time 不是有效数字')
      continue
    }
    for (const token of line.split(/[\s,]+/).filter(Boolean)) {
      const value = Number(token)
      if (!Number.isFinite(value)) throw new Error(`无法解析数值：${token}`)
      numbers.push(value)
    }
  }

  if (numbers.length !== 12) {
    throw new Error(
      `终点位姿需要 3x3 旋转矩阵加 3x1 平移（12 个数值），实际读到 ${numbers.length} 个`,
    )
  }
  const [rotation, translation] = [numbers.slice(0, 9), numbers.slice(9)]
  if (!rotation.every((value) => Number.isFinite(value)) ||
      !translation.every((value) => Number.isFinite(value))) {
    throw new Error('终点位姿包含非有限数值')
  }

  return {
    position: { x: translation[0]!, y: translation[1]!, z: translation[2]! },
    quaternionXyzw: rotationMatrixToQuaternionXyzw([
      [rotation[0]!, rotation[1]!, rotation[2]!],
      [rotation[3]!, rotation[4]!, rotation[5]!],
      [rotation[6]!, rotation[7]!, rotation[8]!],
    ]),
    bagTimeSeconds,
  }
}

export function rotationMatrixToQuaternionXyzw(
  matrix: [[number, number, number], [number, number, number], [number, number, number]],
): [number, number, number, number] {
  const [m00, m01, m02] = matrix[0]
  const [m10, m11, m12] = matrix[1]
  const [m20, m21, m22] = matrix[2]
  const trace = m00 + m11 + m22
  let w: number
  let x: number
  let y: number
  let z: number
  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2
    w = 0.25 * scale
    x = (m21 - m12) / scale
    y = (m02 - m20) / scale
    z = (m10 - m01) / scale
  } else if (m00 > m11 && m00 > m22) {
    const scale = Math.sqrt(1 + m00 - m11 - m22) * 2
    w = (m21 - m12) / scale
    x = 0.25 * scale
    y = (m01 + m10) / scale
    z = (m02 + m20) / scale
  } else if (m11 > m22) {
    const scale = Math.sqrt(1 + m11 - m00 - m22) * 2
    w = (m02 - m20) / scale
    x = (m01 + m10) / scale
    y = 0.25 * scale
    z = (m12 + m21) / scale
  } else {
    const scale = Math.sqrt(1 + m22 - m00 - m11) * 2
    w = (m10 - m01) / scale
    x = (m02 + m20) / scale
    y = (m12 + m21) / scale
    z = 0.25 * scale
  }
  const length = Math.hypot(w, x, y, z)
  return [x / length, y / length, z / length, w / length]
}

export async function readEndPose(filePath: string): Promise<EndPoseResponse> {
  const parsed = parseEndPose(await readFile(filePath, 'utf8'))
  return {
    x: parsed.position.x,
    y: parsed.position.y,
    z: parsed.position.z,
    quaternionXyzw: parsed.quaternionXyzw,
    bagTimeSeconds: parsed.bagTimeSeconds,
  }
}
