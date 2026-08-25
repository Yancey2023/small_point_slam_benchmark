<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type {
  BenchmarkResult,
  DatasetCatalogItem,
  TrajectoryResponse,
} from '../../shared/contracts'
import { fetchDatasetGroundTruth, fetchResultTrajectory } from '@/api/client'
import HelpTip from '@/components/HelpTip.vue'
import TrajectoryPlot from '@/components/TrajectoryPlot.vue'
import { algorithmColor } from '@/presentation'

const props = defineProps<{
  datasets: DatasetCatalogItem[]
  results: BenchmarkResult[]
}>()

const availableResults = computed(() => props.results.filter((result) => result.hasTrajectory))
const selectedDatasetId = ref<string | null>(null)
const selectedAlgorithmIds = ref<string[]>([])
const trajectories = ref<Record<string, TrajectoryResponse>>({})
const groundTruths = ref<Record<string, TrajectoryResponse>>({})
const trajectoryVersions = ref<Record<string, string>>({})
const loadingJobIds = ref(new Set<string>())
const loadingGroundTruthIds = ref(new Set<string>())
const errors = ref<Record<string, string>>({})
const groundTruthErrors = ref<Record<string, string>>({})
let knownAlgorithmIds = new Set<string>()

const dashByDataset = ['', '9 5', '2 5', '12 4 2 4']

const datasetOptions = computed(() => {
  const options = new Map<string, { id: string; label: string; hasGroundTruth: boolean }>()
  for (const job of availableResults.value) {
    options.set(job.datasetId, {
      id: job.datasetId,
      label: `${job.datasetName}/${job.bagName}`,
      hasGroundTruth: job.hasGroundTruth,
    })
  }
  for (const dataset of props.datasets) {
    if (!dataset.hasGroundTruth) continue
    options.set(dataset.id, {
      id: dataset.id,
      label: `${dataset.datasetName}/${dataset.bagName}`,
      hasGroundTruth: true,
    })
  }
  return [...options.values()]
})
const algorithmOptions = computed(() => {
  // Options are scoped to the selected dataset so runs that failed there can be
  // flagged next to the algorithm name instead of silently disappearing.
  const byId = new Map<string, {
    label: string
    hasTrajectory: boolean
    failureReason: string | null
  }>()
  for (const job of props.results) {
    if (job.datasetId !== selectedDatasetId.value) continue
    const entry = byId.get(job.algorithmId) ?? {
      label: job.algorithmName,
      hasTrajectory: false,
      failureReason: null,
    }
    entry.label = job.algorithmName
    if (job.hasTrajectory) entry.hasTrajectory = true
    if (!entry.failureReason && job.status === 'failed') {
      entry.failureReason = job.failureReason ?? '算法运行失败'
    }
    byId.set(job.algorithmId, entry)
  }
  return [...byId]
    .filter(([, info]) => info.hasTrajectory || info.failureReason !== null)
    .map(([id, info]) => ({
      id,
      label: info.label,
      failed: !info.hasTrajectory,
      reason: !info.hasTrajectory ? info.failureReason : null,
    }))
})
const selectableAlgorithmIds = computed(() =>
  algorithmOptions.value.filter((algorithm) => !algorithm.failed).map((algorithm) => algorithm.id),
)
const allAlgorithmsSelected = computed(() =>
  selectableAlgorithmIds.value.length > 0 &&
  selectableAlgorithmIds.value.every((id) => selectedAlgorithmIds.value.includes(id)),
)
const selectedJobs = computed(() =>
  availableResults.value.filter(
    (job) =>
      selectedDatasetId.value === job.datasetId &&
      selectedAlgorithmIds.value.includes(job.algorithmId),
  ),
)
const selectedGroundTruth = computed(() => selectedDatasetId.value
  ? groundTruths.value[selectedDatasetId.value]
  : undefined)
