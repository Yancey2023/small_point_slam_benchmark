<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import type { RunSnapshot } from '../../shared/contracts'

const props = defineProps<{
  run: RunSnapshot
  canRun?: boolean
  starting?: boolean
}>()
defineEmits<{ cancel: []; start: [] }>()

const logElement = ref<HTMLElement | null>(null)
const jobListElement = ref<HTMLElement | null>(null)
const activeJob = computed(() => props.run.jobs.find((job) => job.status === 'running'))
const isActive = computed(() => ['queued', 'running'].includes(props.run.status))

const stateCopy: Record<string, string> = {
  queued: '排队中',
  running: '正在认真计算',
  completed: '全部完成',
  skipped: '没有兼容任务',
  failed: '有任务失败',
  cancelled: '已取消',
}

watch(
  () => props.run.logs.length,
  async () => {
    await nextTick()
    if (logElement.value) logElement.value.scrollTop = logElement.value.scrollHeight
  },
)

watch(
  () => activeJob.value?.id,
  async () => {
    await nextTick()
    jobListElement.value
      ?.querySelector<HTMLElement>('.job-row.active')
      ?.scrollIntoView({ block: 'nearest' })
  },
  { immediate: true },
)

function middleParts(value: string, maximumSuffixLength = 18): {
  prefix: string
  suffix: string
} {
  const characters = [...value]
  const suffixLength = Math.min(
    maximumSuffixLength,
    Math.max(1, Math.ceil(characters.length * 0.55)),
  )
  return {
    prefix: characters.slice(0, -suffixLength).join(''),
    suffix: characters.slice(-suffixLength).join(''),
  }
}

function datasetLabel(datasetName: string, bagName: string): string {
  return `${datasetName}/${bagName}`
}
</script>

<template>
  <section class="progress-card" aria-live="polite">
    <div class="status-orbit" :class="run.status">
      <span class="orbit-dot dot-one" />
      <span class="orbit-dot dot-two" />
      <span class="orbit-core">{{ run.status === 'completed' ? '✓' : '⌁' }}</span>
    </div>

    <span class="eyebrow">RUN STATUS</span>
    <h2>{{ stateCopy[run.status] }}</h2>
    <div v-if="activeJob" class="current-job">
      <span
        class="middle-value"
        :title="datasetLabel(activeJob.datasetName, activeJob.bagName)"
      >
        <span class="middle-prefix">
          {{ middleParts(datasetLabel(activeJob.datasetName, activeJob.bagName)).prefix }}
        </span>
        <span class="middle-suffix">
          {{ middleParts(datasetLabel(activeJob.datasetName, activeJob.bagName)).suffix }}
        </span>
      </span>
      <strong class="middle-value" :title="activeJob.algorithmName">
        <span class="middle-prefix">{{ middleParts(activeJob.algorithmName, 14).prefix }}</span>
        <span class="middle-suffix">{{ middleParts(activeJob.algorithmName, 14).suffix }}</span>
      </strong>
      <small>{{ activeJob.runModeName }}</small>
    </div>
    <p v-else class="current-job">
      {{ run.completedJobs }} / {{ run.totalJobs }} 个任务已结束
    </p>

    <div class="progress-row">
      <div class="progress-track">
        <span :style="{ width: `${run.progress}%` }" />
      </div>
      <strong>{{ run.progress.toFixed(1) }}%</strong>
    </div>

    <div ref="jobListElement" class="job-list">
      <div
        v-for="job in run.jobs"
        :key="job.id"
        class="job-row"
        :class="{ active: job.id === activeJob?.id }"
      >
        <span class="job-state" :class="job.status">
          {{ job.status === 'completed' ? '✓' : job.status === 'skipped' ? '–' : job.status === 'failed' ? '!' : '•' }}
        </span>
        <div class="job-body">
          <div class="job-identity">
            <span
              class="job-dataset middle-value"
              :title="datasetLabel(job.datasetName, job.bagName)"
            >
              <span class="middle-prefix">
                {{ middleParts(datasetLabel(job.datasetName, job.bagName)).prefix }}
              </span>
              <span class="middle-suffix">
                {{ middleParts(datasetLabel(job.datasetName, job.bagName)).suffix }}
              </span>
            </span>
            <strong class="job-algorithm middle-value" :title="job.algorithmName">
              <span class="middle-prefix">{{ middleParts(job.algorithmName, 14).prefix }}</span>
              <span class="middle-suffix">{{ middleParts(job.algorithmName, 14).suffix }}</span>
            </strong>
          </div>
          <span class="job-progress">
            <template v-if="job.status === 'running' && job.expectedMessages">
              {{ job.processedMessages.toLocaleString() }} / {{ job.expectedMessages.toLocaleString() }}
            </template>
            <template v-else-if="job.status === 'skipped'">
              {{ job.compatibilityReason ?? stateCopy[job.status] }}
            </template>
            <template v-else-if="job.status === 'failed'">
              {{ job.error ?? stateCopy[job.status] }}
            </template>
            <template v-else>{{ stateCopy[job.status] }}</template>
          </span>
        </div>
      </div>
    </div>

    <details class="logs">
      <summary>查看运行日志</summary>
      <pre ref="logElement">{{ run.logs.join('\n') || '等待进程输出…' }}</pre>
    </details>

    <button v-if="isActive" type="button" class="cancel-button" @click="$emit('cancel')">
      停止这次测试
    </button>
    <button
      v-else
      type="button"
      class="start-button"
      :disabled="!canRun || starting"
      @click="$emit('start')"
    >
      <span>{{ starting ? '正在准备…' : '开始跑起来' }}</span>
      <i aria-hidden="true">→</i>
    </button>
  </section>
