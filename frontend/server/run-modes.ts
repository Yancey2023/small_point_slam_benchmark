import type { RunMode, RunModeCatalogItem } from '../shared/contracts.js'

export const runModes: readonly RunModeCatalogItem[] = [
  {
    id: 'full_speed',
    name: '全速运行',
    description: '不等待消息原始时间间隔，用于测试算法吞吐能力。',
    cpuDescription: '全速模式下 CPU 占用表示算法为尽快处理数据所使用的并行算力，不是越低越好；请结合运行总耗时和算法处理总耗时判断吞吐效率。',
  },
  {
    id: 'realtime',
    name: '原速运行',
    description: '按 bag 消息时间戳还原采集节奏，用于评估实时运行资源需求。',
    cpuDescription: '原速模式已按消息时间戳节流，CPU 占用表示满足实时处理所需的资源，因此越低越好。',
  },
]

export function runModeInfo(value: string | undefined): RunModeCatalogItem {
  return runModes.find((mode) => mode.id === value) ?? runModes[0]!
}

export function isRunMode(value: unknown): value is RunMode {
  return runModes.some((mode) => mode.id === value)
}
