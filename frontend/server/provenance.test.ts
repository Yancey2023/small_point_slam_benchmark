import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  bagConfigSha256,
  evaluateRunProvenance,
  executableFingerprint,
  readRunProvenance,
  writeRunProvenance,
} from './provenance.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })))
})

describe('run provenance', () => {
  it('hashes the bag definition so unrelated manifest edits do not match', () => {
    const first = bagConfigSha256({ name: 'door', sensors: [{ id: 1, enabled: true }] })
    expect(first).toBe(bagConfigSha256({ name: 'door', sensors: [{ id: 1, enabled: true }] }))
    expect(first).not.toBe(bagConfigSha256({ name: 'door', sensors: [{ id: 1, enabled: false }] }))
    expect(first).not.toBe(bagConfigSha256({ name: 'door2', sensors: [{ id: 1, enabled: true }] }))
  })

  it('round-trips a provenance record through disk', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'slam-prov-'))
    temporaryDirectories.push(directory)

    expect(await readRunProvenance(directory)).toBeNull()

    await writeRunProvenance(directory, {
      config_sha256: 'config-abc',
      executable_sha256: 'exec-def',
    })
    await expect(readFile(path.join(directory, 'provenance.json'), 'utf8'))
      .resolves.toContain('"version": 1')
    expect(await readRunProvenance(directory)).toEqual({
      version: 1,
      config_sha256: 'config-abc',
      executable_sha256: 'exec-def',
    })
  })

  it('evaluates staleness only when both current values are verifiable', () => {
    const stored = { version: 1 as const, config_sha256: 'a', executable_sha256: 'b' }
    expect(evaluateRunProvenance(null, { configSha256: 'a', executable: { sha256: 'b', mtimeMs: 1 } }))
      .toBeNull()
    expect(evaluateRunProvenance(stored, { configSha256: null, executable: { sha256: 'b', mtimeMs: 1 } }))
      .toBeNull()
    // A missing binary counts as changed: the result can no longer be reproduced.
    expect(evaluateRunProvenance(stored, { configSha256: 'a', executable: { sha256: null, mtimeMs: null } }))
      .toBe(true)
    expect(evaluateRunProvenance(stored, { configSha256: 'a', executable: { sha256: 'b', mtimeMs: 2 } }))
      .toBe(false)
    expect(evaluateRunProvenance(stored, { configSha256: 'other', executable: { sha256: 'b', mtimeMs: 2 } }))
      .toBe(true)
  })

  it('fingerprints binaries and memoizes by modification time', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'slam-prov-'))
    temporaryDirectories.push(directory)
    const executablePath = path.join(directory, 'algo_benchmark')

    expect(await executableFingerprint(null)).toEqual({ sha256: null, mtimeMs: null })
    expect(await executableFingerprint(path.join(directory, 'missing'))).toEqual({
      sha256: null,
      mtimeMs: null,
    })

    await writeFile(executablePath, 'payload-v1')
    const first = await executableFingerprint(executablePath)
    const second = await executableFingerprint(executablePath)
    expect(second).toBe(first)
    expect(first.sha256).toHaveLength(64)

    await writeFile(executablePath, 'payload-v2-longer')
    const third = await executableFingerprint(executablePath)
    expect(third.mtimeMs).not.toBe(first.mtimeMs)
    expect(third.sha256).not.toBe(first.sha256)
  })
})
