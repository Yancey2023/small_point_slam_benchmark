import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readRunCompatibility } from './run-manager.js'

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
