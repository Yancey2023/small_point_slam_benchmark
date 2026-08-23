<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { BenchmarkResult, PerformanceMetric, PerformanceResponse } from '../../shared/contracts'
import { fetchResultPerformance } from '@/api/client'

const props = defineProps<{
  results: BenchmarkResult[]
}>()

const availableResults = computed(() => props.results.filter((result) => result.hasPerformance))
const selectedDatasetId = ref<string | null>(null)
const selectedAlgorithmIds = ref<string[]>([])
const selectedMetricIds = ref<string[]>([])
const performances = ref<Record<string, PerformanceResponse>>({})
const performanceVersions = ref<Record<string, string>>({})
const loadingJobIds = ref(new Set<string>())
const errors = ref<Record<string, string>>({})
let knownAlgorithmIds = new Set<string>()
let metricSelectionInitialized = false

const colorByAlgorithm: Record<string, string> = {
  fast_lio: '#477b9d',
  point_lio: '#5d927d',
  voxel_map: '#b7863c',
  super_lio: '#766f91',
}
const groupLabels: Record<PerformanceMetric['group'], string> = {
  overview: '总览',
  message: '按消息类型处理耗时',
  stage_mean: '阶段平均耗时',
  stage_median: '阶段中位耗时',
  stage_p95: '阶段 P95 耗时',
  stage_max: '阶段最大耗时',
  stage_total: '阶段累计耗时',
  stage_count: '阶段调用次数',
}
const groupOrder = Object.keys(groupLabels) as PerformanceMetric['group'][]

