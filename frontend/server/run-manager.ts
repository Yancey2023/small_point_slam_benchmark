import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'

import type { CreateRunRequest, RunJob, RunSnapshot, RunStatus } from '../shared/contracts.js'
import type { RuntimeCatalog } from './catalog.js'
import { relativeResultDirectory } from './results.js'
import { isRunMode, runModeInfo } from './run-modes.js'

interface InternalJob extends RunJob {
  manifestPath: string
  configPath: string
  executablePath: string
  absoluteOutputDirectory: string
}

interface InternalRun {
  snapshot: RunSnapshot
  jobs: InternalJob[]
  listeners: Set<(snapshot: RunSnapshot) => void>
  child: ChildProcessByStdio<null, Readable, Readable> | null
  cancellationRequested: boolean
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function publicSnapshot(run: InternalRun): RunSnapshot {
  return {
    ...run.snapshot,
    jobs: run.jobs.map(
      ({ manifestPath: _manifest, configPath: _config, executablePath: _executable,
        absoluteOutputDirectory: _output, ...job }) => ({ ...job }),
    ),
    logs: [...run.snapshot.logs],
  }
}

async function countCsvRows(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, 'utf8')
    const lines = content.trimEnd().split(/\r?\n/)
    return Math.max(0, lines.length - 1)
  } catch {
    return 0
  }
}

export class RunManager {
  private readonly runs = new Map<string, InternalRun>()

  constructor(private readonly projectRoot: string) {}

  create(request: CreateRunRequest, catalog: RuntimeCatalog): RunSnapshot {
    if (this.activeRun()) throw new Error('已有测试正在运行，请等待完成或先取消')
    const datasetIds = unique(request.datasetIds ?? [])
    const algorithmIds = unique(request.algorithmIds ?? [])
    if (!isRunMode(request.runMode)) throw new Error('请选择有效的运行模式')
    const mode = runModeInfo(request.runMode)
    if (datasetIds.length === 0 || algorithmIds.length === 0) {
      throw new Error('至少选择一个数据集和一个算法')
    }

    const runId = randomUUID()
    const jobs: InternalJob[] = []
    for (const datasetId of datasetIds) {
      const dataset = catalog.datasets.get(datasetId)
      if (!dataset) throw new Error(`未知数据集：${datasetId}`)
      if (!dataset.sourceAvailable) throw new Error(`数据文件不存在：${dataset.datasetName}/${dataset.bagName}`)
      for (const algorithmId of algorithmIds) {
        const algorithm = catalog.algorithms.get(algorithmId)
        if (!algorithm) throw new Error(`未知算法：${algorithmId}`)
        if (!algorithm.executablePath) throw new Error(`${algorithm.name} 尚未构建`)
        const relativeOutput = relativeResultDirectory(
          catalog.datasets.values(),
          dataset,
          algorithm.id,
        )
        jobs.push({
          id: randomUUID(),
          datasetId,
          datasetName: dataset.datasetName,
          bagName: dataset.bagName,
          algorithmId,
          algorithmName: algorithm.name,
          runMode: mode.id,
          runModeName: mode.name,
          status: 'queued',
          processedMessages: 0,
          expectedMessages: dataset.expectedMessages,
          progress: dataset.expectedMessages ? 0 : null,
          outputDirectory: relativeOutput.split(path.sep).join('/'),
          error: null,
          startedAt: null,
          completedAt: null,
          manifestPath: dataset.manifestPath,
          configPath: algorithm.configPath,
          executablePath: algorithm.executablePath,
          absoluteOutputDirectory: path.join(this.projectRoot, relativeOutput),
        })
      }
    }

    const snapshot: RunSnapshot = {
      id: runId,
      status: 'queued',
      progress: 0,
      completedJobs: 0,
      totalJobs: jobs.length,
      jobs: [],
      logs: [],
      createdAt: new Date().toISOString(),
    }
    const run: InternalRun = {
      snapshot,
      jobs,
      listeners: new Set(),
      child: null,
      cancellationRequested: false,
    }
    this.runs.set(runId, run)
    void this.execute(run)
    return publicSnapshot(run)
  }

  get(runId: string): RunSnapshot | null {
    const run = this.runs.get(runId)
    return run ? publicSnapshot(run) : null
  }

  subscribe(runId: string, listener: (snapshot: RunSnapshot) => void): (() => void) | null {
    const run = this.runs.get(runId)
    if (!run) return null
    run.listeners.add(listener)
    listener(publicSnapshot(run))
    return () => run.listeners.delete(listener)
  }

  cancel(runId: string): RunSnapshot | null {
    const run = this.runs.get(runId)
    if (!run) return null
    if (!['queued', 'running'].includes(run.snapshot.status)) return publicSnapshot(run)
    run.cancellationRequested = true
    run.child?.kill()
    for (const job of run.jobs) {
      if (job.status === 'queued') job.status = 'cancelled'
    }
    this.update(run)
    return publicSnapshot(run)
  }

