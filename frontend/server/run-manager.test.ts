import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  computeRunProgress,
  promoteFailedResultDirectory,
  promoteResultDirectory,
  readRunCompatibility,
} from './run-manager.js'
import type { RunStatus } from '../shared/contracts.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })))
})

describe('readRunCompatibility', () => {
  it('reads an unsupported result and preserves a quoted reason', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'slam-compatibility-'))
    temporaryDirectories.push(directory)
    await writeFile(
      path.join(directory, 'summary.csv'),
      'run_mode,status,reason\nfull_speed,unsupported,"缺少 GNSS, GPS"\n',
    )

    await expect(readRunCompatibility(directory)).resolves.toEqual({
      unsupported: true,
      reason: '缺少 GNSS, GPS',
    })
  })
})

describe('promoteResultDirectory', () => {
  it('replaces only the selected result after the staged run succeeds', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'slam-result-promotion-'))
    temporaryDirectories.push(directory)
    const output = path.join(directory, 'dataset-bag-algorithm')
    const staged = `${output}.running-job`
    await Promise.all([mkdir(output), mkdir(staged)])
    await Promise.all([
      writeFile(path.join(output, 'summary.csv'), 'old'),
      writeFile(path.join(staged, 'summary.csv'), 'new'),
      writeFile(path.join(directory, 'unrelated.csv'), 'keep'),
    ])

    await promoteResultDirectory(staged, output, 'job')

    await expect(readFile(path.join(output, 'summary.csv'), 'utf8')).resolves.toBe('new')
    await expect(readFile(path.join(directory, 'unrelated.csv'), 'utf8')).resolves.toBe('keep')
  })

  it('restores the previous result when the staged directory cannot be published', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'slam-result-rollback-'))
    temporaryDirectories.push(directory)
    const output = path.join(directory, 'dataset-bag-algorithm')
    await mkdir(output)
    await writeFile(path.join(output, 'summary.csv'), 'old')

    await expect(promoteResultDirectory(
      path.join(directory, 'missing-staged-result'), output, 'job',
    )).rejects.toThrow()

    await expect(readFile(path.join(output, 'summary.csv'), 'utf8')).resolves.toBe('old')
  })
})

describe('promoteFailedResultDirectory', () => {
  it('replaces a previous successful result with only the failure summary', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'slam-failed-result-'))
    temporaryDirectories.push(directory)
    const output = path.join(directory, 'dataset-bag-algorithm')
    const staged = `${output}.running-job`
    await Promise.all([mkdir(output), mkdir(staged)])
    await Promise.all([
      writeFile(path.join(output, 'final_trajectory.csv'), 'old trajectory'),
      writeFile(path.join(output, 'timings.csv'), 'old timings'),
      writeFile(path.join(staged, 'summary.csv'), 'run_mode,status,reason\nfull_speed,failed,发散\n'),
      writeFile(path.join(staged, 'realtime_pose.csv'), 'partial trajectory'),
      writeFile(path.join(staged, 'cpu.csv'), 'partial performance'),
    ])

    await promoteFailedResultDirectory(staged, output, 'job')

    await expect(readdir(output)).resolves.toEqual(['summary.csv'])
    await expect(readFile(path.join(output, 'summary.csv'), 'utf8'))
      .resolves.toContain(',failed,发散')
  })
})

describe('computeRunProgress', () => {
  const job = (status: RunStatus, progress: number | null = null) => ({ status, progress })

  it('counts only real work for cancelled slots instead of full credit', () => {
    // Cancelling a 5-job run while the first job was at ~99%: the four queued
    // slots never ran, so the run must not jump to 99.8%.
    const jobs = [
      job('cancelled', 0.99),
      job('cancelled'),
      job('cancelled'),
      job('cancelled'),
      job('cancelled'),
    ]
    expect(computeRunProgress(jobs)).toBe(19.8)
  })

  it('keeps full credit for executed terminal outcomes and live progress elsewhere', () => {
    const jobs = [
      job('completed'),
      job('failed', 0.5),
      job('skipped'),
      job('running', 0.25),
      job('queued'),
    ]
    expect(computeRunProgress(jobs)).toBe(65)
  })

  it('returns zero for an empty or untouched run', () => {
    expect(computeRunProgress([])).toBe(0)
    expect(computeRunProgress([job('queued'), job('queued')])).toBe(0)
  })
})