const datasetOptions = computed(() => uniqueOptions('datasetId', 'datasetName'))
const algorithmOptions = computed(() => uniqueOptions('algorithmId', 'algorithmName'))
const allAlgorithmsSelected = computed(() =>
  algorithmOptions.value.length > 0 &&
  algorithmOptions.value.every((algorithm) => selectedAlgorithmIds.value.includes(algorithm.id)),
)
const selectedJobs = computed(() =>
  availableResults.value.filter(
    (job) =>
      selectedDatasetId.value === job.datasetId &&
      selectedAlgorithmIds.value.includes(job.algorithmId),
  ),
)
const metricOptions = computed(() => {
  const options = new Map<string, PerformanceMetric>()
  for (const performance of Object.values(performances.value)) {
    for (const metric of performance.metrics) options.set(metric.id, metric)
  }
  return [...options.values()]
})
const metricGroups = computed(() =>
  groupOrder.flatMap((group) => {
    const metrics = metricOptions.value.filter((metric) => metric.group === group)
    return metrics.length ? [{ id: group, label: groupLabels[group], metrics }] : []
  }),
)
const charts = computed(() =>
  selectedMetricIds.value.flatMap((metricId) => {
    const definition = metricOptions.value.find((metric) => metric.id === metricId)
    if (!definition) return []
    const rawEntries = selectedJobs.value.flatMap((job) => {
      const metric = performances.value[job.id]?.metrics.find((item) => item.id === metricId)
      if (!metric) return []
      return [{
        id: job.id,
        label: `${job.datasetName} · ${job.algorithmName}`,
        value: metric.value,
        color: colorByAlgorithm[job.algorithmId] ?? '#687b84',
      }]
    })
    const maximum = Math.max(0, ...rawEntries.map((entry) => entry.value))
    return [{
      ...definition,
      entries: rawEntries.map((entry) => ({
        ...entry,
        width: maximum > 0 ? Math.max(2, (entry.value / maximum) * 100) : 0,
      })),
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
  selectedJobs,
  (jobs) => {
    for (const job of jobs) void loadJob(job)
  },
  { immediate: true },
)

watch(metricOptions, (metrics) => {
  if (!metricSelectionInitialized && metrics.length) {
    selectedMetricIds.value = metrics
      .filter((metric) => metric.group === 'overview')
      .map((metric) => metric.id)
    metricSelectionInitialized = true
  }
})

function updateSelection(current: string[], available: Set<string>, known: Set<string>): string[] {
  const retained = current.filter((id) => available.has(id))
  const added = [...available].filter((id) => !known.has(id))
  return [...retained, ...added]
}

async function loadJob(result: BenchmarkResult): Promise<void> {
  const jobId = result.id
  if (
    performanceVersions.value[jobId] === result.updatedAt ||
    loadingJobIds.value.has(jobId)
  ) return
  loadingJobIds.value = new Set(loadingJobIds.value).add(jobId)
  try {
    const performance = await fetchResultPerformance(jobId)
    performances.value = { ...performances.value, [jobId]: performance }
    performanceVersions.value = { ...performanceVersions.value, [jobId]: result.updatedAt }
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

function toggleMetricGroup(metrics: PerformanceMetric[]): void {
  const ids = metrics.map((metric) => metric.id)
  const allSelected = ids.every((id) => selectedMetricIds.value.includes(id))
  selectedMetricIds.value = allSelected
    ? selectedMetricIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...selectedMetricIds.value, ...ids])]
}

function toggleAllAlgorithms(): void {
  selectedAlgorithmIds.value = allAlgorithmsSelected.value
    ? []
    : algorithmOptions.value.map((algorithm) => algorithm.id)
}

function formatValue(value: number, unit: PerformanceMetric['unit']): string {
  if (unit === '%') return `${value.toFixed(1)}%`
  if (unit === 'count') return Math.round(value).toLocaleString()
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${value.toFixed(value >= 100 ? 1 : 2)} ms`
}
</script>

<template>
  <section class="performance-card" aria-labelledby="performance-title">
    <div class="performance-heading">
      <h2 id="performance-title">性能对比</h2>
      <p>数据集单选，算法与指标多选；条形长度按当前指标内的最大值计算</p>
    </div>

    <div v-if="availableResults.length" class="performance-content">
      <div class="filter-grid">
        <fieldset>
          <legend>数据集（单选）</legend>
          <div class="chips">
            <button
              v-for="dataset in datasetOptions"
              :key="dataset.id"
              type="button"
              :aria-pressed="selectedDatasetId === dataset.id"
              :class="{ active: selectedDatasetId === dataset.id, radio: true }"
              @click="selectedDatasetId = dataset.id"
            >
              <span>{{ selectedDatasetId === dataset.id ? '●' : '' }}</span>
              {{ dataset.label }}
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend class="with-action">
            <span>算法</span>
            <button type="button" @click="toggleAllAlgorithms">
              {{ allAlgorithmsSelected ? '清空' : '全选' }}
            </button>
          </legend>
          <div class="chips">
            <button
              v-for="algorithm in algorithmOptions"
              :key="algorithm.id"
              type="button"
              :aria-pressed="selectedAlgorithmIds.includes(algorithm.id)"
              :class="{ active: selectedAlgorithmIds.includes(algorithm.id) }"
              @click="selectedAlgorithmIds = toggle(selectedAlgorithmIds, algorithm.id)"
            >
              <span>{{ selectedAlgorithmIds.includes(algorithm.id) ? '✓' : '' }}</span>
              <i :style="{ background: colorByAlgorithm[algorithm.id] }" />
              {{ algorithm.label }}
            </button>
          </div>
        </fieldset>

        <fieldset class="metric-filter">
          <legend>指标</legend>
          <div class="metric-groups">
            <section v-for="group in metricGroups" :key="group.id" class="metric-group">
              <header>
                <strong>{{ group.label }}</strong>
                <button type="button" @click="toggleMetricGroup(group.metrics)">
                  {{ group.metrics.every((metric) => selectedMetricIds.includes(metric.id)) ? '清空' : '全选' }}
                </button>
              </header>
              <div class="chips">
                <button
                  v-for="metric in group.metrics"
                  :key="metric.id"
                  type="button"
                  :aria-pressed="selectedMetricIds.includes(metric.id)"
                  :class="{ active: selectedMetricIds.includes(metric.id) }"
                  @click="selectedMetricIds = toggle(selectedMetricIds, metric.id)"
                >
                  <span>{{ selectedMetricIds.includes(metric.id) ? '✓' : '' }}</span>
                  {{ metric.label }}
                </button>
              </div>
            </section>
          </div>
        </fieldset>
      </div>

      <div v-if="loadingJobIds.size" class="loading-note">正在读取性能数据…</div>
      <p v-for="(message, jobId) in errors" :key="jobId" class="chart-error">{{ message }}</p>

      <div v-if="charts.length" class="charts">
        <article v-for="chart in charts" :key="chart.id" class="chart">
          <header>
            <h3>{{ chart.label }}</h3>
            <span v-if="chart.lowerIsBetter">越低越好</span>
          </header>
          <div v-if="chart.entries.length" class="bar-list">
            <div v-for="entry in chart.entries" :key="entry.id" class="bar-row">
              <span class="bar-label" :title="entry.label">{{ entry.label }}</span>
              <div class="bar-track">
                <span
                  class="bar-fill"
                  :style="{ width: `${entry.width}%`, background: entry.color }"
                />
              </div>
              <strong>{{ formatValue(entry.value, chart.unit) }}</strong>
            </div>
          </div>
          <p v-else class="chart-empty">当前筛选条件下没有可比较的数据。</p>
        </article>
      </div>
      <div v-else-if="!loadingJobIds.size" class="panel-placeholder">
        请选择至少一个数据集、算法和性能指标
      </div>
    </div>
    <p v-else class="empty">完成至少一个任务后即可比较性能。</p>
  </section>
</template>

<style scoped>
.performance-card {
  padding: 28px;
  border: 1px solid var(--line-soft);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: var(--shadow-card);
}
.performance-heading { margin-bottom: 22px; }
.performance-heading h2 { margin: 0 0 3px; font-size: 23px; }
.performance-heading p { margin: 0; color: var(--ink-muted); font-size: 13px; }
.performance-content { display: grid; gap: 20px; }
.filter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
fieldset { min-width: 0; margin: 0; padding: 14px; border: 1px solid #e1e7e5; border-radius: 18px; background: #f8faf8; }
legend { padding: 0 5px; color: #68797f; font-size: 11px; font-weight: 900; letter-spacing: .08em; }
.with-action { display: flex; width: calc(100% - 10px); align-items: center; justify-content: space-between; gap: 8px; }
.with-action button { padding: 3px 7px; border: 0; border-radius: 7px; color: #60777f; background: #e8efec; cursor: pointer; font-size: 9px; font-weight: 800; letter-spacing: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid #d9e1df;
  border-radius: 10px;
  color: #68767b;
  background: #fff;
  cursor: pointer;
  font-size: 10px;
  font-weight: 750;
}
.chips button:hover { border-color: #bac9c6; }
.chips button.active { border-color: #aebfbc; color: #40575f; background: #edf3f0; }
.chips button > span { display: grid; width: 15px; height: 15px; place-items: center; border: 1px solid #bcc8c7; border-radius: 5px; color: transparent; font-size: 9px; }
.chips button.active > span { border-color: #607c89; color: #fff; background: #607c89; }
.chips button.radio > span { border-radius: 50%; font-size: 7px; }
.chips i { width: 7px; height: 7px; border-radius: 50%; }
.metric-filter { grid-column: 1 / -1; }
.metric-groups { display: grid; gap: 13px; }
.metric-group { display: grid; gap: 7px; }
.metric-group header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.metric-group header strong { color: #66767b; font-size: 10px; }
.metric-group header button { padding: 3px 7px; border: 0; border-radius: 7px; color: #60777f; background: #e8efec; cursor: pointer; font-size: 9px; font-weight: 800; }
.loading-note { color: var(--ink-muted); font-size: 11px; text-align: center; }
.chart-error { margin: 0; color: #a85e62; font-size: 11px; text-align: center; }

.charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.chart { min-width: 0; padding: 17px; border: 1px solid #e2e7e5; border-radius: 19px; background: #fbfcfa; }
.chart header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 15px; }
.chart h3 { margin: 0; color: #45585f; font-size: 13px; }
.chart header > span { flex: none; padding: 4px 7px; border-radius: 7px; color: #6a7e79; background: #e9f0ed; font-size: 8px; font-weight: 800; }
.bar-list { display: grid; gap: 10px; }
.bar-row { display: grid; grid-template-columns: minmax(100px, .9fr) minmax(110px, 1.3fr) 70px; align-items: center; gap: 9px; }
.bar-label { overflow: hidden; color: #6b787d; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { height: 12px; overflow: hidden; border-radius: 5px; background: #e9edeb; }
.bar-fill { display: block; height: 100%; border-radius: 5px; opacity: .88; transition: width 220ms ease; }
.bar-row strong { color: #4b5b61; font-size: 10px; font-variant-numeric: tabular-nums; text-align: right; }
.chart-empty, .panel-placeholder, .empty { color: var(--ink-muted); font-size: 11px; text-align: center; }
.panel-placeholder { display: grid; min-height: 180px; place-items: center; border: 1px dashed #cad4d2; border-radius: 19px; background: #f7f9f7; }
.empty { padding: 40px; }

@media (max-width: 900px) {
  .filter-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .charts { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .performance-card { padding: 20px; }
  .bar-row { grid-template-columns: minmax(80px, .8fr) minmax(80px, 1fr) 62px; gap: 6px; }
}
</style>
