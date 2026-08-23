import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

import type { TrajectoryPoint, TrajectoryResponse } from '../shared/contracts.js'

export function summarizeTrajectory(points: TrajectoryPoint[], maxPoints = 2_000): TrajectoryResponse {
  if (points.length === 0) throw new Error('轨迹文件没有有效位姿')
  let distanceMeters = 0
  let minX = points[0]!.x
  let maxX = minX
  let minY = points[0]!.y
  let maxY = minY
  let minZ = points[0]!.z
  let maxZ = minZ
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
    if (index > 0) {
      const previous = points[index - 1]!
      distanceMeters += Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z)
    }
  }
  const stride = Math.max(1, Math.ceil(points.length / maxPoints))
  const sampled = points.filter((_, index) => index % stride === 0)
  if (sampled.at(-1) !== points.at(-1)) sampled.push(points.at(-1)!)
  return {
    points: sampled,
    originalPointCount: points.length,
    distanceMeters,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
  }
}

export async function readTrajectory(filePath: string): Promise<TrajectoryResponse> {
  const input = createReadStream(filePath, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  const points: TrajectoryPoint[] = []
  let first = true
  for await (const line of lines) {
    if (first) {
      first = false
      continue
    }
    const [timestampNs, rawX, rawY, rawZ] = line.split(',')
    const x = Number(rawX)
    const y = Number(rawY)
    const z = Number(rawZ)
    if (timestampNs && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      points.push({ timestampNs, x, y, z })
    }
  }
  return summarizeTrajectory(points)
}
