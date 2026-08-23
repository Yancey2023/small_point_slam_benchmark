import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { PerformanceMetric, PerformanceResponse } from '../shared/contracts.js'

type CsvRow = Record<string, string>

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

const stageLabels: Record<string, string> = {
  compact_map_update: '紧凑地图更新',
  correspondence_search_filter_update: '匹配搜索与滤波更新',
  downsampling: '点云降采样',
  filter_update: '滤波器更新',
  finalize: '结果收尾',
  knn_search: 'KNN 搜索',
  lidar_preprocess: '雷达数据预处理',
  map_update: '地图更新',
  plane_estimation: '平面估计',
  point_propagation: '点级状态传播',
  state_optimization: '状态优化',
  total: '消息处理',
  undistortion: '点云去畸变',
  voxel_search: '体素搜索',
}

function stageLabel(stage: string): string {
  return stageLabels[stage] ?? stage.replaceAll('_', ' ')
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

export async function readPerformance(outputDirectory: string): Promise<PerformanceResponse> {
  const [summaryRows, cpuRows, sensorRows, timingRows] = await Promise.all([
    readCsv(path.join(outputDirectory, 'summary.csv')),
    readCsv(path.join(outputDirectory, 'cpu.csv')),
    readCsv(path.join(outputDirectory, 'sensor_messages.csv')),
    readCsv(path.join(outputDirectory, 'timings.csv')),
  ])
  const summary = summaryRows[0]
  const lidarTimestamps = new Set(
    sensorRows
      .filter((row) => row.sensor_type === 'lidar')
      .map((row) => row.timestamp_ns ?? ''),
  )
  const lidarDurations = timingRows
    .filter((row) => row.stage === 'total' && lidarTimestamps.has(row.timestamp_ns ?? ''))
    .map((row) => Number(row.duration_ms))
    .filter(Number.isFinite)
  const meanLidarDuration = lidarDurations.length
    ? lidarDurations.reduce((sum, value) => sum + value, 0) / lidarDurations.length
    : 0
  const normalizedCpuValues = cpuRows
    .map((row) => Number(row.normalized_percent))
    .filter(Number.isFinite)
  const coreCpuValues = cpuRows
    .map((row) => Number(row.core_percent))
    .filter(Number.isFinite)
  const mean = (values: number[]) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0

  const stageDurations = new Map<string, number[]>()
  for (const row of timingRows) {
    const stage = row.stage ?? ''
    const duration = Number(row.duration_ms)
    if (!stage || !Number.isFinite(duration)) continue
    const durations = stageDurations.get(stage) ?? []
    durations.push(duration)
    stageDurations.set(stage, durations)
  }
  const stageMetrics = [...stageDurations]
    .sort(([left], [right]) => stageLabel(left).localeCompare(stageLabel(right), 'zh-CN'))
    .flatMap(([stage, durations]) => {
      const label = stageLabel(stage)
      return [
        metric(
          `stage:${stage}:mean_ms`,
          `${label} · 平均`,
          mean(durations),
          'ms',
          'stage_mean',
        ),
        metric(
          `stage:${stage}:median_ms`,
          `${label} · 中位数`,
          percentile(durations, 0.5),
          'ms',
          'stage_median',
        ),
        metric(
          `stage:${stage}:p95_ms`,
          `${label} · P95`,
          percentile(durations, 0.95),
          'ms',
          'stage_p95',
        ),
        metric(
          `stage:${stage}:max_ms`,
          `${label} · 最大`,
          Math.max(0, ...durations),
          'ms',
          'stage_max',
        ),
        metric(
          `stage:${stage}:total_ms`,
          `${label} · 累计`,
          durations.reduce((sum, value) => sum + value, 0),
          'ms',
          'stage_total',
        ),
        metric(
          `stage:${stage}:count`,
          `${label} · 调用次数`,
          durations.length,
          'count',
          'stage_count',
          false,
        ),
      ]
    })

  return {
    metrics: [
      metric('wall_time_ms', '运行总耗时', number(summary, 'wall_time_ms'), 'ms'),
      metric(
        'algorithm_process_time_ms',
        '算法处理总耗时',
        number(summary, 'algorithm_process_time_ms'),
        'ms',
      ),
      metric('mean_lidar_frame_ms', '点云帧平均耗时', meanLidarDuration, 'ms'),
      metric('median_lidar_frame_ms', '点云帧中位耗时', percentile(lidarDurations, 0.5), 'ms'),
      metric('p95_lidar_frame_ms', '点云帧 P95 耗时', percentile(lidarDurations, 0.95), 'ms'),
      metric('max_lidar_frame_ms', '点云帧最大耗时', Math.max(0, ...lidarDurations), 'ms'),
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
        '处理消息数',
        number(summary, 'message_count'),
        'count',
        'overview',
        false,
      ),
      metric(
        'lidar_frame_count',
        '处理点云帧数',
        lidarTimestamps.size,
        'count',
        'overview',
        false,
      ),
      ...stageMetrics,
    ],
  }
}
