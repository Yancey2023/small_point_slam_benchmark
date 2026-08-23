import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readPerformance } from './performance.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })))
})

describe('readPerformance', () => {
  it('derives wall time, lidar frame latency and CPU metrics from raw CSV files', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'slam-performance-'))
    temporaryDirectories.push(directory)
    await Promise.all([
      writeFile(
        path.join(directory, 'summary.csv'),
        'message_count,wall_time_ms,algorithm_process_time_ms,mean_cpu_normalized_percent\n3,2500,1800,12.5\n',
      ),
      writeFile(
        path.join(directory, 'cpu.csv'),
        'elapsed_ms,core_percent,normalized_percent\n100,100,10\n200,200,20\n',
      ),
      writeFile(
        path.join(directory, 'sensor_messages.csv'),
        'sensor_id,sensor_type,timestamp_ns,item_count\n1,lidar,100,5\n2,imu,200,1\n1,lidar,300,5\n',
      ),
      writeFile(
        path.join(directory, 'timings.csv'),
        'timestamp_ns,stage,duration_ms\n100,total,10\n100,filter_update,2\n100,knn_search,5\n200,total,99\n300,total,30\n300,filter_update,4\n300,knn_search,7\n',
      ),
    ])

    const result = await readPerformance(directory)
    const values = Object.fromEntries(result.metrics.map((metric) => [metric.id, metric.value]))

    expect(values.wall_time_ms).toBe(2500)
    expect(values.algorithm_process_time_ms).toBe(1800)
    expect(values.mean_cpu_percent).toBe(12.5)
    expect(values.peak_cpu_percent).toBe(20)
    expect(values['message:lidar:mean_ms']).toBe(20)
    expect(values['message:lidar:p95_ms']).toBe(29)
    expect(values['message:imu:mean_ms']).toBe(99)
    expect(values['stage:filter_update:mean_ms']).toBe(3)
    expect(values['stage:filter_update:p95_ms']).toBeCloseTo(3.9)
    expect(values['stage:filter_update:count']).toBe(2)
    expect(values['stage:map_search:mean_ms']).toBe(6)
    expect(result.metrics.some((metric) => metric.label.startsWith('KNN'))).toBe(false)
    expect(result.metrics.find((metric) => metric.id === 'stage:filter_update:p95_ms')?.group)
      .toBe('stage_p95')
  })
})
