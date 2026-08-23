import { access, stat } from 'node:fs/promises'
import path from 'node:path'

import type {
  BenchmarkResult,
  DatasetCatalogItem,
  ResultsResponse,
} from '../shared/contracts.js'
import type { RuntimeCatalog } from './catalog.js'

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

export function relativeResultDirectory(
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
}

export async function discoverResults(
  projectRoot: string,
  catalog: RuntimeCatalog,
): Promise<DiscoveredResult[]> {
  const results: DiscoveredResult[] = []
  for (const dataset of catalog.datasets.values()) {
    for (const algorithm of catalog.algorithms.values()) {
      const relativeDirectory = relativeResultDirectory(
        catalog.datasets.values(),
        dataset,
        algorithm.id,
      )
      const absoluteOutputDirectory = path.join(projectRoot, relativeDirectory)
      const trajectoryPath = path.join(absoluteOutputDirectory, 'final_trajectory.csv')
      const performancePaths = [
        'summary.csv',
        'cpu.csv',
        'sensor_messages.csv',
        'timings.csv',
      ].map((fileName) => path.join(absoluteOutputDirectory, fileName))
      const [hasTrajectory, ...performanceFiles] = await Promise.all([
        exists(trajectoryPath),
        ...performancePaths.map(exists),
      ])
      const hasPerformance = performanceFiles.every(Boolean)
      if (!hasTrajectory && !hasPerformance) continue
      const availableFiles = [
        ...(hasTrajectory ? [trajectoryPath] : []),
        ...performancePaths.filter((_, index) => performanceFiles[index]),
      ]
      const modifiedTimes = await Promise.all(
        availableFiles.map(async (filePath) => (await stat(filePath)).mtimeMs),
      )
      results.push({
        id: Buffer.from(relativeDirectory.split(path.sep).join('/')).toString('base64url'),
        datasetId: dataset.id,
        datasetName: dataset.datasetName,
        bagName: dataset.bagName,
        algorithmId: algorithm.id,
        algorithmName: algorithm.name,
        hasTrajectory,
        hasPerformance,
        updatedAt: new Date(Math.max(...modifiedTimes)).toISOString(),
        absoluteOutputDirectory,
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
      ({ absoluteOutputDirectory: _directory, ...result }) => result,
    ),
  }
}
