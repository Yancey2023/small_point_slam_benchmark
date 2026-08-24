import type { RunMode, RunModeCatalogItem } from '../shared/contracts.js'

export const runModes: readonly RunModeCatalogItem[] = [
  {
    id: 'full_speed',
    name: '全速运行',
    description: '不等待数据的原始时间间隔，尽可能快地完成测试。',
    cpuDescription: '全速运行主要看完成速度。CPU 占用不是越低越好，用得高也可能只是算法充分利用了多核。',
  },
  {
    id: 'realtime',
    name: '原速运行',
    description: '按照数据录制时的速度运行，模拟实际使用。',
    cpuDescription: '原速运行完成相同任务时，CPU 占用越低越好，表示需要的计算资源更少。',
  },
]

export function runModeInfo(value: string | undefined): RunModeCatalogItem {
  return runModes.find((mode) => mode.id === value) ?? runModes[0]!
}

export function isRunMode(value: unknown): value is RunMode {
  return runModes.some((mode) => mode.id === value)
}
