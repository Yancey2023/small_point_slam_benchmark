<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { BenchmarkResult, PerformanceMetric, PerformanceResponse } from '../../shared/contracts'
import { fetchResultPerformance } from '@/api/client'
import HelpTip from '@/components/HelpTip.vue'
import { algorithmColor } from '@/presentation'

const props = defineProps<{
  results: BenchmarkResult[]
}>()

const availableResults = computed(() => props.results.filter((result) => result.hasPerformance))
const selectedDatasetId = ref<string | null>(null)
const selectedAlgorithmIds = ref<string[]>([])
const selectedMetricIds = ref<string[]>([])
const selectedTimingStatistic = ref<'mean' | 'p95' | 'max' | 'total'>('total')
const performances = ref<Record<string, PerformanceResponse>>({})
const performanceVersions = ref<Record<string, string>>({})
const loadingJobIds = ref(new Set<string>())
const errors = ref<Record<string, string>>({})
let knownAlgorithmIds = new Set<string>()
let knownDefaultMetricIds = new Set<string>()

const timingStatistics = [
  { id: 'mean', label: '平均耗时' },
  { id: 'p95', label: 'P95 耗时' },
  { id: 'max', label: '峰值耗时' },
  { id: 'total', label: '累积耗时' },
] as const

const hiddenMetricIds = new Set([
  'mean_cpu_percent',
  'p95_cpu_percent',
  'peak_cpu_percent',
  'mean_core_cpu_percent',
  'peak_core_cpu_percent',
  'message_count',
])

