export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface DatasetCatalogItem {
  id: string
  datasetName: string
  description: string
  bagName: string
  sensorTypes: string[]
  expectedMessages: number | null
  sourceAvailable: boolean
}

export interface AlgorithmCatalogItem {
  id: string
  name: string
  description: string
  sensorTypes: string[]
  available: boolean
}

export interface CatalogResponse {
  datasets: DatasetCatalogItem[]
  algorithms: AlgorithmCatalogItem[]
  buildDirectory: string
}

export interface CreateRunRequest {
  datasetIds: string[]
  algorithmIds: string[]
}

export interface RunJob {
  id: string
  datasetId: string
  datasetName: string
  bagName: string
  algorithmId: string
  algorithmName: string
  status: RunStatus
  processedMessages: number
  expectedMessages: number | null
  progress: number | null
  outputDirectory: string
  error: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface RunSnapshot {
  id: string
  status: RunStatus
  progress: number
  completedJobs: number
  totalJobs: number
  jobs: RunJob[]
  logs: string[]
  createdAt: string
}

export interface BenchmarkResult {
  id: string
  datasetId: string
  datasetName: string
  bagName: string
  algorithmId: string
  algorithmName: string
  hasTrajectory: boolean
  hasPerformance: boolean
  updatedAt: string
}

export interface ResultsResponse {
  results: BenchmarkResult[]
}

export interface TrajectoryPoint {
  timestampNs: string
  x: number
  y: number
  z: number
}

export interface TrajectoryResponse {
  points: TrajectoryPoint[]
  originalPointCount: number
  distanceMeters: number
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    minZ: number
    maxZ: number
  }
}

export interface PerformanceMetric {
  id: string
  label: string
  value: number
  unit: 'ms' | '%' | 'count'
  group:
    | 'overview'
    | 'message'
    | 'stage_mean'
    | 'stage_median'
    | 'stage_p95'
    | 'stage_max'
    | 'stage_total'
    | 'stage_count'
  lowerIsBetter: boolean
}

export interface PerformanceResponse {
  metrics: PerformanceMetric[]
}
