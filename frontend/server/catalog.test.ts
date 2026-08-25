import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadCatalog } from './catalog.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })))
})

describe('runtime catalog', () => {
  it('discovers new dataset and algorithm manifests without frontend mappings', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'slam-catalog-'))
    temporaryDirectories.push(root)
    const datasetDirectory = path.join(root, 'datasets', 'dynamic')
    const algorithmDirectory = path.join(root, 'algorithm', 'brand_new', 'configs')
    const buildDirectory = path.join(root, 'build')
    await Promise.all([
      mkdir(datasetDirectory, { recursive: true }),
      mkdir(algorithmDirectory, { recursive: true }),
      mkdir(buildDirectory, { recursive: true }),
    ])
    await Promise.all([
      writeFile(path.join(datasetDirectory, 'bag.mcap'), ''),
      writeFile(
        path.join(datasetDirectory, 'manifest.yaml'),
        'name: Dynamic\nbags:\n  - name: sequence\n    path: bag.mcap\n    sensors:\n      - {id: 1, name: Primary LiDAR, type: lidar}\n    sensor_inventory:\n      - {id: 1, name: Primary LiDAR, type: lidar}\n      - {id: 2, name: RGB Camera, type: camera}\n      - {id: 3, name: Wheel Odometry, type: wheel_speed, enabled: false}\n',
      ),
      writeFile(
        path.join(root, 'algorithm', 'brand_new', 'manifest.yaml'),
        'name: Brand New\ndescription: runtime item\nsensors: [lidar]\n',
      ),
      writeFile(path.join(algorithmDirectory, 'default.yaml'), 'algorithm: brand_new\n'),
      writeFile(
        path.join(buildDirectory, `brand_new_benchmark${process.platform === 'win32' ? '.exe' : ''}`),
        '',
      ),
    ])

    const catalog = await loadCatalog(root, buildDirectory)

    expect(catalog.response.datasets.map((item) => item.bagName)).toEqual(['sequence'])
    expect(catalog.response.datasets[0]?.hasGroundTruth).toBe(false)
    expect(catalog.response.datasets[0]).toMatchObject({
      sensorTypes: ['lidar', 'camera'],
      sensorNames: ['Primary LiDAR', 'RGB Camera'],
    })
    expect(catalog.response.datasets[0]?.sensorNames).not.toContain('Wheel Odometry')
    expect(catalog.response.algorithms).toMatchObject([{
      id: 'brand_new',
      name: 'Brand New',
      available: true,
    }])
    expect(catalog.response.runModes.map((mode) => mode.id)).toEqual(['full_speed', 'realtime'])
  })
})
