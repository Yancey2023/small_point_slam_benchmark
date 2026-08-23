<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { BenchmarkResult, TrajectoryResponse } from '../../shared/contracts'
import { fetchResultTrajectory } from '@/api/client'
import TrajectoryPlot from '@/components/TrajectoryPlot.vue'

const props = defineProps<{
  results: BenchmarkResult[]
}>()

const availableResults = computed(() => props.results.filter((result) => result.hasTrajectory))
const selectedDatasetIds = ref<string[]>([])
const selectedAlgorithmIds = ref<string[]>([])
const trajectories = ref<Record<string, TrajectoryResponse>>({})
const trajectoryVersions = ref<Record<string, string>>({})
const loadingJobIds = ref(new Set<string>())
const errors = ref<Record<string, string>>({})
let knownDatasetIds = new Set<string>()
let knownAlgorithmIds = new Set<string>()

const colorByAlgorithm: Record<string, string> = {
  fast_lio: '#477b9d',
  point_lio: '#5d927d',
  voxel_map: '#b7863c',
  super_lio: '#766f91',
}
const dashByDataset = ['', '9 5', '2 5', '12 4 2 4']

const datasetOptions = computed(() => uniqueOptions('datasetId', 'datasetName'))
const algorithmOptions = computed(() => uniqueOptions('algorithmId', 'algorithmName'))
const selectedJobs = computed(() =>
  availableResults.value.filter(
    (job) =>
      selectedDatasetIds.value.includes(job.datasetId) &&
      selectedAlgorithmIds.value.includes(job.algorithmId),
  ),
)
const selectedSeries = computed(() =>
  selectedJobs.value.flatMap((job) => {
    const trajectory = trajectories.value[job.id]
    if (!trajectory) return []
    const datasetIndex = datasetOptions.value.findIndex((item) => item.id === job.datasetId)
    return [{
      id: job.id,
      label: `${job.datasetName} · ${job.algorithmName}`,
      color: colorByAlgorithm[job.algorithmId] ?? '#687b84',
      dash: dashByDataset[datasetIndex % dashByDataset.length],
      trajectory,
    }]
  }),
)

function uniqueOptions(idKey: 'datasetId' | 'algorithmId', labelKey: 'datasetName' | 'algorithmName') {
  const options = new Map<string, string>()
  for (const job of availableResults.value) options.set(job[idKey], job[labelKey])
  return [...options].map(([id, label]) => ({ id, label }))
}

watch(
  availableResults,
  (jobs) => {
    const datasetIds = new Set(jobs.map((job) => job.datasetId))
    const algorithmIds = new Set(jobs.map((job) => job.algorithmId))
    selectedDatasetIds.value = updateSelection(
      selectedDatasetIds.value,
      datasetIds,
      knownDatasetIds,
    )
    selectedAlgorithmIds.value = updateSelection(
      selectedAlgorithmIds.value,
      algorithmIds,
      knownAlgorithmIds,
    )
    knownDatasetIds = datasetIds
    knownAlgorithmIds = algorithmIds
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

function toggle(selection: string[], id: string): string[] {
  return selection.includes(id) ? selection.filter((item) => item !== id) : [...selection, id]
}

function meters(value: number): string {
  return `${value.toFixed(value >= 100 ? 0 : 1)} m`
}
</script>

<template>
  <section class="results-card" aria-labelledby="result-title">
    <div class="results-heading">
      <div>
        <h2 id="result-title">轨迹对比</h2>
        <p>数据集与算法均可多选，并可切换 XY、XZ、YZ 投影</p>
      </div>
      <div class="endpoint-legend">
        <span class="hollow" /> 起点
        <span class="solid" /> 终点
      </div>
    </div>

    <div v-if="availableResults.length" class="result-layout">
      <aside class="result-filters">
        <fieldset>
          <legend>数据集</legend>
          <button
            v-for="dataset in datasetOptions"
            :key="dataset.id"
            type="button"
            :aria-pressed="selectedDatasetIds.includes(dataset.id)"
            :class="{ active: selectedDatasetIds.includes(dataset.id) }"
            @click="selectedDatasetIds = toggle(selectedDatasetIds, dataset.id)"
          >
            <span class="checkmark">{{ selectedDatasetIds.includes(dataset.id) ? '✓' : '' }}</span>
            <span>{{ dataset.label }}</span>
          </button>
        </fieldset>

        <fieldset>
          <legend>算法</legend>
          <button
            v-for="algorithm in algorithmOptions"
            :key="algorithm.id"
            type="button"
            :aria-pressed="selectedAlgorithmIds.includes(algorithm.id)"
            :class="{ active: selectedAlgorithmIds.includes(algorithm.id) }"
            @click="selectedAlgorithmIds = toggle(selectedAlgorithmIds, algorithm.id)"
          >
            <span class="checkmark">{{ selectedAlgorithmIds.includes(algorithm.id) ? '✓' : '' }}</span>
            <span class="tab-dot" :style="{ background: colorByAlgorithm[algorithm.id] }" />
            <span>{{ algorithm.label }}</span>
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

        <div v-if="loadingJobIds.size" class="loading-note">正在读取轨迹…</div>
        <p v-for="(message, jobId) in errors" :key="jobId" class="plot-error">{{ message }}</p>
        <TrajectoryPlot v-if="selectedSeries.length" :series="selectedSeries" />
        <div v-else-if="!loadingJobIds.size" class="plot-placeholder">
          请选择至少一个数据集和算法
        </div>
      </div>
    </div>
    <p v-else class="empty">完成至少一个任务后即可查看轨迹。</p>
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
.results-heading p { margin: 0; color: var(--ink-muted); font-size: 13px; }
.endpoint-legend { display: flex; align-items: center; gap: 6px; color: var(--ink-muted); font-size: 11px; }
.endpoint-legend span { width: 9px; height: 9px; border: 2px solid #6f8791; border-radius: 50%; }
.endpoint-legend .solid { margin-left: 7px; background: #6f8791; }

.result-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 20px; }
.result-filters { display: grid; align-content: start; gap: 15px; }
fieldset { display: grid; gap: 6px; min-width: 0; margin: 0; padding: 0; border: 0; }
legend { margin-bottom: 6px; color: #68797f; font-size: 11px; font-weight: 900; letter-spacing: .08em; }
.result-filters button {
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
.result-filters fieldset:last-child button { grid-template-columns: 21px 9px minmax(0, 1fr); }
.result-filters button:hover { background: #f0f3f1; }
.result-filters button.active { border-color: #cbd7d5; background: #f4f7f5; }
.result-filters button > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
