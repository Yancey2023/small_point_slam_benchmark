import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readStaticReport } from './static-report.js'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const reportPath = path.resolve(
  process.env.BENCHMARK_REPORT_OUTPUT ?? path.join(moduleDirectory, '..', 'public', 'report.json'),
)
const report = await readStaticReport(reportPath)
if (report.results.length === 0) {
  throw new Error('静态报告没有 benchmark 结果，拒绝构建空白 GitHub Pages')
}

console.log(
  `Validated static report schema ${report.schemaVersion}: ` +
  `${report.results.length} result(s), generated ${report.generatedAt}`,
)
