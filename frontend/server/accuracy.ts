import { access } from 'node:fs/promises'

import type { AccuracyResponse, TrajectoryPoint } from '../shared/contracts.js'
import { readGroundTruthPoints, readTrajectoryPoints } from './trajectory.js'

interface Pair {
  estimate: [number, number, number]
  reference: [number, number, number]
}

export function failedAccuracy(reason: string): AccuracyResponse {
  return { status: 'failed', ateRmseMeters: null, matchedPoseCount: 0, reason }
}

function timestamp(point: TrajectoryPoint): bigint {
  return BigInt(point.timestampNs)
}

function associate(
  estimates: TrajectoryPoint[],
  references: TrajectoryPoint[],
  maxDifferenceMs: number,
): Pair[] {
  const sortedEstimates = [...estimates].sort((a, b) => timestamp(a) < timestamp(b) ? -1 : 1)
  const uniqueReferences = [...references]
    .sort((a, b) => timestamp(a) < timestamp(b) ? -1 : 1)
    .filter((point, index, points) => index === 0 || point.timestampNs !== points[index - 1]!.timestampNs)
  const maximumDifference = BigInt(Math.round(maxDifferenceMs * 1e6))
  const pairs: Pair[] = []
  let referenceIndex = 0
  for (const estimate of sortedEstimates) {
    const estimateTime = timestamp(estimate)
    while (
      referenceIndex + 1 < uniqueReferences.length &&
      timestamp(uniqueReferences[referenceIndex + 1]!) <= estimateTime
    ) referenceIndex += 1

    const candidates = [referenceIndex, referenceIndex + 1]
      .filter((index) => index < uniqueReferences.length)
      .map((index) => ({
        index,
        difference: timestamp(uniqueReferences[index]!) > estimateTime
          ? timestamp(uniqueReferences[index]!) - estimateTime
          : estimateTime - timestamp(uniqueReferences[index]!),
      }))
      .sort((left, right) => left.difference < right.difference ? -1 : 1)
    const nearest = candidates[0]
    if (!nearest || nearest.difference > maximumDifference) continue
    const reference = uniqueReferences[nearest.index]!
    pairs.push({
      estimate: [estimate.x, estimate.y, estimate.z],
      reference: [reference.x, reference.y, reference.z],
    })
    referenceIndex = nearest.index + 1
    if (referenceIndex >= uniqueReferences.length) break
  }
  return pairs
}

function largestEigenvector(matrix: number[][]): number[] {
  const values = matrix.map((row) => [...row])
  const vectors: number[][] = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, column) => row === column ? 1 : 0))
  for (let iteration = 0; iteration < 64; iteration += 1) {
    let p = 0
    let q = 1
    let maximum = 0
    for (let row = 0; row < 4; row += 1) {
      for (let column = row + 1; column < 4; column += 1) {
        const candidate = Math.abs(values[row]![column]!)
        if (candidate > maximum) {
          maximum = candidate
          p = row
          q = column
        }
      }
    }
    if (maximum < 1e-12) break
    const angle = 0.5 * Math.atan2(
      2 * values[p]![q]!,
      values[q]![q]! - values[p]![p]!,
    )
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    for (let index = 0; index < 4; index += 1) {
      const left = values[index]![p]!
      const right = values[index]![q]!
      values[index]![p] = cosine * left - sine * right
      values[index]![q] = sine * left + cosine * right
    }
    for (let index = 0; index < 4; index += 1) {
      const upper = values[p]![index]!
      const lower = values[q]![index]!
      values[p]![index] = cosine * upper - sine * lower
      values[q]![index] = sine * upper + cosine * lower
    }
    for (let index = 0; index < 4; index += 1) {
      const left = vectors[index]![p]!
      const right = vectors[index]![q]!
      vectors[index]![p] = cosine * left - sine * right
      vectors[index]![q] = sine * left + cosine * right
    }
  }
  let largest = 0
  for (let index = 1; index < 4; index += 1) {
    if (values[index]![index]! > values[largest]![largest]!) largest = index
  }
  return vectors.map((row) => row[largest]!)
}