  resultPath(runId: string, jobId: string): string | null {
    const run = this.runs.get(runId)
    const job = run?.jobs.find((item) => item.id === jobId)
    if (!job || job.status !== 'completed') return null
    return path.join(job.absoluteOutputDirectory, 'final_trajectory.csv')
  }

  resultDirectory(runId: string, jobId: string): string | null {
    const run = this.runs.get(runId)
    const job = run?.jobs.find((item) => item.id === jobId)
    return job?.status === 'completed' ? job.absoluteOutputDirectory : null
  }

  private activeRun(): InternalRun | undefined {
    return [...this.runs.values()].find((run) => ['queued', 'running'].includes(run.snapshot.status))
  }

  private appendLog(run: InternalRun, source: string, chunk: Buffer): void {
    for (const line of chunk.toString('utf8').split(/\r?\n/).filter(Boolean)) {
      run.snapshot.logs.push(`[${source}] ${line}`)
    }
    if (run.snapshot.logs.length > 160) run.snapshot.logs.splice(0, run.snapshot.logs.length - 160)
    this.emit(run)
  }

  private update(run: InternalRun): void {
    const terminal: RunStatus[] = ['completed', 'failed', 'cancelled']
    run.snapshot.completedJobs = run.jobs.filter((job) => terminal.includes(job.status)).length
    const fractions = run.jobs.map((job) => {
      if (terminal.includes(job.status)) return 1
      return job.progress ?? 0
    })
    run.snapshot.progress = fractions.length
      ? Math.round((fractions.reduce((sum, value) => sum + value, 0) / fractions.length) * 1000) / 10
      : 0
    this.emit(run)
  }

  private emit(run: InternalRun): void {
    const snapshot = publicSnapshot(run)
    for (const listener of run.listeners) listener(snapshot)
  }

  private async execute(run: InternalRun): Promise<void> {
    run.snapshot.status = 'running'
    this.update(run)
    for (const job of run.jobs) {
      if (run.cancellationRequested) break
      await this.executeJob(run, job)
    }
    if (run.cancellationRequested) {
      run.snapshot.status = 'cancelled'
    } else if (run.jobs.some((job) => job.status === 'failed')) {
      run.snapshot.status = 'failed'
    } else {
      run.snapshot.status = 'completed'
      run.snapshot.progress = 100
    }
    run.child = null
    this.update(run)
  }

  private async executeJob(run: InternalRun, job: InternalJob): Promise<void> {
    await mkdir(job.absoluteOutputDirectory, { recursive: true })
    job.status = 'running'
    job.startedAt = new Date().toISOString()
    run.snapshot.logs.push(
      `开始 ${job.datasetName}/${job.bagName} · ${job.algorithmName} · ${job.runModeName}`,
    )
    this.update(run)

    const args = [
      '--dataset-manifest', job.manifestPath,
      '--bag', job.bagName,
      '--config', job.configPath,
      '--output', job.absoluteOutputDirectory,
      '--run-mode', job.runMode,
    ]
    const child = spawn(job.executablePath, args, {
      cwd: this.projectRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    run.child = child
    child.stdout.on('data', (chunk: Buffer) => this.appendLog(run, 'out', chunk))
    child.stderr.on('data', (chunk: Buffer) => this.appendLog(run, 'err', chunk))

    const sensorCsv = path.join(job.absoluteOutputDirectory, 'sensor_messages.csv')
    const progressTimer = setInterval(() => {
      void countCsvRows(sensorCsv).then((count) => {
        job.processedMessages = count
        if (job.expectedMessages) {
          job.progress = Math.min(0.99, count / job.expectedMessages)
        }
        this.update(run)
      })
    }, 300)

    const exit = await new Promise<{ code: number | null; error: Error | null }>((resolve) => {
      child.once('error', (error) => resolve({ code: null, error }))
      child.once('exit', (code) => resolve({ code, error: null }))
    })
    clearInterval(progressTimer)
    run.child = null
    job.processedMessages = await countCsvRows(sensorCsv)
    job.completedAt = new Date().toISOString()

    if (run.cancellationRequested) {
      job.status = 'cancelled'
    } else if (exit.error || exit.code !== 0) {
      job.status = 'failed'
      job.error = exit.error?.message ?? `进程退出码 ${String(exit.code)}`
      run.snapshot.logs.push(`${job.algorithmName} 运行失败：${job.error}`)
    } else {
      job.status = 'completed'
      job.progress = 1
      run.snapshot.logs.push(`${job.algorithmName} 完成，轨迹已写入 ${job.outputDirectory}`)
    }
    this.update(run)
  }
}