const selectedSeries = computed(() =>
  [
    ...(selectedGroundTruth.value ? [{
      id: `ground-truth:${selectedDatasetId.value}`,
      label: 'Ground truth',
      color: '#263a43',
      dash: '7 4',
      trajectory: selectedGroundTruth.value,
    }] : []),
    ...selectedJobs.value.flatMap((job) => {
      const trajectory = trajectories.value[job.id]
      if (!trajectory) return []
      const datasetIndex = datasetOptions.value.findIndex((item) => item.id === job.datasetId)
      return [{
        id: job.id,
        label: `${job.datasetName}/${job.bagName} · ${job.algorithmName} · ${job.runModeName}`,
        color: algorithmColor(job.algorithmId),
        dash: dashByDataset[datasetIndex % dashByDataset.length],
        trajectory,
      }]
    }),
  ],
)

const selectedTrajectoryJobs = computed(() =>
  availableResults.value.filter((job) => job.datasetId === selectedDatasetId.value),
)

watch(
  [datasetOptions, selectedTrajectoryJobs],
  ([datasets, jobs]) => {
    const datasetIds = new Set(datasets.map((dataset) => dataset.id))
    const algorithmIds = new Set(jobs.map((job) => job.algorithmId))
    if (!selectedDatasetId.value || !datasetIds.has(selectedDatasetId.value)) {
      selectedDatasetId.value = datasetIds.values().next().value ?? null
    }
    selectedAlgorithmIds.value = updateSelection(
      selectedAlgorithmIds.value,
      algorithmIds,
      knownAlgorithmIds,
    )
    knownAlgorithmIds = algorithmIds
  },
  { immediate: true },
)

watch(
  selectedDatasetId,
  (datasetId) => {
    const dataset = datasetOptions.value.find((item) => item.id === datasetId)
    if (datasetId && dataset?.hasGroundTruth) void loadGroundTruth(datasetId)
  },
  { immediate: true },
)

watch(
  selectedJobs,
  (jobs) => {
    for (const job of jobs) void loadJob(job)
  },
  { immediate: true },
)

function updateSelection(current: string[], available: Set<string>, known: Set<string>): string[] {
  const retained = current.filter((id) => available.has(id))
  const added = [...available].filter((id) => !known.has(id))
  return [...retained, ...added]
}

async function loadJob(result: BenchmarkResult): Promise<void> {
  const jobId = result.id
  if (
    trajectoryVersions.value[jobId] === result.updatedAt ||
    loadingJobIds.value.has(jobId)
  ) return
  loadingJobIds.value = new Set(loadingJobIds.value).add(jobId)
  try {
    const trajectory = await fetchResultTrajectory(jobId)
    trajectories.value = { ...trajectories.value, [jobId]: trajectory }
    trajectoryVersions.value = { ...trajectoryVersions.value, [jobId]: result.updatedAt }
    const { [jobId]: _removed, ...remainingErrors } = errors.value
    errors.value = remainingErrors
  } catch (reason) {
    errors.value = {
      ...errors.value,
      [jobId]: reason instanceof Error ? reason.message : String(reason),
    }
  } finally {
    const remaining = new Set(loadingJobIds.value)
    remaining.delete(jobId)
    loadingJobIds.value = remaining
  }
}

async function loadGroundTruth(datasetId: string): Promise<void> {
  if (groundTruths.value[datasetId] || loadingGroundTruthIds.value.has(datasetId)) return
  loadingGroundTruthIds.value = new Set(loadingGroundTruthIds.value).add(datasetId)
  try {
    const groundTruth = await fetchDatasetGroundTruth(datasetId)
    groundTruths.value = { ...groundTruths.value, [datasetId]: groundTruth }
    const { [datasetId]: _removed, ...remainingErrors } = groundTruthErrors.value
    groundTruthErrors.value = remainingErrors
  } catch (reason) {
    groundTruthErrors.value = {
      ...groundTruthErrors.value,
      [datasetId]: reason instanceof Error ? reason.message : String(reason),
    }
  } finally {
    const remaining = new Set(loadingGroundTruthIds.value)
    remaining.delete(datasetId)
    loadingGroundTruthIds.value = remaining
  }
}

function toggle(selection: string[], id: string): string[] {
  return selection.includes(id) ? selection.filter((item) => item !== id) : [...selection, id]
}

