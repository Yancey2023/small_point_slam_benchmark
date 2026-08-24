<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import type { RunSnapshot } from '../../shared/contracts'

const props = defineProps<{ run: RunSnapshot }>()
defineEmits<{ cancel: [] }>()

const logElement = ref<HTMLElement | null>(null)
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
    <p v-if="activeJob" class="current-job">
      {{ activeJob.datasetName }} / {{ activeJob.algorithmName }} · {{ activeJob.runModeName }}
    </p>
    <p v-else class="current-job">
      {{ run.completedJobs }} / {{ run.totalJobs }} 个任务已结束
    </p>

    <div class="progress-row">
      <div class="progress-track">
        <span :style="{ width: `${run.progress}%` }" />
      </div>
      <strong>{{ run.progress.toFixed(1) }}%</strong>
    </div>

    <div class="job-list">
      <div v-for="job in run.jobs" :key="job.id" class="job-row">
        <span class="job-state" :class="job.status">
          {{ job.status === 'completed' ? '✓' : job.status === 'skipped' ? '–' : job.status === 'failed' ? '!' : '•' }}
        </span>
        <span class="job-name">{{ job.datasetName }} · {{ job.algorithmName }}</span>
        <span class="job-progress">
          <template v-if="job.status === 'running' && job.expectedMessages">
            {{ job.processedMessages.toLocaleString() }} / {{ job.expectedMessages.toLocaleString() }}
          </template>
          <template v-else-if="job.status === 'skipped'">
            {{ job.compatibilityReason ?? stateCopy[job.status] }}
          </template>
          <template v-else>{{ stateCopy[job.status] }}</template>
        </span>
      </div>
    </div>

    <details class="logs">
      <summary>查看运行日志</summary>
      <pre ref="logElement">{{ run.logs.join('\n') || '等待进程输出…' }}</pre>
    </details>

    <button v-if="isActive" type="button" class="cancel-button" @click="$emit('cancel')">
      停止这次测试
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
.current-job { margin: 0; color: var(--ink-muted); font-size: 13px; text-align: center; }

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

.job-list { display: grid; width: 100%; gap: 7px; }
.job-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  font-size: 11px;
}
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
.job-name { overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.job-progress {
  max-width: 280px;
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
</style>