function rotate([x, y, z]: [number, number, number], quaternion: number[]): [number, number, number] {
  const [w, qx, qy, qz] = quaternion as [number, number, number, number]
  return [
    (1 - 2 * (qy * qy + qz * qz)) * x + 2 * (qx * qy - w * qz) * y + 2 * (qx * qz + w * qy) * z,
    2 * (qx * qy + w * qz) * x + (1 - 2 * (qx * qx + qz * qz)) * y + 2 * (qy * qz - w * qx) * z,
    2 * (qx * qz - w * qy) * x + 2 * (qy * qz + w * qx) * y + (1 - 2 * (qx * qx + qy * qy)) * z,
  ]
}

export function calculateAteRmse(pairs: Pair[]): number {
  if (pairs.length < 3) throw new Error('可匹配位姿少于 3 个')
  const centroid = (key: keyof Pair): [number, number, number] => [0, 1, 2].map(
    (axis) => pairs.reduce((sum, pair) => sum + pair[key][axis]!, 0) / pairs.length,
  ) as [number, number, number]
  const estimateCenter = centroid('estimate')
  const referenceCenter = centroid('reference')
  const covariance = Array.from({ length: 3 }, () => [0, 0, 0])
  for (const pair of pairs) {
    const estimate = pair.estimate.map((value, axis) => value - estimateCenter[axis]!)
    const reference = pair.reference.map((value, axis) => value - referenceCenter[axis]!)
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        covariance[row]![column] += estimate[row]! * reference[column]!
      }
    }
  }
  const [[sxx, sxy, sxz], [syx, syy, syz], [szx, szy, szz]] = covariance as [number[], number[], number[]]
  const quaternion = largestEigenvector([
    [sxx! + syy! + szz!, syz! - szy!, szx! - sxz!, sxy! - syx!],
    [syz! - szy!, sxx! - syy! - szz!, sxy! + syx!, szx! + sxz!],
    [szx! - sxz!, sxy! + syx!, -sxx! + syy! - szz!, syz! + szy!],
    [sxy! - syx!, szx! + sxz!, syz! + szy!, -sxx! - syy! + szz!],
  ])
  const rotatedCenter = rotate(estimateCenter, quaternion)
  const translation = referenceCenter.map((value, axis) => value - rotatedCenter[axis]!)
  const squaredError = pairs.reduce((sum, pair) => {
    const aligned = rotate(pair.estimate, quaternion)
      .map((value, axis) => value + translation[axis]!)
    return sum + aligned.reduce(
      (pointSum, value, axis) => pointSum + (value - pair.reference[axis]!) ** 2,
      0,
    )
  }, 0)
  return Math.sqrt(squaredError / pairs.length)
}

export async function readAccuracy(
  trajectoryPath: string,
  groundTruthPath: string | null,
  maxDifferenceMs: number,
): Promise<AccuracyResponse> {
  if (!groundTruthPath) return failedAccuracy('数据集没有 ground truth')
  try {
    await access(trajectoryPath)
  } catch {
    return failedAccuracy('算法未生成有效轨迹')
  }
  try {
    await access(groundTruthPath)
  } catch {
    return failedAccuracy('ground truth 文件不可用')
  }
  try {
    const [estimates, references] = await Promise.all([
      readTrajectoryPoints(trajectoryPath),
      readGroundTruthPoints(groundTruthPath),
    ])
    if (estimates.length === 0) return failedAccuracy('算法未生成有效轨迹')
    if (references.length === 0) return failedAccuracy('ground truth 文件没有有效位姿')
    const pairs = associate(estimates, references, maxDifferenceMs)
    if (pairs.length < 3) return failedAccuracy('时间戳匹配失败（可匹配位姿少于 3 个）')
    const ateRmseMeters = calculateAteRmse(pairs)
    if (!Number.isFinite(ateRmseMeters)) return failedAccuracy('ATE RMSE 计算结果无效')
    return { status: 'success', ateRmseMeters, matchedPoseCount: pairs.length, reason: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return failedAccuracy(message
      .replaceAll(trajectoryPath, '算法轨迹文件')
      .replaceAll(groundTruthPath, 'ground truth 文件'))
  }
}
