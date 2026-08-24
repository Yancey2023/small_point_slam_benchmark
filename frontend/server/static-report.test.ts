import { describe, expect, it } from 'vitest'

import { validateStaticReport } from './static-report.js'

const validReport = {
  schemaVersion: 1,
  generatedAt: '2026-08-24T00:00:00.000Z',
  catalog: { datasets: [], algorithms: [], runModes: [], buildDirectory: 'static' },
  results: [],
}

describe('static benchmark report', () => {
  it('accepts the current precomputed schema', () => {
    expect(() => validateStaticReport(validReport)).not.toThrow()
  })

  it('rejects result metadata that declares missing precomputed payloads', () => {
    expect(() => validateStaticReport({
      ...validReport,
      results: [{
        id: 'result',
        datasetId: 'dataset',
        algorithmId: 'algorithm',
        hasTrajectory: true,
      }],
    })).toThrow('缺少预计算轨迹')
  })

  it('rejects local output paths', () => {
    expect(() => validateStaticReport({
      ...validReport,
      results: [{
        id: 'result',
        datasetId: 'dataset',
        algorithmId: 'algorithm',
        absoluteOutputDirectory: '/private/results',
      }],
    })).toThrow('泄露了本地输出路径')
  })
})
