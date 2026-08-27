import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'

import type { CreateRunRequest, RunJob, RunSnapshot, RunStatus } from '../shared/contracts.js'
import type { RuntimeCatalog } from './catalog.js'
import { bagConfigSha256, executableFingerprint, writeRunProvenance } from './provenance.js'
import { relativeResultDirectory } from './results.js'
import { isRunMode, runModeInfo } from './run-modes.js'

interface InternalJob extends RunJob {
  manifestPath: string
  configPath: string
  executablePath: string
  absoluteOutputDirectory: string
  executionOutputDirectory: string
  // Parsed manifest definition of the bag; hashed into the provenance record.
  datasetDefinition: unknown
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

const TERMINAL_STATUSES: readonly RunStatus[] = ['completed', 'skipped', 'failed', 'cancelled']

function isTerminalStatus(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/**
 * Overall run progress in percent. Slots that reached an outcome through
 * execution (completed/skipped/failed) count as done; cancelled slots never
 * finished, so only the fraction they actually processed counts.
 */
export function computeRunProgress(
  jobs: ReadonlyArray<{ status: RunStatus; progress?: number | null }>,
): number {
  if (jobs.length === 0) return 0
  const total = jobs.reduce((sum, job) => {
    if (job.status !== 'cancelled' && isTerminalStatus(job.status)) return sum + 1
    return sum + (job.progress ?? 0)
  }, 0)
  return Math.round((total / jobs.length) * 1000) / 10
}

function publicSnapshot(run: InternalRun): RunSnapshot {
  return {
    ...run.snapshot,
    jobs: run.jobs.map(
      ({ manifestPath: _manifest, configPath: _config, executablePath: _executable,
        absoluteOutputDirectory: _output, executionOutputDirectory: _execution, ...job }) => ({ ...job }),
    ),
    logs: [...run.snapshot.logs],
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function promoteResultDirectory(
  stagedDirectory: string,
  outputDirectory: string,
  backupSuffix: string,
): Promise<void> {
  const backupDirectory = `${outputDirectory}.backup-${backupSuffix}`
  await rm(backupDirectory, { force: true, recursive: true })
  const hadPreviousResult = await exists(outputDirectory)
  if (hadPreviousResult) await rename(outputDirectory, backupDirectory)
  try {
    await rename(stagedDirectory, outputDirectory)
  } catch (error) {
    if (hadPreviousResult) await rename(backupDirectory, outputDirectory)
    throw error
  }
  if (hadPreviousResult) await rm(backupDirectory, { force: true, recursive: true })
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

function parseCsvRow(line: string): string[] {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; ++index) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        ++index
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      values.push(value)
      value = ''
    } else {
      value += character
    }
  }
  values.push(value)
  return values
}

export async function readRunCompatibility(outputDirectory: string): Promise<{
  unsupported: boolean
  reason: string | null
}> {
  try {
    const [header = '', row = ''] = (await readFile(
      path.join(outputDirectory, 'summary.csv'),
      'utf8',
    )).split(/\r?\n/)
    const headers = parseCsvRow(header)
    const values = parseCsvRow(row)
    const status = values[headers.indexOf('status')]
    const reason = values[headers.indexOf('reason')]?.trim() || null
    return { unsupported: status === 'unsupported', reason }
  } catch {
    return { unsupported: false, reason: null }
  }
}

async function readRunOutcome(outputDirectory: string): Promise<{
  status: string | null
  reason: string | null
}> {
  try {
    const [header = '', row = ''] = (await readFile(
      path.join(outputDirectory, 'summary.csv'),
      'utf8',
    )).split(/\r?\n/)
    const headers = parseCsvRow(header)
    const values = parseCsvRow(row)
    return {
      status: values[headers.indexOf('status')] || null,
      reason: values[headers.indexOf('reason')]?.trim() || null,
    }
  } catch {
    return { status: null, reason: null }
  }
}

async function keepFailureSummaryOnly(outputDirectory: string): Promise<void> {
  const entries = await readdir(outputDirectory, { withFileTypes: true })
  await Promise.all(entries
    .filter((entry) => entry.name !== 'summary.csv')
    .map((entry) => rm(path.join(outputDirectory, entry.name), {
      force: true,
      recursive: entry.isDirectory(),
    })))
}

export async function promoteFailedResultDirectory(
  stagedDirectory: string,
  outputDirectory: string,
  backupSuffix: string,
): Promise<void> {
  await keepFailureSummaryOnly(stagedDirectory)
  await promoteResultDirectory(stagedDirectory, outputDirectory, backupSuffix)
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
          dataset,
          algorithm.name,
        )
        const jobId = randomUUID()
        const absoluteOutputDirectory = path.join(this.projectRoot, relativeOutput)
        jobs.push({
          id: jobId,
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
          compatibilityReason: null,
          startedAt: null,
          completedAt: null,
          manifestPath: dataset.manifestPath,
          configPath: algorithm.configPath,
          executablePath: algorithm.executablePath,
          absoluteOutputDirectory,
          executionOutputDirectory: `${absoluteOutputDirectory}.running-${jobId}`,
          datasetDefinition: dataset.definition,
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
    run.snapshot.completedJobs =
      run.jobs.filter((job) => isTerminalStatus(job.status)).length
    run.snapshot.progress = computeRunProgress(run.jobs)
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
    } else if (run.jobs.every((job) => job.status === 'skipped')) {
      run.snapshot.status = 'skipped'
    } else {
      run.snapshot.status = 'completed'
      run.snapshot.progress = 100
    }
    run.child = null
    this.update(run)
  }

  private async executeJob(run: InternalRun, job: InternalJob): Promise<void> {
    await rm(job.executionOutputDirectory, { force: true, recursive: true })
    await mkdir(job.executionOutputDirectory, { recursive: true })
    // Record what produced this run so stored results can be flagged outdated
    // when the bag configuration or the algorithm binary changes afterwards.
    try {
      const [configSha256, executable] = await Promise.all([
        Promise.resolve(bagConfigSha256(job.datasetDefinition)),
        executableFingerprint(job.executablePath),
      ])
      if (configSha256 && executable.sha256) {
        await writeRunProvenance(job.executionOutputDirectory, {
          config_sha256: configSha256,
          executable_sha256: executable.sha256,
        })
      }
    } catch (reason) {
      run.snapshot.logs.push(
        `无法写入 ${job.algorithmName} 的溯源信息：${reason instanceof Error ? reason.message : String(reason)}`,
      )
    }
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
      '--output', job.executionOutputDirectory,
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

    const sensorCsv = path.join(job.executionOutputDirectory, 'sensor_messages.csv')
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
    const outcome = await readRunOutcome(job.executionOutputDirectory)

    if (run.cancellationRequested) {
      job.status = 'cancelled'
      await rm(job.executionOutputDirectory, { force: true, recursive: true })
    } else if (outcome.status === 'failed') {
      job.status = 'failed'
      job.error = outcome.reason ?? '算法运行失败'
      try {
        await promoteFailedResultDirectory(
          job.executionOutputDirectory, job.absoluteOutputDirectory, job.id,
        )
      } catch (reason) {
        job.error = `无法保存失败状态：${reason instanceof Error ? reason.message : String(reason)}`
        await rm(job.executionOutputDirectory, { force: true, recursive: true })
      }
      run.snapshot.logs.push(`${job.algorithmName} 运行失败：${job.error}`)
    } else if (exit.error || exit.code !== 0) {
      job.status = 'failed'
      job.error = exit.error?.message ?? `进程退出码 ${String(exit.code)}`
      run.snapshot.logs.push(`${job.algorithmName} 运行失败：${job.error}`)
      await rm(job.executionOutputDirectory, { force: true, recursive: true })
    } else {
      const compatibility = await readRunCompatibility(job.executionOutputDirectory)
      try {
        await promoteResultDirectory(
          job.executionOutputDirectory, job.absoluteOutputDirectory, job.id,
        )
      } catch (reason) {
        job.status = 'failed'
        job.error = reason instanceof Error ? reason.message : String(reason)
        run.snapshot.logs.push(`${job.algorithmName} 无法发布运行结果：${job.error}`)
        await rm(job.executionOutputDirectory, { force: true, recursive: true })
        this.update(run)
        return
      }
      if (compatibility.unsupported) {
        job.status = 'skipped'
        job.compatibilityReason = compatibility.reason ?? '数据集不满足算法输入要求'
        job.progress = 1
        run.snapshot.logs.push(`${job.algorithmName} 已跳过：${job.compatibilityReason}`)
        this.update(run)
        return
      }
      job.status = 'completed'
      job.progress = 1
      run.snapshot.logs.push(`${job.algorithmName} 完成，轨迹已写入 ${job.outputDirectory}`)
    }
    this.update(run)
  }
}
