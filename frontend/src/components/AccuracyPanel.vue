<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { AccuracyResponse, BenchmarkResult } from '../../shared/contracts'
import { fetchResultAccuracy } from '@/api/client'
import HelpTip from '@/components/HelpTip.vue'
import { algorithmColor } from '@/presentation'

const props = defineProps<{ results: BenchmarkResult[] }>()

const availableResults = computed(() => props.results.filter((result) => result.hasGroundTruth))
const selectedDatasetId = ref<string | null>(null)
const accuracies = ref<Record<string, AccuracyResponse>>({})
const accuracyVersions = ref<Record<string, string>>({})
const loadingJobIds = ref(new Set<string>())
const errors = ref<Record<string, string>>({})

const datasetOptions = computed(() => {
  const options = new Map<string, string>()
  for (const result of availableResults.value) {
    options.set(result.datasetId, `${result.datasetName}/${result.bagName}`)
  }
  return [...options].map(([id, label]) => ({ id, label }))
})
const selectedJobs = computed(() => availableResults.value
  .filter((result) => result.datasetId === selectedDatasetId.value)
  .sort((left, right) => left.algorithmName.localeCompare(right.algorithmName)))

watch(
  availableResults,
  (results) => {
    const datasetIds = new Set(results.map((result) => result.datasetId))
    if (!selectedDatasetId.value || !datasetIds.has(selectedDatasetId.value)) {
      selectedDatasetId.value = datasetIds.values().next().value ?? null
    }
  },
  { immediate: true },
)

watch(
  selectedJobs,
  (jobs) => {
    for (const job of jobs) void loadAccuracy(job)
  },
  { immediate: true },
)

async function loadAccuracy(result: BenchmarkResult): Promise<void> {
  if (accuracyVersions.value[result.id] === result.updatedAt || loadingJobIds.value.has(result.id)) {
    return
  }
  loadingJobIds.value = new Set(loadingJobIds.value).add(result.id)
  try {
    const accuracy = await fetchResultAccuracy(result.id)
    accuracies.value = { ...accuracies.value, [result.id]: accuracy }
    accuracyVersions.value = { ...accuracyVersions.value, [result.id]: result.updatedAt }
    const { [result.id]: _removed, ...remainingErrors } = errors.value
    errors.value = remainingErrors
  } catch (reason) {
    errors.value = {
      ...errors.value,
      [result.id]: reason instanceof Error ? reason.message : String(reason),
    }
  } finally {
    const remaining = new Set(loadingJobIds.value)
    remaining.delete(result.id)
    loadingJobIds.value = remaining
  }
}

function formatAte(value: number): string {
  if (value < 0.01) return `${(value * 1000).toFixed(1)} mm`
  return `${value.toFixed(value < 1 ? 3 : 2)} m`
}

const isEndPoseMode = computed(() => selectedJobs.value[0]?.groundTruthFormat === 'end_pose')

function accuracyValue(jobId: string): number {
  const accuracy = accuracies.value[jobId]!
  return accuracy.metric === 'end_pose'
    ? accuracy.endpointErrorMeters!
    : accuracy.ateRmseMeters!
}

function accuracyNote(jobId: string): string {
  const accuracy = accuracies.value[jobId]!
  return accuracy.metric === 'end_pose'
    ? '算法终点相对真实终点的偏差'
    : `${accuracy.matchedPoseCount.toLocaleString()} 对匹配位姿`
}
</script>

