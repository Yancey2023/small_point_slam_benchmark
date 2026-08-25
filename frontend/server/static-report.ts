import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  StaticBenchmarkResult,
  StaticReport,
} from '../shared/contracts.js'
import { failedAccuracy, readAccuracy, readEndPoseAccuracy } from './accuracy.js'
import { loadCatalog } from './catalog.js'
import { readEndPose } from './end_pose.js'
import { readPerformance } from './performance.js'
import { discoverResults } from './results.js'
import { readGroundTruth, readTrajectory } from './trajectory.js'

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export async function buildStaticReport(
  projectRoot: string,
  buildDirectory = path.join(projectRoot, 'build', 'algorithms'),
): Promise<StaticReport> {
  const runtimeCatalog = await loadCatalog(projectRoot, buildDirectory)
  const discovered = await discoverResults(projectRoot, runtimeCatalog)
  const results: StaticBenchmarkResult[] = []
  const groundTruth: StaticReport['groundTruth'] = {}
  const endPoses: StaticReport['endPoses'] = {}

  for (const dataset of runtimeCatalog.datasets.values()) {
    if (!dataset.hasGroundTruth || !dataset.groundTruthPath) continue
    if (dataset.groundTruthFormat === 'end_pose') {
      endPoses[dataset.id] = await readEndPose(dataset.groundTruthPath)
    } else {
      groundTruth[dataset.id] = await readGroundTruth(dataset.groundTruthPath)
    }
  }

  // Keep peak memory bounded: timing CSV files can be large, so precompute one
  // result at a time instead of parsing every algorithm concurrently.
  for (const discoveredResult of discovered) {
    const {
      absoluteOutputDirectory,
      absoluteGroundTruthPath,
      groundTruthMaxTimeDifferenceMs,
      ...result
    } = discoveredResult
    const trajectory = result.hasTrajectory
      ? await readTrajectory(path.join(absoluteOutputDirectory, 'final_trajectory.csv'))
      : null
    results.push({
      ...result,
      ...(trajectory ? { trajectory } : {}),
      ...(result.hasPerformance
        ? { performance: await readPerformance(absoluteOutputDirectory) }
        : {}),
      ...(result.hasGroundTruth
        ? { accuracy: result.status === 'failed'
            ? failedAccuracy(result.failureReason ?? '算法运行失败')
            : result.groundTruthFormat === 'end_pose'
              ? await readEndPoseAccuracy(
                  path.join(absoluteOutputDirectory, 'final_trajectory.csv'),
                  absoluteGroundTruthPath ?? '',
                )
              : await readAccuracy(
                  path.join(absoluteOutputDirectory, 'final_trajectory.csv'),
                  absoluteGroundTruthPath,
                  groundTruthMaxTimeDifferenceMs,
                ) }
        : {}),
    })
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    catalog: {
      ...runtimeCatalog.response,
      buildDirectory: '静态报告（预计算）',
    },
    results,
    groundTruth,
    ...(Object.keys(endPoses).length > 0 ? { endPoses } : {}),
  }
}

export function validateStaticReport(value: unknown): asserts value is StaticReport {
  const report = record(value)
  if (!report || report.schemaVersion !== 1) {
    throw new Error('静态报告版本无效，需要重新生成 report.json')
  }
  if (!Number.isFinite(Date.parse(String(report.generatedAt ?? '')))) {
    throw new Error('静态报告缺少有效的生成时间')
  }
  const catalog = record(report.catalog)
  if (!catalog || !Array.isArray(catalog.datasets) || !Array.isArray(catalog.algorithms)) {
    throw new Error('静态报告缺少数据集或算法目录')
  }
  if (!Array.isArray(report.results)) {
    throw new Error('静态报告 results 必须是数组')
  }

  const groundTruth = record(report.groundTruth)
  if (report.groundTruth !== undefined && !groundTruth) {
    throw new Error('静态报告 Ground truth 必须按数据集 ID 保存')
  }
  for (const [datasetId, rawTrajectory] of Object.entries(groundTruth ?? {})) {
    const trajectory = record(rawTrajectory)
    if (!trajectory || !Array.isArray(trajectory.points) || trajectory.points.length === 0) {
      throw new Error(`静态报告数据集 ${datasetId} 缺少有效 Ground truth`)
    }
  }

  const endPoses = record(report.endPoses)
  if (report.endPoses !== undefined && !endPoses) {
    throw new Error('静态报告真实终点必须按数据集 ID 保存')
  }
  for (const [datasetId, rawEndPose] of Object.entries(endPoses ?? {})) {
    const endPose = record(rawEndPose)
    if (!endPose ||
        ![endPose.x, endPose.y, endPose.z].every((value) => typeof value === 'number' &&
          Number.isFinite(value)) ||
        !Array.isArray(endPose.quaternionXyzw)) {
      throw new Error(`静态报告数据集 ${datasetId} 缺少有效真实终点`)
    }
  }

  for (const [index, rawResult] of report.results.entries()) {
    const result = record(rawResult)
    if (!result || typeof result.id !== 'string' || typeof result.datasetId !== 'string' ||
        typeof result.algorithmId !== 'string') {
      throw new Error(`静态报告第 ${index + 1} 个结果缺少标识`)
    }
    if ('absoluteOutputDirectory' in result) {
      throw new Error(`静态报告结果 ${result.id} 泄露了本地输出路径`)
    }
    if (result.hasTrajectory === true) {
      const trajectory = record(result.trajectory)
      if (!trajectory || !Array.isArray(trajectory.points) || trajectory.points.length === 0) {
        throw new Error(`静态报告结果 ${result.id} 缺少预计算轨迹`)
      }
    }
    if (result.hasPerformance === true) {
      const performance = record(result.performance)
      if (!performance || !Array.isArray(performance.metrics)) {
        throw new Error(`静态报告结果 ${result.id} 缺少预计算性能指标`)
      }
      for (const rawMetric of performance.metrics) {
        const metric = record(rawMetric)
        if (!metric || typeof metric.id !== 'string' ||
            typeof metric.value !== 'number' || !Number.isFinite(metric.value)) {
          throw new Error(`静态报告结果 ${result.id} 包含无效性能指标`)
        }
      }
    }
    if (result.hasGroundTruth === true) {
      const accuracy = record(result.accuracy)
      if (!accuracy || !['success', 'failed'].includes(String(accuracy.status))) {
        throw new Error(`静态报告结果 ${result.id} 缺少预计算精度`)
      }
      if (accuracy.status === 'success' && String(accuracy.metric ?? 'ate') === 'end_pose') {
        if (typeof accuracy.endpointErrorMeters !== 'number' ||
            !Number.isFinite(accuracy.endpointErrorMeters)) {
          throw new Error(`静态报告结果 ${result.id} 包含无效终点误差`)
        }
      } else if (accuracy.status === 'success' &&
          (typeof accuracy.ateRmseMeters !== 'number' ||
           !Number.isFinite(accuracy.ateRmseMeters))) {
        throw new Error(`静态报告结果 ${result.id} 包含无效 ATE RMSE`)
      }
    }
  }
}

export async function writeStaticReport(
  report: StaticReport,
  outputPath: string,
): Promise<void> {
  validateStaticReport(report)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report)}\n`, 'utf8')
}

export async function readStaticReport(reportPath: string): Promise<StaticReport> {
  const value: unknown = JSON.parse(await readFile(reportPath, 'utf8'))
  validateStaticReport(value)
  return value
}
