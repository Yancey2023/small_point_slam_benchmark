import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildStaticReport, writeStaticReport } from './static-report.js'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(process.env.BENCHMARK_ROOT ?? path.join(moduleDirectory, '../..'))
const configuredBuild = process.env.BENCHMARK_BUILD_DIR ?? path.join('build', 'algorithms')
const buildDirectory = path.isAbsolute(configuredBuild)
  ? configuredBuild
  : path.resolve(projectRoot, configuredBuild)
const outputPath = path.resolve(
  process.env.BENCHMARK_REPORT_OUTPUT ?? path.join(moduleDirectory, '..', 'public', 'report.json'),
)

const report = await buildStaticReport(projectRoot, buildDirectory)
await writeStaticReport(report, outputPath)

console.log(`Generated ${report.results.length} precomputed result(s): ${outputPath}`)
