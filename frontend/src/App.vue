<script setup lang="ts">
import { computed } from 'vue'

import AlgorithmPicker from '@/components/AlgorithmPicker.vue'
import AccuracyPanel from '@/components/AccuracyPanel.vue'
import DatasetPicker from '@/components/DatasetPicker.vue'
import HelpTip from '@/components/HelpTip.vue'
import PerformancePanel from '@/components/PerformancePanel.vue'
import ResultPanel from '@/components/ResultPanel.vue'
import RunProgress from '@/components/RunProgress.vue'
import RunModePicker from '@/components/RunModePicker.vue'
import { useBenchmark } from '@/composables/useBenchmark'
import { isStaticReport } from '@/runtime'

const {
  catalog,
  selectedDatasetIds,
  selectedAlgorithmIds,
  selectedRunMode,
  results,
  run,
  loading,
  starting,
  error,
  canRun,
  load,
  start,
  cancel,
} = useBenchmark()

const plannedJobs = computed(
  () => selectedDatasetIds.value.length * selectedAlgorithmIds.value.length,
)
const hasResults = computed(() => results.value.length > 0)
const selectedModeInfo = computed(() =>
  catalog.value?.runModes.find((mode) => mode.id === selectedRunMode.value),
)
</script>

<template>
  <div class="app-shell">
    <main id="top">
      <section class="page-title">
        <h1>Small Point SLAM Benchmark</h1>
      </section>

      <div v-if="error" class="error-banner" role="alert">
        <span>!</span>
        <p>{{ error }}</p>
        <button type="button" @click="load">
          {{ isStaticReport ? '重新读取' : '重新连接' }}
        </button>
      </div>

      <div
        v-if="loading"
        class="loading-grid"
        :aria-label="isStaticReport ? '正在读取静态报告' : '正在读取 benchmark 配置'"
      >
        <span /><span /><span />
      </div>

      <template v-else-if="catalog">
        <div v-if="!isStaticReport" class="workspace-grid">
          <div class="selection-column">
            <DatasetPicker v-model="selectedDatasetIds" :datasets="catalog.datasets" />
            <AlgorithmPicker v-model="selectedAlgorithmIds" :algorithms="catalog.algorithms" />
            <div class="launch-card">
              <div class="launch-copy">
                <div class="launch-title">
                  <strong>准备一次新实验</strong>
                  <HelpTip
                    v-if="selectedModeInfo"
                    :text="selectedModeInfo.description"
                    :label="`查看${selectedModeInfo.name}说明`"
                    align="start"
                  />
                </div>
                <span>{{ plannedJobs }} 个任务将按顺序运行，避免干扰 CPU 统计</span>
              </div>
              <RunModePicker
                v-if="selectedRunMode"
                v-model="selectedRunMode"
                :modes="catalog.runModes"
              />
              <button type="button" :disabled="!canRun" @click="start">
                <span>{{ starting ? '正在准备…' : '开始跑起来' }}</span>
                <i aria-hidden="true">→</i>
              </button>
            </div>
          </div>

          <aside class="status-column">
            <RunProgress v-if="run" :run="run" @cancel="cancel" />
            <div v-else class="waiting-card">
              <div class="tiny-world" aria-hidden="true">
                <span class="planet"><i /></span>
                <span class="satellite satellite-one">F</span>
                <span class="satellite satellite-two">P</span>
                <span class="satellite satellite-three">S</span>
              </div>
              <span class="eyebrow">READY WHEN YOU ARE</span>
              <h2>等待一场新实验</h2>
              <p>选好的算法会逐个运行。页面会持续接收消息进度，不用盯着终端啦。</p>
              <div class="ready-list">
                <span><i /> 数据文件检查</span>
                <span><i /> 可执行程序检查</span>
                <span><i /> CSV 自动收集</span>
              </div>
            </div>
          </aside>
        </div>

        <PerformancePanel
          v-if="hasResults"
          class="performance"
          :results="results"
        />
        <ResultPanel
          v-if="hasResults"
          class="results"
          :datasets="catalog.datasets"
          :results="results"
        />
        <AccuracyPanel
          v-if="hasResults"
          class="accuracy"
          :results="results"
        />
        <p v-else-if="isStaticReport" class="static-empty">
          静态报告暂时没有可展示的结果。
        </p>
      </template>
    </main>

    <footer>
      <span>© 2026 Yancey. All rights reserved.</span>
    </footer>
  </div>
</template>

<style scoped>
.app-shell { position: relative; min-height: 100vh; overflow: hidden; }
main { position: relative; z-index: 1; width: min(1180px, calc(100% - 40px)); margin: 0 auto; }
.page-title { padding: 54px 2px 30px; }
.page-title h1 { margin: 0; color: var(--ink); font-size: clamp(30px, 4.5vw, 52px); line-height: 1.12; letter-spacing: -0.045em; }