</template>

<style scoped>
.progress-card {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  padding: 30px 26px 24px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-xl);
  background: #f9faf8;
  box-shadow: var(--shadow-card);
}

.status-orbit {
  position: relative;
  display: grid;
  width: 104px;
  height: 104px;
  margin: 4px 0 18px;
  place-items: center;
  border: 2px dashed #aac0ca;
  border-radius: 50%;
  animation: spin 10s linear infinite;
}

.status-orbit.completed { border-color: #a7d5c6; animation: none; }
.status-orbit.skipped { border-color: #d3bd8b; animation: none; }
.status-orbit.failed { border-color: #e8a3a3; animation: none; }

.orbit-core {
  display: grid;
  width: 68px;
  height: 68px;
  place-items: center;
  border-radius: 42% 58% 52% 48%;
  color: #4f6f7f;
  background: #dce9ee;
  font-size: 30px;
  font-weight: 900;
  animation: counter-spin 10s linear infinite;
}
.completed .orbit-core { color: #548d7c; background: #dcf5ec; animation: none; }
.skipped .orbit-core { color: #8a7650; background: #f5ecd8; animation: none; }

.orbit-dot { position: absolute; width: 11px; height: 11px; border-radius: 50%; }
.dot-one { top: 4px; left: 20px; background: #8fb0bf; }
.dot-two { right: 2px; bottom: 26px; background: #b9dfd3; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes counter-spin { to { transform: rotate(-360deg); } }

.eyebrow { color: #718790; font-size: 10px; font-weight: 900; letter-spacing: 0.18em; }
h2 { margin: 7px 0 3px; font-size: 22px; }
.current-job {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 2px;
  color: var(--ink-muted);
  font-size: 11px;
  text-align: center;
}
.current-job span, .current-job strong { min-width: 0; }
.current-job strong { color: #40575f; font-size: 13px; }
.current-job small { font-size: 9px; }
.middle-value { display: flex; min-width: 0; justify-content: center; white-space: nowrap; }
.middle-prefix { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.middle-suffix { flex: 0 0 auto; }

.progress-row {
  display: grid;
  width: 100%;
  grid-template-columns: 1fr 52px;
  align-items: center;
  gap: 12px;
  margin: 24px 0 17px;
}
.progress-track { height: 11px; overflow: hidden; border-radius: 99px; background: #e2e7e5; }
.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #668b9c;
  transition: width 300ms ease;
}
.progress-row strong { color: #597481; font-size: 13px; text-align: right; }

.job-list {
  display: grid;
  width: 100%;
  max-height: clamp(240px, 42vh, 440px);
  gap: 7px;
  overflow-y: auto;
  padding-right: 4px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.job-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  font-size: 11px;
}
.job-row.active { border-color: #b8cbd3; background: #f1f6f7; }
.job-state {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 8px;
  color: #8a969a;
  background: #e8ecea;
  font-weight: 900;
}
.job-state.running { color: #557789; background: #dfeaf0; }
.job-state.completed { color: #568c7d; background: #dcf4ec; }
.job-state.skipped { color: #8a7650; background: #f5ecd8; }
.job-state.failed { color: #a85e62; background: #ffe1e1; }
.job-body {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}
.job-identity { display: grid; min-width: 0; gap: 2px; }
.job-dataset, .job-algorithm { min-width: 0; justify-content: flex-start; }
.job-dataset { color: var(--ink-muted); font-size: 9px; }
.job-algorithm { color: #40575f; font-size: 11px; }
.job-progress {
  max-width: 220px;
  overflow: hidden;
  color: var(--ink-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logs { width: 100%; margin-top: 14px; color: var(--ink-muted); font-size: 11px; }
.logs summary { padding: 7px 0; cursor: pointer; font-weight: 700; }
.logs pre {
  max-height: 130px;
  overflow: auto;
  margin: 4px 0 0;
  padding: 11px;
  border-radius: 12px;
  color: #56646b;
  background: #f0f3f1;
  font: 10px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace;
  white-space: pre-wrap;
}
.cancel-button {
  margin-top: 16px;
  border: 0;
  color: #667a83;
  background: transparent;
  cursor: pointer;
  font-weight: 700;
}
.start-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
  padding: 13px 34px;
  border: 0;
  border-radius: 999px;
  color: #fff;
  background: #8ab8a2;
  box-shadow: 0 10px 22px rgba(104, 149, 127, 0.34);
  cursor: pointer;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  transition: transform 200ms cubic-bezier(0.33, 1.3, 0.55, 1), box-shadow 200ms ease, background 200ms ease, opacity 200ms ease, filter 200ms ease;
}
.start-button i {
  display: grid;
  width: 21px;
  height: 21px;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.24);
  font-size: 12px;
  font-style: normal;
  transition: transform 200ms ease;
}
.start-button:hover:not(:disabled) { transform: translateY(-2px); background: #7cab94; box-shadow: 0 14px 26px rgba(104, 149, 127, 0.4); }
.start-button:hover:not(:disabled) i { transform: translateX(3px); }
.start-button:active:not(:disabled) { transform: translateY(0) scale(0.97); background: #6f9d87; box-shadow: 0 6px 14px rgba(104, 149, 127, 0.3); }
.start-button:focus-visible { outline: 3px solid rgba(138, 184, 162, 0.55); outline-offset: 3px; }
.start-button:disabled { cursor: not-allowed; filter: grayscale(0.45); opacity: 0.5; }

@media (max-width: 560px) {
  .progress-card { padding: 24px 18px 20px; }
  .job-body { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .job-progress { max-width: 100%; white-space: normal; }
}
</style>