const datasetOptions = computed(() => {
  const options = new Map<string, string>()
  for (const job of availableResults.value) {
    options.set(job.datasetId, `${job.datasetName}/${job.bagName}`)
  }
  return [...options].map(([id, label]) => ({ id, label }))
})
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
    for (const metric of performance.metrics) {
      if (hiddenMetricIds.has(metric.id) || metric.id.startsWith('message:')) continue
      if (metric.timingStatistic && metric.timingStatistic !== selectedTimingStatistic.value) {
        continue
      }
      options.set(metricSelectionId(metric), metric)
    }
  }
  return [...options.values()]
})
const metricGroups = computed(() => {
  const groups = new Map<string, {
    id: string
    label: string
    description?: string
    metrics: PerformanceMetric[]
  }>()
  for (const metric of metricOptions.value) {
    const group = groups.get(metric.group) ?? {
      id: metric.group,
      label: metric.groupLabel,
      description: metric.groupDescription,
      metrics: [],
    }
    group.metrics.push(metric)
    groups.set(metric.group, group)
  }
  return [...groups.values()]
})
const charts = computed(() =>
  selectedMetricIds.value.flatMap((metricId) => {
    const definition = metricOptions.value.find(
      (metric) => metricSelectionId(metric) === metricId,
    )
    if (!definition) return []
    const rawEntries = selectedJobs.value.flatMap((job) => {
      const metric = performances.value[job.id]?.metrics.find(
        (item) => metricSelectionId(item) === metricId &&
          (!item.timingStatistic || item.timingStatistic === selectedTimingStatistic.value),
      )
      if (!metric) return []
      return [{
        id: job.id,
        // The dataset is already selected above the chart. Repeating its long
        // name here leaves too little room for the algorithm being compared.
        label: `${job.algorithmName} · ${job.runModeName}`,
        value: metric.value,
        color: algorithmColor(job.algorithmId),
        lowerIsBetter: metric.lowerIsBetter,
      }]
    })
    const maximum = Math.max(0, ...rawEntries.map((entry) => entry.value))
    return [{
      ...definition,
      label: definition.timingStatistic
        ? `${definition.label} · ${timingStatisticLabel(definition.timingStatistic)}`
        : definition.label,
      lowerIsBetter:
        rawEntries.length > 0 && rawEntries.every((entry) => entry.lowerIsBetter),
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
  const availableDefaults = new Set(
    metrics.filter((metric) => metric.defaultSelected).map(metricSelectionId),
  )
  const addedDefaults = [...availableDefaults].filter((id) => !knownDefaultMetricIds.has(id))
  selectedMetricIds.value = [...new Set([...selectedMetricIds.value, ...addedDefaults])]
  knownDefaultMetricIds = new Set([...knownDefaultMetricIds, ...availableDefaults])
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

function metricSelectionId(metric: PerformanceMetric): string {
  return metric.selectionId ?? metric.id
}

function timingStatisticLabel(statistic: NonNullable<PerformanceMetric['timingStatistic']>): string {
  return timingStatistics.find((item) => item.id === statistic)?.label ?? statistic
}

function toggleMetricGroup(metrics: PerformanceMetric[]): void {
  const ids = metrics.map(metricSelectionId)
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
  if (unit === 'MB') return `${value.toFixed(value >= 100 ? 1 : 2)} MB`
  if (unit === 'count') return Math.round(value).toLocaleString()
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${value.toFixed(value >= 100 ? 1 : 2)} ms`
}
</script>

<template>
  <section class="performance-card" aria-labelledby="performance-title">
    <div class="performance-heading">
      <div class="heading-title">
        <h2 id="performance-title">性能对比</h2>
        <HelpTip
          text="条形越长，数值越大。请在同一张图里比较算法，不要用不同图的条形长度互相比较。"
          label="查看性能对比说明"
          align="start"
        />
      </div>
      <p>数据集单选，算法与指标多选；条形长度按当前指标内的最大值计算</p>
    </div>

    <div v-if="availableResults.length" class="performance-content">
      <div class="filter-grid">
        <fieldset class="dataset-filter">
          <legend>数据集（单选）</legend>
          <div class="dataset-select-wrap">
            <select v-model="selectedDatasetId" class="dataset-select" aria-label="选择性能数据集">
              <option v-for="dataset in datasetOptions" :key="dataset.id" :value="dataset.id">
                {{ dataset.label }}
              </option>
            </select>
          </div>
        </fieldset>

        <fieldset class="algorithm-filter">
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
              <i :style="{ background: algorithmColor(algorithm.id) }" />
              {{ algorithm.label }}
            </button>
          </div>
        </fieldset>

        <fieldset class="metric-filter">
          <legend>指标</legend>
          <div class="metric-groups">
            <section v-for="group in metricGroups" :key="group.id" class="metric-group">
              <header>
                <div class="metric-group-title">
                  <strong>{{ group.label }}</strong>
                  <HelpTip
                    v-if="group.description"
                    :text="group.description"
                    :label="`查看${group.label}说明`"
                    align="start"
                  />
                </div>
                <div class="metric-group-actions">
                  <div
                    v-if="group.id === 'stage'"
                    class="timing-switch"
                    aria-label="耗时统计方式"
                  >
                    <HelpTip
                      text="阶段耗时的显示方式：平均、绝大多数情况、最慢一次或全部累计。"
                      label="查看耗时统计方式说明"
                      align="end"
                    />
                    <div>
                      <button
                        v-for="statistic in timingStatistics"
                        :key="statistic.id"
                        type="button"
                        :aria-pressed="selectedTimingStatistic === statistic.id"
                        :class="{ active: selectedTimingStatistic === statistic.id }"
                        @click="selectedTimingStatistic = statistic.id"
                      >
                        {{ statistic.label }}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="group-toggle"
                    @click="toggleMetricGroup(group.metrics)"
                  >
                    {{ group.metrics.every((metric) => selectedMetricIds.includes(metricSelectionId(metric))) ? '清空' : '全选' }}
                  </button>
                </div>
              </header>
              <div class="chips">
                <div
                  v-for="metric in group.metrics"
                  :key="metricSelectionId(metric)"
                  class="metric-choice"
                >
                  <button
                    type="button"
                    :aria-pressed="selectedMetricIds.includes(metricSelectionId(metric))"
                    :class="{ active: selectedMetricIds.includes(metricSelectionId(metric)) }"
                    @click="selectedMetricIds = toggle(selectedMetricIds, metricSelectionId(metric))"
                  >
                    <span>{{ selectedMetricIds.includes(metricSelectionId(metric)) ? '✓' : '' }}</span>
                    {{ metric.label }}
                  </button>
                  <HelpTip
                    v-if="metric.description"
                    :text="metric.description"
                    :label="`查看${metric.label}说明`"
                  />
                </div>
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
            <div class="chart-title">
              <h3>{{ chart.label }}</h3>
              <HelpTip
                v-if="chart.description"
                :text="chart.description"
                :label="`查看${chart.label}说明`"
                align="start"
              />
            </div>
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
.heading-title, .metric-group-title, .chart-title { display: flex; align-items: center; gap: 6px; }
.performance-heading h2 { margin: 0 0 3px; font-size: 23px; }
.performance-heading p { margin: 0; color: var(--ink-muted); font-size: 13px; }
.performance-content { display: grid; gap: 20px; }
.filter-grid { display: grid; gap: 14px; }
fieldset { min-width: 0; margin: 0; padding: 14px; border: 1px solid #e1e7e5; border-radius: 18px; background: #f8faf8; }
legend { padding: 0 5px; color: #68797f; font-size: 11px; font-weight: 900; letter-spacing: .08em; }
.with-action { display: flex; width: calc(100% - 10px); align-items: center; justify-content: space-between; gap: 8px; }
.with-action button { padding: 3px 7px; border: 0; border-radius: 7px; color: #60777f; background: #e8efec; cursor: pointer; font-size: 9px; font-weight: 800; letter-spacing: 0; }
.dataset-select-wrap { position: relative; width: min(100%, 360px); }
.dataset-select-wrap::after { position: absolute; top: 50%; right: 12px; color: #60777f; content: '⌄'; font-size: 15px; pointer-events: none; transform: translateY(-58%); }
.dataset-select {
  width: 100%;
  min-width: 0;
  padding: 9px 34px 9px 11px;
  border: 1px solid #cbd7d5;
  border-radius: 12px;
  color: #40575f;
  background: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: 750;
  appearance: none;
}
.dataset-select:focus-visible { outline: 2px solid #87a0aa; outline-offset: 2px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.metric-choice { display: inline-flex; align-items: center; gap: 4px; }
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
.timing-switch { display: flex; align-items: center; gap: 6px; }
.timing-switch > span { color: #66767b; font-size: 10px; font-weight: 800; }
.timing-switch > div { display: inline-flex; flex-wrap: wrap; gap: 3px; padding: 3px; border: 1px solid #dce4e1; border-radius: 10px; background: #eef2f0; }
.timing-switch button { padding: 5px 9px; border: 0; border-radius: 7px; color: #68777b; background: transparent; cursor: pointer; font-size: 9px; font-weight: 800; }
.timing-switch button.active { color: #40575f; background: #fff; box-shadow: 0 1px 3px rgba(60, 80, 78, .12); }
.metric-groups { display: grid; gap: 13px; }
.metric-group { display: grid; gap: 7px; }
.metric-group header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.metric-group header strong { color: #66767b; font-size: 10px; }
.metric-group-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.metric-group .group-toggle { padding: 3px 7px; border: 0; border-radius: 7px; color: #60777f; background: #e8efec; cursor: pointer; font-size: 9px; font-weight: 800; }
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

@media (max-width: 760px) {
  .charts { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .performance-card { padding: 20px; }
  .metric-group header { align-items: flex-start; flex-direction: column; }
  .metric-group-actions { justify-content: flex-start; }
  .timing-switch { align-items: flex-start; flex-direction: column; }
  .bar-row { grid-template-columns: minmax(80px, .8fr) minmax(80px, 1fr) 62px; gap: 6px; }
}
</style>
