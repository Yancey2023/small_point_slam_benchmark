import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { PerformanceMetric, PerformanceResponse } from '../shared/contracts.js'
import { runModeInfo } from './run-modes.js'

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
    rawStages: ['lidar_preprocess'],
  },
  { id: 'downsampling', label: 'LIO 点云降采样', rawStages: ['downsampling'] },
  { id: 'imu_preprocess', label: 'IMU 预处理', rawStages: ['imu_preprocess'] },
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
  { id: 'registration', label: '点云配准', rawStages: ['registration', 'resitration'] },
  { id: 'intensity_image', label: '强度图预处理', rawStages: ['intensity_image'] },
  {
    id: 'photometric_registration',
    label: '强度光度配准',
    rawStages: ['photometric_registration'],
  },
  { id: 'intensity_feature', label: '强度特征管理', rawStages: ['intensity_feature'] },
]

const ignoredStages = new Set(['plane_estimation'])

const sensorLabels: Record<string, string> = {
  camera: '图像消息',
  gnss: 'GNSS 消息',
  image: '图像消息',
  imu: 'IMU 消息',
  lidar: '雷达消息',
  wheel_speed: '轮速消息',
}

const groupLabels: Record<string, string> = {
  overview: '总览',
  message: '按消息类型处理耗时',
  stage: '算法阶段耗时',
  count: '调用次数',
}

const groupDescriptions: Record<string, string> = {
  overview: '快速比较每种算法的运行速度、CPU 和内存占用。',
  message: '查看算法处理不同传感器消息分别需要多少时间。',
  stage: '查看算法在雷达预处理、去畸变、滤波和地图更新等步骤上花费的时间。',
  count: '查看每类消息或处理步骤一共执行了多少次。',
}

const metricDescriptions: Record<string, string> = {
  wall_time_ms: '从点击运行到全部完成一共等待了多久，包括读取rosbag数据和播放rosbag时的等待。',
  algorithm_process_time_ms: '算法真正处理传感器数据累计花了多久，不包括读取rosbag数据和播放rosbag时的等待。',
  algorithm_cpu_time_ms: '算法实际消耗了多少 CPU 计算时间。可以理解为所有CPU核心的耗时加在一起，用于衡量实际的CPU占用。',
  mean_cpu_percent: '运行期间平均使用了整台机器多少 CPU。100% 表示所有核心都在满负荷工作。',
  p95_cpu_percent: '大多数时间里的较高 CPU 占用，可减少偶尔出现的尖峰对判断的影响。',
  peak_cpu_percent: '运行期间出现过的最高 CPU 占用。',
  mean_core_cpu_percent: '运行期间平均用了多少个核心。100% 约等于用满一个核心，800% 约等于用满八个核心。',
  peak_core_cpu_percent: '运行期间最多同时用了多少个核心。100% 约等于用满一个核心。',
  mean_memory_mb: '运行期间通常占用了多少内存。',
  peak_memory_mb: '运行期间最多占用了多少内存。',
  message_count: '这次运行一共处理了多少条传感器消息。',
}