.error-banner { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; padding: 13px 16px; border: 1px solid #f0caca; border-radius: 15px; color: #925d64; background: #fff1f1; }
.error-banner > span { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 8px; color: white; background: #dc959b; font-weight: 900; }
.error-banner p { flex: 1; margin: 0; font-size: 12px; }
.error-banner button { border: 0; color: #925d64; background: transparent; cursor: pointer; font-weight: 800; }

.loading-grid { display: grid; grid-template-columns: 1fr 1fr 0.75fr; gap: 16px; }
.loading-grid span { height: 340px; border-radius: var(--radius-xl); background: #e8eceb; animation: pulse 1.2s ease-in-out infinite alternate; }
@keyframes pulse { to { opacity: .48; } }

.workspace-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(310px, 0.72fr); align-items: start; gap: 18px; }
.selection-column { display: grid; gap: 16px; }
.status-column { min-width: 0; }
.launch-card { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 19px 20px; border: 1px solid var(--line-soft); border-radius: 22px; background: #f8f9f7; box-shadow: var(--shadow-card); }
.launch-copy { display: grid; min-width: 145px; gap: 3px; }
.launch-title { display: flex; align-items: center; gap: 6px; }
.launch-card strong { font-size: 14px; }
.launch-card span { color: var(--ink-muted); font-size: 11px; }
.launch-card button { display: flex; min-width: 154px; align-items: center; justify-content: space-between; gap: 15px; padding: 13px 14px 13px 17px; border: 0; border-radius: 15px; color: white; background: #59798c; box-shadow: 0 9px 21px rgba(65, 91, 106, 0.2); cursor: pointer; font-weight: 800; transition: 160ms ease; }
.launch-card button:hover:not(:disabled) { transform: translateY(-2px); background: #496c80; box-shadow: 0 12px 26px rgba(65, 91, 106, 0.24); }
.launch-card button:disabled { cursor: not-allowed; filter: grayscale(0.6); opacity: 0.48; }
.launch-card button span { color: white; font-size: 12px; }
.launch-card button i { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 9px; background: rgba(255,255,255,0.18); font-style: normal; }

.waiting-card { display: flex; min-height: 100%; box-sizing: border-box; flex-direction: column; align-items: center; justify-content: center; padding: 32px 29px; border: 1px solid var(--line-soft); border-radius: var(--radius-xl); background: #f9faf8; box-shadow: var(--shadow-card); text-align: center; }
.tiny-world { position: relative; width: 160px; height: 160px; margin-bottom: 15px; border: 1.5px dashed #cbd7d5; border-radius: 50%; }
.planet { position: absolute; top: 42px; left: 42px; display: block; width: 76px; height: 76px; border-radius: 46% 54% 43% 57%; background: #dce9e4; transform: rotate(9deg); }
.planet i { position: absolute; top: 24px; left: 24px; width: 27px; height: 14px; border-bottom: 3px solid #648076; border-radius: 50%; }
.satellite { position: absolute; display: grid; width: 29px; height: 29px; place-items: center; border-radius: 11px; font-size: 10px; font-weight: 900; }
.satellite-one { top: 1px; left: 34px; color: #55768a; background: #dce9ef; }
.satellite-two { top: 61px; right: -3px; color: #608e80; background: #dff5ee; }
.satellite-three { bottom: 2px; left: 28px; color: #6e7187; background: #e7e8ed; }
.eyebrow { color: #74878e; font-size: 9px; font-weight: 900; letter-spacing: .18em; }
.waiting-card h2 { margin: 8px 0 6px; font-size: 20px; }
.waiting-card > p { max-width: 300px; margin: 0; color: var(--ink-muted); font-size: 12px; line-height: 1.7; }
.ready-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 20px; }
.ready-list span { padding: 6px 9px; border-radius: 10px; color: #6f7c81; background: rgba(255,255,255,.75); font-size: 10px; }
.ready-list i { display: inline-block; width: 6px; height: 6px; margin-right: 4px; border-radius: 50%; background: #8ec4b4; }
.results { margin-top: 18px; }
.performance { margin-top: 18px; }
.accuracy { margin-top: 18px; }
.static-empty { margin: 0; padding: 48px 24px; border: 1px dashed var(--line-soft); border-radius: var(--radius-xl); color: var(--ink-muted); background: #f8faf8; text-align: center; }
footer { display: flex; width: min(1180px, calc(100% - 40px)); justify-content: center; margin: 0 auto; padding: 34px 0 26px; color: #879098; font-size: 10px; }

@media (max-width: 900px) {
  .workspace-grid { grid-template-columns: 1fr; }
  .status-column { min-height: 390px; }
}
@media (max-width: 1050px) {
  .launch-card { align-items: stretch; flex-direction: column; }
  .launch-card button { width: 100%; }
}
@media (max-width: 650px) {
  main, footer { width: min(100% - 24px, 1180px); }
  .page-title { padding: 38px 1px 24px; }
  .launch-card { align-items: stretch; flex-direction: column; }
  .launch-card button { width: 100%; }
  footer { gap: 8px; flex-direction: column; }
}
</style>
