import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { RuntimeCatalog } from './catalog.js'
import { bagConfigSha256 } from './provenance.js'
import { discoverResults, publicResults, relativeResultDirectory } from './results.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })))
})

describe('stored benchmark results', () => {
  it('uses a flat dataset-bag-algorithm result directory', () => {
    const first = {
      id: 'ACE/manifest.yaml#first',
      datasetName: 'ACE',
      description: '',
      bagName: 'first',
      sensorTypes: ['lidar'],
      expectedMessages: null,
      sourceAvailable: true,
      hasGroundTruth: false,
    }
    const second = { ...first, id: 'ACE/manifest.yaml#second', bagName: 'second' }

    expect(relativeResultDirectory(first, 'FAST-LIO2'))
      .toBe(path.join('results', 'ACE-first-FAST-LIO2'))
    expect(relativeResultDirectory(second, 'VoxelMap (with imu)'))
      .toBe(path.join('results', 'ACE-second-VoxelMap (with imu)'))
  })

  it('discovers complete results from disk without an in-memory run', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'slam-results-'))
    temporaryDirectories.push(projectRoot)
    const outputDirectory = path.join(projectRoot, 'results', 'ACE-door-FAST-LIO2')
    await mkdir(outputDirectory, { recursive: true })
    await Promise.all([
      writeFile(path.join(outputDirectory, 'final_trajectory.csv'), 'timestamp_ns,x_m,y_m,z_m\n'),
      writeFile(
        path.join(outputDirectory, 'summary.csv'),
        'run_mode,status,reason\nfull_speed,completed,\n',
      ),
      ...['cpu.csv', 'sensor_messages.csv', 'timings.csv'].map((fileName) =>
        writeFile(path.join(outputDirectory, fileName), 'header\n'),
      ),
    ])

    const dataset = {
      id: 'ACE/manifest.yaml#door',
      datasetName: 'ACE',
      description: '',
      bagName: 'door',
      sensorTypes: ['lidar'],
      expectedMessages: null,
      sourceAvailable: true,
      hasGroundTruth: false,
      manifestPath: '/manifest.yaml',
      bagPath: '/door.mcap',
      groundTruthPath: null,
      groundTruthMaxTimeDifferenceMs: 100,
    }
    const algorithm = {
      id: 'fast_lio',
      name: 'FAST-LIO2',
      description: '',
      sensorTypes: ['lidar'],
      available: true,
      configPath: '/default.yaml',
      executablePath: '/fast_lio_benchmark',
    }
    const catalog = {
      response: { datasets: [dataset], algorithms: [algorithm], buildDirectory: 'build' },
      datasets: new Map([[dataset.id, dataset]]),
      algorithms: new Map([[algorithm.id, algorithm]]),
    } as unknown as RuntimeCatalog

    const results = await discoverResults(projectRoot, catalog)

    expect(publicResults(results).results).toMatchObject([{
      datasetId: dataset.id,
      algorithmId: algorithm.id,
      runMode: 'full_speed',
      hasTrajectory: true,
      hasPerformance: true,
    }])
    expect(results[0]?.absoluteOutputDirectory).toBe(outputDirectory)

    await writeFile(
      path.join(outputDirectory, 'summary.csv'),
      'run_mode,status,reason\nfull_speed,unsupported,缺少点云强度\n',
    )
    expect(await discoverResults(projectRoot, catalog)).toEqual([])

    await writeFile(
      path.join(outputDirectory, 'summary.csv'),
      'run_mode,status,reason\nfull_speed,failed,"输出位置超过 2000.0 m，算法判定失败"\n',
    )
    expect(publicResults(await discoverResults(projectRoot, catalog)).results)
      .toMatchObject([{
        datasetId: dataset.id,
        algorithmId: algorithm.id,
        status: 'failed',
        failureReason: '输出位置超过 2000.0 m，算法判定失败',
        hasTrajectory: false,
        hasPerformance: false,
      }])
  })

  it('flags completed results whose bag config or binary no longer matches', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'slam-stale-'))
    temporaryDirectories.push(projectRoot)
    const outputDirectory = path.join(projectRoot, 'results', 'ACE-door-FAST-LIO2')
    await mkdir(outputDirectory, { recursive: true })
    const executablePath = path.join(projectRoot, 'fast_lio_benchmark')
    await writeFile(executablePath, 'binary-v1')
    const definition = { name: 'door', sensors: [{ id: 1 }] } as const
    const binarySha256 = createHash('sha256').update('binary-v1').digest('hex')
    const writeProvenance = () =>
      writeFile(
        path.join(outputDirectory, 'provenance.json'),
        `${JSON.stringify({
          version: 1,
          config_sha256: bagConfigSha256(definition),
          executable_sha256: binarySha256,
        }, null, 2)}\n`,
      )
    await Promise.all([
      writeFile(path.join(outputDirectory, 'final_trajectory.csv'), 'timestamp_ns,x_m,y_m,z_m\n'),
      writeFile(
        path.join(outputDirectory, 'summary.csv'),
        'run_mode,status,reason\nfull_speed,completed,\n',
      ),
      writeProvenance(),
    ])

    const buildCatalog = (definition?: unknown) => {
      const dataset = {
        id: 'ACE/manifest.yaml#door',
        datasetName: 'ACE',
        description: '',
        bagName: 'door',
        sensorTypes: ['lidar'],
        expectedMessages: null,
        sourceAvailable: true,
        hasGroundTruth: false,
        manifestPath: '/manifest.yaml',
        bagPath: '/door.mcap',
        groundTruthMaxTimeDifferenceMs: 100,
        ...(definition === undefined ? {} : { definition }),
      }
      const algorithm = {
        id: 'fast_lio',
        name: 'FAST-LIO2',
        description: '',
        sensorTypes: ['lidar'],
        available: true,
        configPath: '/default.yaml',
        executablePath,
      }
      return {
        response: { datasets: [dataset], algorithms: [algorithm], buildDirectory: 'build' },
        datasets: new Map([[dataset.id, dataset]]),
        algorithms: new Map([[algorithm.id, algorithm]]),
      } as unknown as RuntimeCatalog
    }
    const firstResult = async (catalog: RuntimeCatalog) =>
      publicResults(await discoverResults(projectRoot, catalog)).results[0]

    // Matching config and binary verify as up to date.
    expect(await firstResult(buildCatalog(definition))).toMatchObject({ outdated: false })

    // Editing the manifest definition of the bag marks the result outdated.
    expect(await firstResult(buildCatalog({ ...definition, sensors: [{ id: 1 }, { id: 2 }] })))
      .toMatchObject({ outdated: true })

    // Replacing the algorithm binary marks the result outdated.
    await writeFile(executablePath, 'binary-v2-changed')
    expect(await firstResult(buildCatalog(definition))).toMatchObject({ outdated: true })

    // Results recorded before provenance files existed count as outdated.
    await rm(path.join(outputDirectory, 'provenance.json'))
    expect(await firstResult(buildCatalog(definition))).toMatchObject({ outdated: true })

    // A provenance record that cannot be checked against the current catalog
    // (no parsed definition) stays unknown instead of claiming freshness.
    await writeProvenance()
    expect(await firstResult(buildCatalog(undefined))).toMatchObject({ outdated: null })
  })

})
