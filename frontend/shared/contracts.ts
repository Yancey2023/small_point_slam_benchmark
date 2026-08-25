export type RunStatus = 'queued' | 'running' | 'completed' | 'skipped' | 'failed' | 'cancelled'
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
  sensorNames?: string[]
  expectedMessages: number | null
  sourceAvailable: boolean
  hasGroundTruth: boolean
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
  compatibilityReason: string | null
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
  hasGroundTruth: boolean
  status?: 'completed' | 'failed'
  failureReason?: string | null
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
  groundTruth?: TrajectoryResponse
}

export interface AccuracyResponse {
  status: 'success' | 'failed'
  ateRmseMeters: number | null
  matchedPoseCount: number
  reason: string | null
}

export interface PerformanceMetric {
  id: string
  label: string
  description?: string
  value: number
  unit: 'ms' | '%' | 'MB' | 'count'
  group: string
  groupLabel: string
  groupDescription?: string
  defaultSelected: boolean
  lowerIsBetter: boolean
  selectionId?: string
  timingStatistic?: 'mean' | 'p95' | 'max' | 'total'
}

export interface PerformanceResponse {
  runMode: RunMode
  runModeLabel: string
  cpuDescription: string
  metrics: PerformanceMetric[]
}

export interface StaticBenchmarkResult extends BenchmarkResult {
  trajectory?: TrajectoryResponse
  performance?: PerformanceResponse
  accuracy?: AccuracyResponse
}

export interface StaticReport {
  schemaVersion: 1
  generatedAt: string
  catalog: CatalogResponse
  results: StaticBenchmarkResult[]
  // Stored once per bag so Ground truth can be rendered without selecting or
  // even having a successful algorithm trajectory.
  groundTruth?: Record<string, TrajectoryResponse>
}
