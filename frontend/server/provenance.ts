import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const PROVENANCE_FILE_NAME = 'provenance.json'

export interface RunProvenance {
    version: 1
    config_sha256: string
    executable_sha256: string
}

interface Fingerprint {
    sha256: string | null
    mtimeMs: number | null
}

function sha256Hex(data: Buffer | string): string {
    return createHash('sha256').update(data).digest('hex')
}

/**
 * Stable hash over this bag's parsed manifest definition. Serializing the
 * parsed node keeps the digest tied to the values that affect a run (sensors,
 * calibration, units, topics, limits, ground truth) while ignoring unrelated
 * bags in the same manifest.
 */
export function bagConfigSha256(definition: unknown): string {
    return sha256Hex(JSON.stringify(definition ?? null))
}

const executableHashCache = new Map<string, Fingerprint>()

/** SHA-256 of the algorithm binary, memoized by path and invalidated by mtime. */
export async function executableFingerprint(executablePath: string | null): Promise<Fingerprint> {
    if (!executablePath) return { sha256: null, mtimeMs: null }
    let info
    try {
        info = await stat(executablePath)
    } catch {
        return { sha256: null, mtimeMs: null }
    }
    const cached = executableHashCache.get(executablePath)
    if (cached && cached.mtimeMs === info.mtimeMs) return cached
    let sha256: string | null
    try {
        sha256 = sha256Hex(await readFile(executablePath))
    } catch {
        sha256 = null
    }
    const fingerprint = { sha256, mtimeMs: info.mtimeMs }
    executableHashCache.set(executablePath, fingerprint)
    return fingerprint
}

export async function writeRunProvenance(
    outputDirectory: string,
    provenance: Omit<RunProvenance, 'version'>,
): Promise<void> {
    const payload: RunProvenance = { version: 1, ...provenance }
    await writeFile(
        path.join(outputDirectory, PROVENANCE_FILE_NAME),
        `${JSON.stringify(payload, null, 2)}\n`,
    )
}

export async function readRunProvenance(outputDirectory: string): Promise<RunProvenance | null> {
    try {
        const raw = JSON.parse(
            await readFile(path.join(outputDirectory, PROVENANCE_FILE_NAME), 'utf8'),
        ) as Partial<RunProvenance>
        if (raw.version !== 1 || typeof raw.config_sha256 !== 'string' ||
            typeof raw.executable_sha256 !== 'string') return null
        return { version: 1, config_sha256: raw.config_sha256, executable_sha256: raw.executable_sha256 }
    } catch {
        return null
    }
}

/**
 * Whether a stored run was produced under a different bag configuration or a
 * different algorithm binary than the current ones. Null when verification is
 * impossible (no provenance was recorded, or the current bag definition is
 * unavailable); a missing executable counts as changed because the result
 * could no longer be reproduced.
 */
export function evaluateRunProvenance(
    stored: RunProvenance | null,
    current: { configSha256: string | null; executable: Fingerprint },
): boolean | null {
    if (!stored || !current.configSha256) return null
    if (!current.executable.sha256) return true
    return stored.config_sha256 !== current.configSha256 ||
        stored.executable_sha256 !== current.executable.sha256
}