function toggleAllAlgorithms(): void {
  selectedAlgorithmIds.value = allAlgorithmsSelected.value
    ? []
    : selectableAlgorithmIds.value
}

function meters(value: number): string {
  return `${value.toFixed(value >= 100 ? 0 : 1)} m`
}
</script>

<template>
  <section class="results-card" aria-labelledby="result-title">
    <div class="results-heading">
      <div>
        <div class="heading-title">
          <h2 id="result-title">轨迹对比</h2>
          <HelpTip
            text="切换 XY、XZ、YZ 可以从不同方向查看路线。轨迹长度只表示移动距离，不代表算法精度。"
            label="查看轨迹对比说明"
            align="start"
          />
        </div>
        <p>数据集单选、算法多选，并可切换 XY、XZ、YZ 投影</p>
      </div>
      <div class="endpoint-legend">
        <span class="ground-truth" /> Ground truth
        <span class="hollow" /> 起点
        <span class="solid" /> 终点
      </div>
    </div>

    <div v-if="availableResults.length" class="result-layout">
      <aside class="result-filters">
        <fieldset>
          <legend>数据集（单选）</legend>
          <div class="dataset-select-wrap">
            <select v-model="selectedDatasetId" class="dataset-select" aria-label="选择轨迹数据集">
              <option v-for="dataset in datasetOptions" :key="dataset.id" :value="dataset.id">
                {{ dataset.label }}
              </option>
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend>
            <span>算法</span>
            <button type="button" @click="toggleAllAlgorithms">
              {{ allAlgorithmsSelected ? '清空' : '全选' }}
            </button>
          </legend>
          <button
            v-for="algorithm in algorithmOptions"
            :key="algorithm.id"
            type="button"
            :disabled="algorithm.failed"
            :aria-pressed="!algorithm.failed && selectedAlgorithmIds.includes(algorithm.id)"
            :class="{ active: !algorithm.failed && selectedAlgorithmIds.includes(algorithm.id) }"
            :title="algorithm.reason ?? undefined"
            @click="selectedAlgorithmIds = toggle(selectedAlgorithmIds, algorithm.id)"
          >
            <span class="checkmark">{{ !algorithm.failed && selectedAlgorithmIds.includes(algorithm.id) ? '✓' : '' }}</span>
            <span class="tab-dot" :style="{ background: algorithmColor(algorithm.id) }" />
            <span class="algorithm-label">
              <span class="name-text">{{ algorithm.label }}</span>
              <span v-if="algorithm.failed" class="failed-tag">失败</span>
            </span>
          </button>
        </fieldset>
      </aside>

      <div class="visualization">
        <div v-if="selectedSeries.length" class="metrics">
          <div
            v-for="item in selectedSeries"
            :key="item.id"
            class="metric-item"
            :style="{ borderLeftColor: item.color }"
          >
            <small>{{ item.label }}</small>
            <strong>{{ meters(item.trajectory.distanceMeters) }}</strong>
            <span>{{ item.trajectory.originalPointCount.toLocaleString() }} 个位姿</span>
          </div>
        </div>

        <div v-if="loadingJobIds.size || loadingGroundTruthIds.size" class="loading-note">
          正在读取轨迹…
        </div>
        <p v-for="(message, jobId) in errors" :key="jobId" class="plot-error">{{ message }}</p>
        <p
          v-if="selectedDatasetId && groundTruthErrors[selectedDatasetId]"
          class="plot-error"
        >{{ groundTruthErrors[selectedDatasetId] }}</p>
        <TrajectoryPlot v-if="selectedSeries.length" :series="selectedSeries" />
        <div
          v-else-if="!loadingJobIds.size && !loadingGroundTruthIds.size"
          class="plot-placeholder"
        >
          请选择至少一个算法，或选择带 Ground truth 的数据集
        </div>
      </div>
    </div>
    <p v-else class="empty">当前没有算法轨迹或 Ground truth 可供显示。</p>
  </section>
</template>

