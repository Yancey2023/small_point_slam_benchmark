import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { PerformanceMetric, PerformanceResponse } from '../shared/contracts.js'

type CsvRow = Record<string, string>

interface CommonStage {
  id: string
  label: string
  rawStages: string[]
}

const commonStages: CommonStage[] = [
  {
    id: 'lidar_preprocess',
    label: 'LIO 雷达预处理',
    rawStages: ['lidar_preprocess', 'plane_estimation'],
  },
  { id: 'downsampling', label: 'LIO 点云降采样', rawStages: ['downsampling'] },
  { id: 'undistortion', label: 'LIO 点云去畸变', rawStages: ['undistortion'] },
  {
    id: 'state_propagation',
    label: 'LIO 状态传播',
    rawStages: ['state_propagation', 'point_propagation'],
  },
  {
    id: 'map_search',
    label: 'LIO 地图搜索',
    rawStages: [
      'map_search',
      'knn_search',
      'voxel_search',
    ],
  },
  {
    id: 'filter_update',
    label: 'LIO 滤波器更新',
    rawStages: [
      'filter_update',
      'state_optimization',
    ],
  },
  {
    id: 'map_update',
    label: 'LIO 地图更新',
    rawStages: ['map_update', 'compact_map_update'],
  },
  {
    id: 'observation_update',
    label: 'LIO 观测更新（旧版组合阶段）',
    rawStages: ['correspondence_search_filter_update'],
  },
]

const sensorLabels: Record<string, string> = {
  camera: '图像消息',
  gnss: 'GNSS 消息',
  image: '图像消息',
  imu: 'IMU 消息',
  lidar: '雷达消息',
  wheel_speed: '轮速消息',
}

async function readCsv(filePath: string): Promise<CsvRow[]> {
  const lines = (await readFile(filePath, 'utf8')).trim().split(/\r?\n/)
  const headers = lines.shift()?.split(',') ?? []
  return lines.filter(Boolean).map((line) => {
    const values = line.split(',')
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

function number(row: CsvRow | undefined, key: string): number {
  const value = Number(row?.[key])
  return Number.isFinite(value) ? value : 0
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower] ?? 0
  const start = sorted[lower] ?? 0
  return start + ((sorted[upper] ?? start) - start) * (position - lower)
}

function metric(
  id: string,
  label: string,
  value: number,
  unit: PerformanceMetric['unit'],
  group: PerformanceMetric['group'] = 'overview',
  lowerIsBetter = true,
): PerformanceMetric {
  return { id, label, value, unit, group, lowerIsBetter }
}

function aggregateByTimestamp(rows: CsvRow[], stages: string[]): number[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (!stages.includes(row.stage ?? '')) continue
    const duration = Number(row.duration_ms)
    if (!Number.isFinite(duration)) continue
    const timestamp = row.timestamp_ns ?? ''
    totals.set(timestamp, (totals.get(timestamp) ?? 0) + duration)
  }
  return [...totals.values()]
}

function timingStatistics(
  idPrefix: string,
  label: string,
  durations: number[],
  groupForAll?: PerformanceMetric['group'],
): PerformanceMetric[] {
  if (!durations.length) return []
  return [
    metric(`${idPrefix}:mean_ms`, `${label} · 平均`, mean(durations), 'ms', groupForAll ?? 'stage_mean'),
    metric(`${idPrefix}:median_ms`, `${label} · 中位数`, percentile(durations, 0.5), 'ms', groupForAll ?? 'stage_median'),
    metric(`${idPrefix}:p95_ms`, `${label} · P95`, percentile(durations, 0.95), 'ms', groupForAll ?? 'stage_p95'),
    metric(`${idPrefix}:max_ms`, `${label} · 最大`, Math.max(0, ...durations), 'ms', groupForAll ?? 'stage_max'),
    metric(`${idPrefix}:total_ms`, `${label} · 累计`, durations.reduce((sum, value) => sum + value, 0), 'ms', groupForAll ?? 'stage_total'),
    metric(`${idPrefix}:count`, `${label} · 数量`, durations.length, 'count', groupForAll ?? 'stage_count', false),
  ]
}

export async function readPerformance(outputDirectory: string): Promise<PerformanceResponse> {
  const [summaryRows, cpuRows, sensorRows, timingRows] = await Promise.all([
    readCsv(path.join(outputDirectory, 'summary.csv')),
    readCsv(path.join(outputDirectory, 'cpu.csv')),
    readCsv(path.join(outputDirectory, 'sensor_messages.csv')),
    readCsv(path.join(outputDirectory, 'timings.csv')),
  ])
  const summary = summaryRows[0]
  const normalizedCpuValues = cpuRows
    .map((row) => Number(row.normalized_percent))
    .filter(Number.isFinite)
  const coreCpuValues = cpuRows
    .map((row) => Number(row.core_percent))
    .filter(Number.isFinite)

  const totalDurationByTimestamp = new Map(
    timingRows
      .filter((row) => row.stage === 'total')
      .map((row) => [row.timestamp_ns ?? '', Number(row.duration_ms)] as const)
      .filter((entry) => Number.isFinite(entry[1])),
  )
  const sensorTypes = [...new Set(sensorRows.map((row) => row.sensor_type ?? '').filter(Boolean))]
  const messageMetrics = sensorTypes.flatMap((sensorType) => {
    const durations = sensorRows.flatMap((row) => {
      if (row.sensor_type !== sensorType) return []
      const duration = totalDurationByTimestamp.get(row.timestamp_ns ?? '')
      return duration === undefined ? [] : [duration]
    })
    return timingStatistics(
      `message:${sensorType}`,
      sensorLabels[sensorType] ?? `${sensorType} 消息`,
      durations,
      'message',
    )
  })
  const stageMetrics = commonStages.flatMap((stage) =>
    timingStatistics(
      `stage:${stage.id}`,
      stage.label,
      aggregateByTimestamp(timingRows, stage.rawStages),
    ),
  )

  return {
    metrics: [
      metric('wall_time_ms', '运行总耗时', number(summary, 'wall_time_ms'), 'ms'),
      metric(
        'algorithm_process_time_ms',
        '算法处理总耗时',
        number(summary, 'algorithm_process_time_ms'),
        'ms',
      ),
      metric(
        'mean_cpu_percent',
        '平均 CPU 占用（归一化）',
        number(summary, 'mean_cpu_normalized_percent'),
        '%',
      ),
      metric(
        'p95_cpu_percent',
        'P95 CPU 占用（归一化）',
        percentile(normalizedCpuValues, 0.95),
        '%',
      ),
      metric(
        'peak_cpu_percent',
        '峰值 CPU 占用（归一化）',
        Math.max(0, ...normalizedCpuValues),
        '%',
      ),
      metric('mean_core_cpu_percent', '平均 CPU 单核当量', mean(coreCpuValues), '%'),
      metric('peak_core_cpu_percent', '峰值 CPU 单核当量', Math.max(0, ...coreCpuValues), '%'),
      metric(
        'message_count',
        '处理消息总数',
        number(summary, 'message_count'),
        'count',
        'overview',
        false,
      ),
      ...messageMetrics,
      ...stageMetrics,
    ],
  }
}
