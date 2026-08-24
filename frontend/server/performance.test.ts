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
        'message_count,wall_time_ms,algorithm_process_time_ms,algorithm_cpu_time_ms,mean_cpu_normalized_percent,mean_memory_mb,peak_memory_mb,run_mode\n3,2500,1800,7200,12.5,256,320,full_speed\n',
      ),
      writeFile(
        path.join(directory, 'cpu.csv'),
        'elapsed_ms,core_percent,normalized_percent,resident_memory_mb\n100,100,10,240\n200,200,20,320\n',
      ),
      writeFile(
        path.join(directory, 'sensor_messages.csv'),
        'sensor_id,sensor_type,timestamp_ns,item_count\n1,lidar,100,5\n2,imu,200,1\n1,lidar,300,5\n',
      ),
      writeFile(
        path.join(directory, 'timings.csv'),
        'timestamp_ns,stage,duration_ms\n100,total,10\n100,lidar_preprocess,3\n100,plane_estimation,50\n100,filter_update,2\n100,knn_search,5\n100,registration,6\n100,intensity_image,0.5\n100,photometric_registration,0.7\n100,intensity_feature,0.4\n100,new_stage,1\n200,total,99\n200,imu_preprocess,0.2\n300,total,30\n300,filter_update,4\n300,knn_search,7\n',
      ),
    ])

    const result = await readPerformance(directory)
    const values = Object.fromEntries(result.metrics.map((metric) => [metric.id, metric.value]))

    expect(values.wall_time_ms).toBe(2500)
    expect(values.algorithm_process_time_ms).toBe(1800)
    expect(values.algorithm_cpu_time_ms).toBe(7200)
    expect(values.mean_cpu_percent).toBe(12.5)
    expect(values.peak_cpu_percent).toBe(20)
    expect(values.mean_memory_mb).toBe(256)
    expect(values.peak_memory_mb).toBe(320)
    expect(values['message:lidar:mean_ms']).toBe(20)
    expect(values['message:lidar:p95_ms']).toBe(29)
    expect(values['message:imu:mean_ms']).toBe(99)
    expect(values['stage:filter_update:mean_ms']).toBe(3)
    expect(values['stage:filter_update:p95_ms']).toBeCloseTo(3.9)
    expect(values['stage:filter_update:count']).toBe(2)
    expect(values['stage:map_search:mean_ms']).toBe(6)
    expect(values['stage:lidar_preprocess:mean_ms']).toBe(3)
    expect(values['stage:plane_estimation:mean_ms']).toBeUndefined()
    expect(values['stage:new_stage:mean_ms']).toBe(1)
    expect(values['stage:filter_update:median_ms']).toBeUndefined()
    expect(result.metrics.some((metric) => metric.label.startsWith('KNN'))).toBe(false)
    expect(result.metrics.find((metric) => metric.id === 'stage:filter_update:p95_ms')?.group)
      .toBe('stage')
    expect(result.metrics.find((metric) => metric.id === 'stage:filter_update:p95_ms')?.groupLabel)
      .toBe('算法阶段耗时')
    expect(result.metrics.find((metric) => metric.id === 'stage:filter_update:p95_ms')?.selectionId)
      .toBe('stage:filter_update')
    expect(result.metrics.find((metric) => metric.id === 'stage:filter_update:p95_ms')?.timingStatistic)
      .toBe('p95')
    expect(result.metrics.find((metric) => metric.id === 'mean_cpu_percent')?.lowerIsBetter)
      .toBe(false)
    expect(result.metrics.every((metric) => Boolean(metric.description))).toBe(true)
    expect(result.metrics.every((metric) => Boolean(metric.groupDescription))).toBe(true)
    expect(result.metrics.find((metric) => metric.id === 'algorithm_cpu_time_ms')?.description)
      .toContain('多个核心')
    expect(result.metrics.filter((metric) => metric.defaultSelected).map((metric) => metric.id))
      .toEqual(['algorithm_process_time_ms', 'algorithm_cpu_time_ms', 'peak_memory_mb'])
    expect(result.metrics.find((metric) => metric.id === 'stage:imu_preprocess:mean_ms')?.label)
      .toBe('IMU 预处理')
    expect(result.metrics.find((metric) => metric.id === 'stage:registration:mean_ms')?.label)
      .toBe('点云配准')
    expect(result.metrics.find((metric) => metric.id === 'stage:intensity_image:mean_ms')?.label)
      .toBe('强度图预处理')
    expect(result.metrics.find((metric) => metric.id === 'stage:photometric_registration:mean_ms')?.label)
      .toBe('强度光度配准')
    expect(result.metrics.find((metric) => metric.id === 'stage:intensity_feature:mean_ms')?.label)
      .toBe('强度特征管理')
    expect(result.runMode).toBe('full_speed')
    expect(result.cpuDescription).toContain('不是越低越好')
  })

  it('marks CPU metrics as lower-is-better for realtime playback', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'slam-performance-realtime-'))
    temporaryDirectories.push(directory)
    await Promise.all([
      writeFile(
        path.join(directory, 'summary.csv'),
        'message_count,wall_time_ms,algorithm_process_time_ms,mean_cpu_normalized_percent,run_mode\n1,100,10,5,realtime\n',
      ),
      writeFile(path.join(directory, 'cpu.csv'), 'elapsed_ms,core_percent,normalized_percent\n100,50,5\n'),
      writeFile(path.join(directory, 'sensor_messages.csv'), 'sensor_id,sensor_type,timestamp_ns,item_count\n1,lidar,100,1\n'),
      writeFile(path.join(directory, 'timings.csv'), 'timestamp_ns,stage,duration_ms\n100,total,10\n'),
    ])

    const result = await readPerformance(directory)

    expect(result.runMode).toBe('realtime')
    expect(result.metrics.find((metric) => metric.id === 'mean_cpu_percent')?.lowerIsBetter)
      .toBe(true)
    expect(result.cpuDescription).toContain('越低越好')
    expect(result.metrics.some((metric) => metric.id === 'algorithm_cpu_time_ms')).toBe(false)
    expect(result.metrics.some((metric) => metric.unit === 'MB')).toBe(false)
    expect(result.metrics.filter((metric) => metric.defaultSelected).map((metric) => metric.id))
      .toEqual(['algorithm_process_time_ms'])
  })
})