const defaultMetricIds = new Set([
  'algorithm_process_time_ms',
  'algorithm_cpu_time_ms',
  'peak_memory_mb',
])

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
  group = 'overview',
  lowerIsBetter = true,
  selectionId?: string,
  timingStatistic?: PerformanceMetric['timingStatistic'],
  description?: string,
): PerformanceMetric {
  return {
    id,
    label,
    value,
    unit,
    group,
    groupLabel: groupLabels[group] ?? group,
    groupDescription: groupDescriptions[group],
    defaultSelected: defaultMetricIds.has(id),
    lowerIsBetter,
    description: description ?? metricDescriptions[id],
    ...(selectionId ? { selectionId } : {}),
    ...(timingStatistic ? { timingStatistic } : {}),
  }
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
  group: 'message' | 'stage',
): PerformanceMetric[] {
  if (!durations.length) return []
  const source = group === 'message'
    ? `处理${label}`
    : `执行“${label}”步骤`
  return [
    metric(`${idPrefix}:mean_ms`, label, mean(durations), 'ms', group, true, idPrefix, 'mean',
      `${source}平均需要多久。`),
    metric(`${idPrefix}:p95_ms`, label, percentile(durations, 0.95), 'ms', group, true, idPrefix, 'p95',
      `${source}时，大多数（95%）记录不会超过这个时间。`),
    metric(`${idPrefix}:max_ms`, label, Math.max(0, ...durations), 'ms', group, true, idPrefix, 'max',
      `${source}最慢的一次花了多久。`),
    metric(`${idPrefix}:total_ms`, label, durations.reduce((sum, value) => sum + value, 0), 'ms', group, true, idPrefix, 'total',
      `${source}全部加起来花了多久。`),
    metric(`${idPrefix}:count`, label, durations.length, 'count', 'count', false,
      undefined, undefined, `${source}一共记录了多少次。`),
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
  const mode = runModeInfo(summary?.run_mode)
  const cpuLowerIsBetter = mode.id === 'realtime'
  const normalizedCpuValues = cpuRows
    .map((row) => Number(row.normalized_percent))
    .filter(Number.isFinite)
  const coreCpuValues = cpuRows
    .map((row) => Number(row.core_percent))
    .filter(Number.isFinite)
  const memoryValues = cpuRows
    .map((row) => Number(row.resident_memory_mb))
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
  const consumedStages = new Set(commonStages.flatMap((stage) => stage.rawStages))
  const discoveredStages = [...new Set(
    timingRows
      .map((row) => row.stage ?? '')
      .filter((stage) => stage && stage !== 'total' && stage !== 'finalize' &&
        !consumedStages.has(stage) && !ignoredStages.has(stage)),
  )].map((stage) => ({
    id: stage,
    label: stage.replaceAll('_', ' '),
    rawStages: [stage],
  }))
  const stageMetrics = [...commonStages, ...discoveredStages].flatMap((stage) =>
    timingStatistics(
      `stage:${stage.id}`,
      stage.label,
      aggregateByTimestamp(timingRows, stage.rawStages),
      'stage',
    ),
  )

  const memoryMetrics = memoryValues.length ? [
    metric(
      'mean_memory_mb',
      '平均常驻内存',
      summary && 'mean_memory_mb' in summary
        ? number(summary, 'mean_memory_mb')
        : mean(memoryValues),
      'MB',
    ),
    metric(
      'peak_memory_mb',
      '峰值常驻内存',
      summary && 'peak_memory_mb' in summary
        ? number(summary, 'peak_memory_mb')
        : Math.max(0, ...memoryValues),
      'MB',
    ),
  ] : []

  return {
    runMode: mode.id,
    runModeLabel: mode.name,
    cpuDescription: mode.cpuDescription,
    metrics: [
      metric('wall_time_ms', '运行总耗时', number(summary, 'wall_time_ms'), 'ms'),
      metric(
        'algorithm_process_time_ms',
        '算法处理总耗时',
        number(summary, 'algorithm_process_time_ms'),
        'ms',
      ),
      ...(summary && 'algorithm_cpu_time_ms' in summary ? [metric(
        'algorithm_cpu_time_ms',
        '算法 CPU 总耗时',
        number(summary, 'algorithm_cpu_time_ms'),
        'ms',
      )] : []),
      metric(
        'mean_cpu_percent',
        '平均 CPU 占用（归一化）',
        number(summary, 'mean_cpu_normalized_percent'),
        '%',
        'overview',
        cpuLowerIsBetter,
      ),
      metric(
        'p95_cpu_percent',
        'P95 CPU 占用（归一化）',
        percentile(normalizedCpuValues, 0.95),
        '%',
        'overview',
        cpuLowerIsBetter,
      ),
      metric(
        'peak_cpu_percent',
        '峰值 CPU 占用（归一化）',
        Math.max(0, ...normalizedCpuValues),
        '%',
        'overview',
        cpuLowerIsBetter,
      ),
      metric('mean_core_cpu_percent', '平均 CPU 单核当量', mean(coreCpuValues), '%',
        'overview', cpuLowerIsBetter),
      metric('peak_core_cpu_percent', '峰值 CPU 单核当量', Math.max(0, ...coreCpuValues), '%',
        'overview', cpuLowerIsBetter),
      ...memoryMetrics,
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
