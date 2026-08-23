export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type RunMode = 'full_speed' | 'realtime'

export interface RunModeCatalogItem {
  id: RunMode
  name: string
  description: string
  cpuDescription: string
}

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
  runModes: RunModeCatalogItem[]
  buildDirectory: string
}

export interface CreateRunRequest {
  datasetIds: string[]
  algorithmIds: string[]
  runMode: RunMode
}

export interface RunJob {
  id: string
  datasetId: string
  datasetName: string
  bagName: string
  algorithmId: string
  algorithmName: string
  runMode: RunMode
  runModeName: string
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
  runMode: RunMode
  runModeName: string
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
  group: string
  groupLabel: string
  defaultSelected: boolean
  lowerIsBetter: boolean
}

export interface PerformanceResponse {
  runMode: RunMode
  runModeLabel: string
  cpuDescription: string
  metrics: PerformanceMetric[]
}
