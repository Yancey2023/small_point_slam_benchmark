import { access, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { parse } from 'yaml'

import type {
  AlgorithmCatalogItem,
  CatalogResponse,
  DatasetCatalogItem,
} from '../shared/contracts.js'
import { runModes } from './run-modes.js'

interface DatasetRuntimeItem extends DatasetCatalogItem {
  manifestPath: string
  bagPath: string
  groundTruthPath: string | null
  groundTruthMaxTimeDifferenceMs: number
}

interface AlgorithmRuntimeItem extends AlgorithmCatalogItem {
  configPath: string
  executablePath: string | null
}

export interface RuntimeCatalog {
  response: CatalogResponse
  datasets: Map<string, DatasetRuntimeItem>
  algorithms: Map<string, AlgorithmRuntimeItem>
}

type YamlRecord = Record<string, unknown>

function record(value: unknown): YamlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as YamlRecord)
    : {}
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function findNamedFiles(directory: string, fileName: string): Promise<string[]> {
  if (!(await exists(directory))) return []
  const results: string[] = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await findNamedFiles(entryPath, fileName)))
    } else if (entry.isFile() && entry.name === fileName) {
      results.push(entryPath)
    }
  }
  return results
}

async function resolveExecutable(
  projectRoot: string,
  algorithmId: string,
  configuredBuildDirectory: string,
): Promise<string | null> {
  const suffix = process.platform === 'win32' ? '.exe' : ''
  const target = `${algorithmId}_benchmark${suffix}`
  const preferred = [
    path.join(configuredBuildDirectory, target),
    path.join(configuredBuildDirectory, 'bin', target),
    path.join(configuredBuildDirectory, 'Release', target),
  ]
  for (const candidate of preferred) {
    if (await exists(candidate)) return candidate
  }

  const matches = await findNamedFiles(path.join(projectRoot, 'build'), target)
  if (matches.length === 0) return null
  const byModifiedTime = await Promise.all(
    matches.map(async (match) => ({ path: match, mtime: (await stat(match)).mtimeMs })),
  )
  byModifiedTime.sort((left, right) => right.mtime - left.mtime)
  return byModifiedTime[0]?.path ?? null
}

export async function loadCatalog(
  projectRoot: string,
  configuredBuildDirectory: string,
): Promise<RuntimeCatalog> {
  const datasets = new Map<string, DatasetRuntimeItem>()
  const manifestPaths = await findNamedFiles(path.join(projectRoot, 'datasets'), 'manifest.yaml')
  for (const manifestPath of manifestPaths.sort()) {
    const manifest = record(parse(await readFile(manifestPath, 'utf8')))
    const datasetName = String(manifest.name ?? path.basename(path.dirname(manifestPath)))
    const description = String(manifest.description ?? '')
    const bags = Array.isArray(manifest.bags) ? manifest.bags : []
    for (const rawBag of bags) {
      const bag = record(rawBag)
      const bagName = String(bag.name ?? '')
      if (!bagName) continue
      const configuredPath = String(bag.path ?? '')
      const bagPath = path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(path.dirname(manifestPath), configuredPath)
      const sensors = Array.isArray(bag.sensors) ? bag.sensors.map(record) : []
      const sensorInventory = Array.isArray(bag.sensor_inventory)
        ? bag.sensor_inventory.map(record)
        : sensors
      // Disabled sensors never take part in runtime selection or replay, so the
      // web UI hides them as well. A missing `enabled` field means enabled.
      const visibleSensors = sensorInventory.filter((sensor) => sensor.enabled !== false)
      const groundTruth = record(bag.ground_truth)
      const configuredGroundTruthPath = String(groundTruth.path ?? '')
      const groundTruthPath = configuredGroundTruthPath
        ? (path.isAbsolute(configuredGroundTruthPath)
            ? configuredGroundTruthPath
            : path.resolve(path.dirname(manifestPath), configuredGroundTruthPath))
        : null
      const configuredMaxDifference = Number(groundTruth.max_time_difference_ms)
      const relativeManifest = path.relative(path.join(projectRoot, 'datasets'), manifestPath)
      const id = `${relativeManifest}#${bagName}`
      const rawMessageCount = Number(bag.message_count)
      datasets.set(id, {
        id,
        datasetName,
        description,
        bagName,
        sensorTypes: [...new Set(visibleSensors.map(
          (sensor) => String(sensor.type ?? 'unknown'),
        ))],
        sensorNames: visibleSensors.map((sensor) =>
          String(sensor.name ?? sensor.topic ?? sensor.type ?? 'unknown')),
        expectedMessages:
          Number.isSafeInteger(rawMessageCount) && rawMessageCount > 0 ? rawMessageCount : null,
        sourceAvailable: await exists(bagPath),
        hasGroundTruth: groundTruthPath !== null && await exists(groundTruthPath),
        manifestPath,
        bagPath,
        groundTruthPath,
        groundTruthMaxTimeDifferenceMs:
          Number.isFinite(configuredMaxDifference) && configuredMaxDifference > 0
            ? configuredMaxDifference
            : 100,
      })
    }
  }

  const algorithms = new Map<string, AlgorithmRuntimeItem>()
  const algorithmRoot = path.join(projectRoot, 'algorithm')
  const entries = await readdir(algorithmRoot, { withFileTypes: true })
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const manifestPath = path.join(algorithmRoot, entry.name, 'manifest.yaml')
    if (!(await exists(manifestPath))) continue
    const manifest = record(parse(await readFile(manifestPath, 'utf8')))
    const executablePath = await resolveExecutable(
      projectRoot,
      entry.name,
      configuredBuildDirectory,
    )
    algorithms.set(entry.name, {
      id: entry.name,
      name: String(manifest.name ?? entry.name),
      description: String(manifest.description ?? ''),
      sensorTypes: strings(manifest.sensors),
      available: executablePath !== null,
      configPath: path.join(algorithmRoot, entry.name, 'configs', 'default.yaml'),
      executablePath,
    })
  }

  const discoveredBuilds = new Set(
    [...algorithms.values()]
      .map((algorithm) => algorithm.executablePath)
      .filter((executable): executable is string => executable !== null)
      .map((executable) => {
        const parts = path.relative(projectRoot, executable).split(path.sep)
        return parts[0] === 'build' && parts.length > 1
          ? path.join(parts[0], parts[1]!)
          : path.dirname(path.relative(projectRoot, executable))
      }),
  )

  return {
    response: {
      datasets: [...datasets.values()].map(
        ({ manifestPath: _manifestPath, bagPath: _bagPath,
          groundTruthPath: _groundTruthPath,
          groundTruthMaxTimeDifferenceMs: _maxDifference, ...item }) => item,
      ),
      algorithms: [...algorithms.values()].map(
        ({ configPath: _configPath, executablePath: _executablePath, ...item }) => item,
      ),
      runModes: [...runModes],
      buildDirectory:
        [...discoveredBuilds].sort().join(', ') ||
        path.relative(projectRoot, configuredBuildDirectory) ||
        '.',
    },
    datasets,
    algorithms,
  }
}