<template>
  <section class="accuracy-card" aria-labelledby="accuracy-title">
    <header>
      <div>
        <div class="heading-title">
          <h2 id="accuracy-title">精度对比</h2>
          <HelpTip
            :text="isEndPoseMode
              ? '该数据集只提供真实终点位姿：终点误差是算法轨迹最后一个位姿与真实终点之间的欧氏距离，数值越低越好。'
              : 'ATE RMSE 使用时间戳匹配后的轨迹点，并通过 SE(3) 刚体对齐消除初始坐标系差异；不进行尺度校正，数值越低越好。'"
            label="查看精度对比说明"
            align="start"
          />
        </div>
        <p>{{ isEndPoseMode
          ? '该数据集只提供真实终点位姿，逐算法给出终点误差，无法计算时明确标记失败'
          : '有 ground truth 的数据集逐算法给出 ATE RMSE，无法计算时明确标记失败' }}</p>
      </div>
      <div v-if="datasetOptions.length" class="dataset-select-wrap">
        <select v-model="selectedDatasetId" aria-label="选择精度对比数据集">
          <option v-for="dataset in datasetOptions" :key="dataset.id" :value="dataset.id">
            {{ dataset.label }}
          </option>
        </select>
      </div>
    </header>

    <div v-if="selectedJobs.length" class="accuracy-list">
      <article v-for="job in selectedJobs" :key="job.id" class="accuracy-row">
        <span class="algorithm-dot" :style="{ background: algorithmColor(job.algorithmId) }" />
        <div class="algorithm-name">
          <strong>{{ job.algorithmName }}</strong>
          <small>{{ job.runModeName }}</small>
        </div>
        <div v-if="loadingJobIds.has(job.id)" class="pending">计算中…</div>
        <div v-else-if="errors[job.id]" class="failed" :title="errors[job.id]">
          <strong>失败</strong>
          <small>{{ errors[job.id] }}</small>
        </div>
        <div
          v-else-if="accuracies[job.id]?.status === 'success'"
          class="success"
        >
          <strong>{{ formatAte(accuracyValue(job.id)) }}</strong>
          <small>{{ accuracyNote(job.id) }}</small>
        </div>
        <div
          v-else-if="accuracies[job.id]"
          class="failed"
          :title="accuracies[job.id]!.reason ?? undefined"
        >
          <strong>失败</strong>
          <small>{{ accuracies[job.id]!.reason }}</small>
        </div>
      </article>
    </div>
    <p v-else class="empty">当前结果中没有带 ground truth 的数据集。</p>
  </section>
</template>

<style scoped>
.accuracy-card { padding: 28px; border: 1px solid var(--line-soft); border-radius: 28px; background: rgba(255, 255, 255, .9); box-shadow: var(--shadow-card); }
header { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
h2 { margin: 0 0 3px; font-size: 23px; }
.heading-title { display: flex; align-items: center; gap: 7px; }
header p { margin: 0; color: var(--ink-muted); font-size: 13px; }
.dataset-select-wrap { position: relative; width: min(330px, 42%); }
.dataset-select-wrap::after { position: absolute; top: 50%; right: 12px; color: #60777f; content: '⌄'; pointer-events: none; transform: translateY(-58%); }
select { width: 100%; padding: 11px 34px 11px 13px; border: 1px solid #cbd7d5; border-radius: 14px; color: var(--ink); background: #f4f7f5; cursor: pointer; font: inherit; font-size: 11px; font-weight: 700; appearance: none; }
.accuracy-list { display: grid; gap: 8px; }
.accuracy-row { display: grid; grid-template-columns: 10px minmax(160px, 1fr) minmax(170px, auto); align-items: center; gap: 12px; padding: 13px 15px; border: 1px solid #e3e8e6; border-radius: 16px; background: #f8faf8; }
.algorithm-dot { width: 9px; height: 9px; border-radius: 50%; }
.algorithm-name, .success, .failed { display: grid; gap: 2px; }
.algorithm-name strong { font-size: 12px; }
.algorithm-name small, .success small, .failed small { overflow: hidden; color: var(--ink-muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.success, .failed, .pending { justify-items: end; text-align: right; }
.success strong { color: #456e62; font-size: 16px; }
.failed strong { color: #a85e62; font-size: 12px; font-weight: 900; }
.pending { color: var(--ink-muted); font-size: 11px; }
.empty { margin: 0; padding: 32px; color: var(--ink-muted); text-align: center; }
@media (max-width: 650px) {
  .accuracy-card { padding: 20px; }
  header { align-items: stretch; flex-direction: column; }
  .dataset-select-wrap { width: 100%; }
  .accuracy-row { grid-template-columns: 10px minmax(0, 1fr) minmax(110px, auto); }
}
</style>