<style scoped>
.results-card {
  padding: 28px;
  border: 1px solid var(--line-soft);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: var(--shadow-card);
}
.results-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
h2 { margin: 0 0 3px; font-size: 23px; }
.heading-title { display: flex; align-items: center; gap: 7px; }
.results-heading p { margin: 0; color: var(--ink-muted); font-size: 13px; }
.endpoint-legend { display: flex; align-items: center; gap: 6px; color: var(--ink-muted); font-size: 11px; }
.endpoint-legend span { width: 9px; height: 9px; border: 2px solid #6f8791; border-radius: 50%; }
.endpoint-legend .ground-truth { width: 20px; height: 0; border: 0; border-top: 2px dashed #263a43; border-radius: 0; }
.endpoint-legend .solid { margin-left: 7px; background: #6f8791; }

.result-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 20px; }
.result-filters { display: grid; align-content: start; gap: 15px; }
fieldset { display: grid; gap: 6px; min-width: 0; margin: 0; padding: 0; border: 0; }
legend { display: flex; width: calc(100% - 10px); align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; color: #68797f; font-size: 11px; font-weight: 900; letter-spacing: .08em; }
legend button { flex: none; padding: 4px 7px; border: 0; border-radius: 7px; color: #60777f; background: #e8efec; cursor: pointer; font-size: 9px; font-weight: 800; letter-spacing: 0; white-space: nowrap; }
.dataset-select-wrap { position: relative; }
.dataset-select-wrap::after { position: absolute; top: 50%; right: 12px; color: #60777f; content: '⌄'; font-size: 15px; pointer-events: none; transform: translateY(-58%); }
.dataset-select {
  width: 100%;
  min-width: 0;
  padding: 10px 34px 10px 12px;
  border: 1px solid #cbd7d5;
  border-radius: 14px;
  color: var(--ink);
  background: #f4f7f5;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  appearance: none;
}
.dataset-select:focus-visible { outline: 2px solid #87a0aa; outline-offset: 2px; }
.result-filters fieldset > button {
  display: grid;
  grid-template-columns: 21px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 10px 11px;
  border: 1px solid transparent;
  border-radius: 14px;
  color: var(--ink);
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  text-align: left;
}
.result-filters fieldset:last-child > button { grid-template-columns: 21px 9px minmax(0, 1fr); }
.result-filters fieldset > button:hover:not(:disabled) { background: #f0f3f1; }
.result-filters fieldset > button.active { border-color: #cbd7d5; background: #f4f7f5; }
.result-filters fieldset > button > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-filters fieldset > button:disabled { cursor: not-allowed; opacity: 0.62; }
.algorithm-label { display: flex; align-items: center; gap: 6px; min-width: 0; }
.name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.failed-tag { flex: none; padding: 2px 6px; border-radius: 999px; color: #a85e62; background: #f9e9ea; font-size: 9px; font-weight: 800; }
.checkmark { display: grid; width: 20px; height: 20px; place-items: center; border: 1.5px solid #b8c4c5; border-radius: 7px; color: #fff; font-size: 11px; }
.active .checkmark { border-color: #607c89; background: #607c89; }
.tab-dot { width: 9px; height: 9px; border-radius: 50%; }

.visualization { min-width: 0; }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px; }
.metric-item { display: grid; gap: 1px; padding: 9px 12px; border-left: 3px solid; border-radius: 4px 12px 12px 4px; background: #f1f4f2; }
.metric-item small { overflow: hidden; color: var(--ink-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.metric-item strong { color: #4d5c63; font-size: 14px; }
.metric-item span { color: var(--ink-muted); font-size: 9px; }
.loading-note { padding: 10px; color: var(--ink-muted); font-size: 11px; text-align: center; }
.plot-placeholder { display: grid; min-height: 310px; place-items: center; border: 1px dashed #cad4d2; border-radius: 22px; color: var(--ink-muted); background: #f7f9f7; }
.plot-error { padding: 10px; color: #a85e62; text-align: center; }
.empty { padding: 40px; color: var(--ink-muted); text-align: center; }

@media (max-width: 780px) {
  .result-layout { grid-template-columns: 1fr; }
  .result-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .results-card { padding: 20px; }
  .endpoint-legend { display: none; }
  .result-filters { grid-template-columns: 1fr; }
}
</style>
