import { access, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import type {
  BenchmarkResult,
  DatasetCatalogItem,
  ResultsResponse,
} from '../shared/contracts.js'
import type { RuntimeCatalog } from './catalog.js'
import { runModeInfo } from './run-modes.js'

function pathSegment(value: string): string {
  const safe = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
  return safe || 'unnamed'
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

interface StoredSummary {
  runMode: ReturnType<typeof runModeInfo>
  status: string
  reason: string | null
}

function parseCsvRow(line: string): string[] {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      values.push(value)
      value = ''
    } else {
      value += character
    }
  }
  values.push(value)
  return values
}

async function storedSummary(summaryPath: string): Promise<StoredSummary> {
  try {
    const [header = '', values = ''] = (await readFile(summaryPath, 'utf8')).split(/\r?\n/)
    const columns = parseCsvRow(header)
    const row = parseCsvRow(values)
    const statusIndex = columns.indexOf('status')
    const status = statusIndex < 0 ? 'completed' : row[statusIndex] || 'incomplete'
    return {
      runMode: runModeInfo(row[columns.indexOf('run_mode')]),
      status,
      reason: row[columns.indexOf('reason')]?.trim() || null,
    }
  } catch {
    return { runMode: runModeInfo(undefined), status: 'completed', reason: null }
  }
}

export function relativeResultDirectory(
  dataset: DatasetCatalogItem,
  algorithmName: string,
): string {
  return path.join(
    'results',
    `${pathSegment(dataset.datasetName)}-${pathSegment(dataset.bagName)}-${pathSegment(algorithmName)}`,
  )
}

function legacyRelativeResultDirectory(
  datasets: Iterable<DatasetCatalogItem>,
  dataset: DatasetCatalogItem,
  algorithmId: string,
): string {
  const sameDatasetCount = [...datasets].filter(
    (item) => item.datasetName === dataset.datasetName,
  ).length
  return path.join(
    'results',
    pathSegment(dataset.datasetName),
    ...(sameDatasetCount > 1 ? [pathSegment(dataset.bagName)] : []),
    pathSegment(algorithmId),
  )
}

export interface DiscoveredResult extends BenchmarkResult {
  absoluteOutputDirectory: string
  absoluteGroundTruthPath: string | null
  groundTruthMaxTimeDifferenceMs: number
}

export async function discoverResults(
  projectRoot: string,
  catalog: RuntimeCatalog,
): Promise<DiscoveredResult[]> {
  const results: DiscoveredResult[] = []
  for (const dataset of catalog.datasets.values()) {
    for (const algorithm of catalog.algorithms.values()) {
      const preferredDirectory = relativeResultDirectory(dataset, algorithm.name)
      const legacyDirectory = legacyRelativeResultDirectory(
        catalog.datasets.values(), dataset, algorithm.id,
      )
      const relativeDirectory = await exists(path.join(projectRoot, preferredDirectory))
        ? preferredDirectory
        : legacyDirectory
      const absoluteOutputDirectory = path.join(projectRoot, relativeDirectory)
      const trajectoryPath = path.join(absoluteOutputDirectory, 'final_trajectory.csv')
      const summaryPath = path.join(absoluteOutputDirectory, 'summary.csv')
      const performancePaths = [
        'summary.csv',
        'cpu.csv',
        'sensor_messages.csv',
        'timings.csv',
      ].map((fileName) => path.join(absoluteOutputDirectory, fileName))
      const [hasTrajectory, hasSummary, ...performanceFiles] = await Promise.all([
        exists(trajectoryPath),
        exists(summaryPath),
        ...performancePaths.map(exists),
      ])
      const summary = await storedSummary(summaryPath)
      const failed = summary.status === 'failed' || summary.status === 'incomplete'
      const successful = summary.status === 'completed'
      const visibleTrajectory = successful && hasTrajectory
      const hasPerformance = successful && performanceFiles.every(Boolean)
      if (!visibleTrajectory && !hasPerformance && !hasSummary) continue
      if (summary.status === 'unsupported' && !dataset.hasGroundTruth) {
        continue
      }
      const availableFiles = [
        ...(visibleTrajectory ? [trajectoryPath] : []),
        ...(hasSummary ? [summaryPath] : []),
        ...performancePaths.filter((_, index) => performanceFiles[index]),
      ]
      const modifiedTimes = await Promise.all(
        availableFiles.map(async (filePath) => (await stat(filePath)).mtimeMs),
      )
      const mode = summary.runMode
      results.push({
        id: Buffer.from(relativeDirectory.split(path.sep).join('/')).toString('base64url'),
        datasetId: dataset.id,
        datasetName: dataset.datasetName,
        bagName: dataset.bagName,
        algorithmId: algorithm.id,
        algorithmName: algorithm.name,
        runMode: mode.id,
        runModeName: mode.name,
        hasTrajectory: visibleTrajectory,
        hasPerformance,
        hasGroundTruth: dataset.hasGroundTruth,
        groundTruthFormat: dataset.groundTruthFormat,
        status: failed ? 'failed' : 'completed',
        failureReason: failed
          ? summary.reason ?? (summary.status === 'incomplete' ? '运行结果不完整' : '算法运行失败')
          : null,
        updatedAt: new Date(Math.max(...modifiedTimes)).toISOString(),
        absoluteOutputDirectory,
        absoluteGroundTruthPath: dataset.groundTruthPath,
        groundTruthMaxTimeDifferenceMs: dataset.groundTruthMaxTimeDifferenceMs,
      })
    }
  }
  return results.sort((left, right) =>
    left.datasetName.localeCompare(right.datasetName) ||
    left.bagName.localeCompare(right.bagName) ||
    left.algorithmName.localeCompare(right.algorithmName),
  )
}

export function publicResults(results: DiscoveredResult[]): ResultsResponse {
  return {
    results: results.map(
      ({ absoluteOutputDirectory: _directory,
        absoluteGroundTruthPath: _groundTruth,
        groundTruthMaxTimeDifferenceMs: _maxDifference, ...result }) => result,
    ),
  }
}
