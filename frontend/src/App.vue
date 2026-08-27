<script setup lang="ts">
import { computed } from 'vue'

import AlgorithmPicker from '@/components/AlgorithmPicker.vue'
import AccuracyPanel from '@/components/AccuracyPanel.vue'
import DatasetPicker from '@/components/DatasetPicker.vue'
import PerformancePanel from '@/components/PerformancePanel.vue'
import ResultPanel from '@/components/ResultPanel.vue'
import RunProgress from '@/components/RunProgress.vue'
import { useBenchmark } from '@/composables/useBenchmark'
import { isStaticReport } from '@/runtime'

const {
  catalog,
  selectedDatasetIds,
  selectedAlgorithmIds,
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

const hasResults = computed(() => results.value.length > 0)
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
          </div>

          <aside class="status-column">
            <RunProgress
              v-if="run"
              :run="run"
              :can-run="canRun"
              :starting="starting"
              @cancel="cancel"
              @start="start"
            />
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
              <button type="button" class="start-button" :disabled="!canRun" @click="start">
                <span>{{ starting ? '正在准备…' : '开始跑起来' }}</span>
                <i aria-hidden="true">→</i>
              </button>
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
.status-column { display: flex; min-width: 0; flex-direction: column; gap: 14px; }
.start-button { display: inline-flex; align-items: center; justify-content: center; gap: 10px; margin-top: 26px; padding: 15px 38px; border: 0; border-radius: 999px; color: #fff; background: #8ab8a2; box-shadow: 0 10px 22px rgba(104, 149, 127, 0.34); cursor: pointer; font-size: 13px; font-weight: 800; letter-spacing: 0.08em; transition: transform 200ms cubic-bezier(0.33, 1.3, 0.55, 1), box-shadow 200ms ease, background 200ms ease, opacity 200ms ease, filter 200ms ease; }
.start-button i { display: grid; width: 21px; height: 21px; place-items: center; border-radius: 50%; background: rgba(255, 255, 255, 0.24); font-size: 12px; font-style: normal; transition: transform 200ms ease; }
.start-button:hover:not(:disabled) { transform: translateY(-2px); background: #7cab94; box-shadow: 0 14px 26px rgba(104, 149, 127, 0.4); }
.start-button:hover:not(:disabled) i { transform: translateX(3px); }
.start-button:active:not(:disabled) { transform: translateY(0) scale(0.97); background: #6f9d87; box-shadow: 0 6px 14px rgba(104, 149, 127, 0.3); }
.start-button:focus-visible { outline: 3px solid rgba(138, 184, 162, 0.55); outline-offset: 3px; }
.start-button:disabled { cursor: not-allowed; filter: grayscale(0.45); opacity: 0.5; }

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
@media (max-width: 650px) {
  main, footer { width: min(100% - 24px, 1180px); }
  .page-title { padding: 38px 1px 24px; }
  footer { gap: 8px; flex-direction: column; }
}
</style>
