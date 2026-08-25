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

  it('requires a precomputed accuracy result when ground truth is declared', () => {
    expect(() => validateStaticReport({
      ...validReport,
      results: [{
        id: 'result',
        datasetId: 'dataset',
        algorithmId: 'algorithm',
        hasGroundTruth: true,
      }],
    })).toThrow('缺少预计算精度')
  })

  it('accepts Ground truth stored independently from algorithm results', () => {
    expect(() => validateStaticReport({
      ...validReport,
      groundTruth: {
        dataset: {
          points: [{ timestampNs: '1', x: 0, y: 0, z: 0 }],
          originalPointCount: 1,
          distanceMeters: 0,
          bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
        },
      },
    })).not.toThrow()
  })

  it('rejects an empty independently stored Ground truth trajectory', () => {
    expect(() => validateStaticReport({
      ...validReport,
      groundTruth: { dataset: { points: [] } },
    })).toThrow('缺少有效 Ground truth')
  })
})
