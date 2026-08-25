import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { RuntimeCatalog } from './catalog.js'
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

})
