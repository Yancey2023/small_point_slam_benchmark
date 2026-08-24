import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { BenchmarkResult, CatalogResponse, RunMode, RunSnapshot } from '../../shared/contracts'
import { cancelRun, createRun, fetchCatalog, fetchResults, observeRun } from '@/api/client'

const terminalStatuses = new Set(['completed', 'skipped', 'failed', 'cancelled'])

export function useBenchmark() {
  const catalog = ref<CatalogResponse | null>(null)
  const selectedDatasetIds = ref<string[]>([])
  const selectedAlgorithmIds = ref<string[]>([])
  const selectedRunMode = ref<RunMode | null>(null)
  const results = ref<BenchmarkResult[]>([])
  const run = ref<RunSnapshot | null>(null)
  const loading = ref(true)
  const starting = ref(false)
  const error = ref<string | null>(null)
  let selectionsInitialized = false
  let stopObserving: (() => void) | null = null

  const canRun = computed(
    () =>
      selectedDatasetIds.value.length > 0 &&
      selectedAlgorithmIds.value.length > 0 &&
      selectedRunMode.value !== null &&
      !starting.value &&
      !['queued', 'running'].includes(run.value?.status ?? ''),
  )

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [loadedCatalog, loadedResults] = await Promise.all([fetchCatalog(), fetchResults()])
      catalog.value = loadedCatalog
      results.value = loadedResults.results
      if (!selectionsInitialized) {
        selectedDatasetIds.value = []
        selectedAlgorithmIds.value = loadedCatalog.algorithms
          .filter((item) => item.available)
          .map((item) => item.id)
        selectedRunMode.value = loadedCatalog.runModes[0]?.id ?? null
        selectionsInitialized = true
      }
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading.value = false
    }
  }

  function watchRun(runId: string): void {
    stopObserving?.()
    stopObserving = observeRun(
      runId,
      (snapshot) => {
        const completedJobsChanged = snapshot.completedJobs !== run.value?.completedJobs
        run.value = snapshot
        if (completedJobsChanged && snapshot.completedJobs > 0) void refreshResults()
        if (terminalStatuses.has(snapshot.status)) {
          stopObserving?.()
          stopObserving = null
        }
      },
      () => {
        if (!terminalStatuses.has(run.value?.status ?? '')) {
          error.value = '实时进度连接中断，请刷新页面后重试'
        }
      },
    )
  }

  async function refreshResults(): Promise<void> {
    try {
      results.value = (await fetchResults()).results
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    }
  }

  async function start(): Promise<void> {
    if (!canRun.value || !selectedRunMode.value) return
    starting.value = true
    error.value = null
    try {
      const createdRun = await createRun({
        datasetIds: selectedDatasetIds.value,
        algorithmIds: selectedAlgorithmIds.value,
        runMode: selectedRunMode.value,
      })
      run.value = createdRun
      watchRun(createdRun.id)
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      starting.value = false
    }
  }

  async function cancel(): Promise<void> {
    if (!run.value) return
    try {
      run.value = await cancelRun(run.value.id)
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    }
  }

  onMounted(load)
  onBeforeUnmount(() => stopObserving?.())

  return {
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
  }
}
