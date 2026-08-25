import type {
  CatalogResponse,
  AccuracyResponse,
  EndPoseResponse,
  ResultsResponse,
  CreateRunRequest,
  PerformanceResponse,
  RunSnapshot,
  StaticReport,
  TrajectoryResponse,
} from '../../shared/contracts'
import { isStaticReport } from '@/runtime'

let staticReportPromise: Promise<StaticReport> | null = null

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const value = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(value.error ?? `请求失败 (${response.status})`)
  return value
}

function staticReportUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}report.json`, document.baseURI).toString()
}

async function loadStaticReport(): Promise<StaticReport> {
  staticReportPromise ??= request<StaticReport>(staticReportUrl()).then((report) => {
    if (report.schemaVersion !== 1) {
      throw new Error('静态报告版本不受支持，请重新生成网页数据')
    }
    return report
  })
  return staticReportPromise
}

function staticOnlyError(): Error {
  return new Error('静态报告不支持启动或取消 benchmark')
}

export async function fetchCatalog(): Promise<CatalogResponse> {
  return isStaticReport ? (await loadStaticReport()).catalog : request('/api/catalog')
}

export async function fetchResults(): Promise<ResultsResponse> {
  return isStaticReport
    ? { results: (await loadStaticReport()).results }
    : request('/api/results')
}

export function createRun(payload: CreateRunRequest): Promise<RunSnapshot> {
  if (isStaticReport) return Promise.reject(staticOnlyError())
  return request('/api/runs', { method: 'POST', body: JSON.stringify(payload) })
}

export function cancelRun(runId: string): Promise<RunSnapshot> {
  if (isStaticReport) return Promise.reject(staticOnlyError())
  return request(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' })
}

export async function fetchResultTrajectory(resultId: string): Promise<TrajectoryResponse> {
  if (isStaticReport) {
    const result = (await loadStaticReport()).results.find((item) => item.id === resultId)
    if (!result?.trajectory) throw new Error('静态报告中没有该轨迹')
    return result.trajectory
  }
  return request(`/api/results/${encodeURIComponent(resultId)}/trajectory`)
}

export async function fetchDatasetGroundTruth(datasetId: string): Promise<TrajectoryResponse> {
  if (isStaticReport) {
    const report = await loadStaticReport()
    const groundTruth = report.groundTruth?.[datasetId] ?? report.results
      .filter((item) => item.datasetId === datasetId)
      .map((item) => item.trajectory?.groundTruth)
      .find((trajectory): trajectory is TrajectoryResponse => Boolean(trajectory))
    if (!groundTruth) throw new Error('静态报告中没有该数据集的 Ground truth')
    return groundTruth
  }
  return request(`/api/datasets/${encodeURIComponent(datasetId)}/ground-truth`)
}

export async function fetchDatasetEndPose(datasetId: string): Promise<EndPoseResponse> {
  if (isStaticReport) {
    const endPose = (await loadStaticReport()).endPoses?.[datasetId]
    if (!endPose) throw new Error('静态报告中没有该数据集的真实终点')
    return endPose
  }
  return request(`/api/datasets/${encodeURIComponent(datasetId)}/end-pose`)
}

export async function fetchResultPerformance(resultId: string): Promise<PerformanceResponse> {
  if (isStaticReport) {
    const result = (await loadStaticReport()).results.find((item) => item.id === resultId)
    if (!result?.performance) throw new Error('静态报告中没有该性能结果')
    return result.performance
  }
  return request(`/api/results/${encodeURIComponent(resultId)}/performance`)
}

export async function fetchResultAccuracy(resultId: string): Promise<AccuracyResponse> {
  if (isStaticReport) {
    const result = (await loadStaticReport()).results.find((item) => item.id === resultId)
    if (!result?.accuracy) throw new Error('静态报告中没有该精度结果')
    return result.accuracy
  }
  return request(`/api/results/${encodeURIComponent(resultId)}/accuracy`)
}

export function observeRun(
  runId: string,
  onSnapshot: (snapshot: RunSnapshot) => void,
  onError: () => void,
): () => void {
  if (isStaticReport) throw staticOnlyError()
  const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`)
  source.addEventListener('snapshot', (event) => {
    onSnapshot(JSON.parse((event as MessageEvent<string>).data) as RunSnapshot)
  })
  source.onerror = onError
  return () => source.close()
}
