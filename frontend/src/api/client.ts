import type {
  CatalogResponse,
  ResultsResponse,
  CreateRunRequest,
  PerformanceResponse,
  RunSnapshot,
  TrajectoryResponse,
} from '../../shared/contracts'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const value = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(value.error ?? `请求失败 (${response.status})`)
  return value
}

export function fetchCatalog(): Promise<CatalogResponse> {
  return request('/api/catalog')
}

export function fetchResults(): Promise<ResultsResponse> {
  return request('/api/results')
}

export function createRun(payload: CreateRunRequest): Promise<RunSnapshot> {
  return request('/api/runs', { method: 'POST', body: JSON.stringify(payload) })
}

export function cancelRun(runId: string): Promise<RunSnapshot> {
  return request(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' })
}

export function fetchResultTrajectory(resultId: string): Promise<TrajectoryResponse> {
  return request(`/api/results/${encodeURIComponent(resultId)}/trajectory`)
}

export function fetchResultPerformance(resultId: string): Promise<PerformanceResponse> {
  return request(`/api/results/${encodeURIComponent(resultId)}/performance`)
}

export function observeRun(
  runId: string,
  onSnapshot: (snapshot: RunSnapshot) => void,
  onError: () => void,
): () => void {
  const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`)
  source.addEventListener('snapshot', (event) => {
    onSnapshot(JSON.parse((event as MessageEvent<string>).data) as RunSnapshot)
  })
  source.onerror = onError
  return () => source.close()
}
