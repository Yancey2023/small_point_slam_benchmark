import { access, readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CreateRunRequest } from '../shared/contracts.js'
import { failedAccuracy, readAccuracy } from './accuracy.js'
import { loadCatalog } from './catalog.js'
import { readPerformance } from './performance.js'
import { discoverResults, publicResults, type DiscoveredResult } from './results.js'
import { RunManager } from './run-manager.js'
import { readGroundTruth, readTrajectory } from './trajectory.js'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function findProjectRoot(): Promise<string> {
  const candidates = [
    process.env.BENCHMARK_ROOT,
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(moduleDirectory, '../..'),
    path.resolve(moduleDirectory, '../../..'),
  ].filter((candidate): candidate is string => Boolean(candidate))
  for (const candidate of candidates) {
    if (
      (await exists(path.join(candidate, 'algorithm'))) &&
      (await exists(path.join(candidate, 'datasets'))) &&
      (await exists(path.join(candidate, 'CMakeLists.txt')))
    ) {
      return path.resolve(candidate)
    }
  }
  throw new Error('无法定位 benchmark 项目根目录，请设置 BENCHMARK_ROOT')
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 1_000_000) throw new Error('请求内容过大')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

function contentType(filePath: string): string {
  const types: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  }
  return types[path.extname(filePath)] ?? 'application/octet-stream'
}

const projectRoot = await findProjectRoot()
const configuredBuild = process.env.BENCHMARK_BUILD_DIR ?? 'build/algorithms'
const buildDirectory = path.isAbsolute(configuredBuild)
  ? configuredBuild
  : path.resolve(projectRoot, configuredBuild)
const staticRoot = path.resolve(projectRoot, 'frontend', 'dist')
const manager = new RunManager(projectRoot)
let storedResults: DiscoveredResult[] = []

async function refreshStoredResults(): Promise<DiscoveredResult[]> {
  const catalog = await loadCatalog(projectRoot, buildDirectory)
  storedResults = await discoverResults(projectRoot, catalog)
  return storedResults
}

async function serveStatic(requestPath: string, response: ServerResponse): Promise<void> {
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '')
  let candidate = path.resolve(staticRoot, relative)
  if (!candidate.startsWith(`${staticRoot}${path.sep}`) && candidate !== staticRoot) {
    sendJson(response, 403, { error: '禁止访问该路径' })
    return
  }
  try {
    if (!(await stat(candidate)).isFile()) throw new Error('not a file')
  } catch {
    candidate = path.join(staticRoot, 'index.html')
  }
  if (!(await exists(candidate))) {
    sendJson(response, 404, { error: '前端尚未构建，请运行 pnpm dev 或 pnpm build:web' })
    return
  }
  response.writeHead(200, { 'Content-Type': contentType(candidate) })
  response.end(await readFile(candidate))
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (request.method === 'GET' && url.pathname === '/api/catalog') {
      const catalog = await loadCatalog(projectRoot, buildDirectory)
      sendJson(response, 200, catalog.response)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/results') {
      sendJson(response, 200, publicResults(await refreshStoredResults()))
      return
    }

    const groundTruthMatch = url.pathname.match(
      /^\/api\/datasets\/([^/]+)\/ground-truth$/,
    )
    if (request.method === 'GET' && groundTruthMatch) {
      const catalog = await loadCatalog(projectRoot, buildDirectory)
      const dataset = catalog.datasets.get(decodeURIComponent(groundTruthMatch[1]!))
      if (!dataset?.hasGroundTruth || !dataset.groundTruthPath) {
        sendJson(response, 404, { error: '该数据集没有可用的 Ground truth' })
        return
      }
      sendJson(response, 200, await readGroundTruth(dataset.groundTruthPath))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/runs') {
      const body = await readJson<CreateRunRequest>(request)
      const catalog = await loadCatalog(projectRoot, buildDirectory)
      sendJson(response, 202, manager.create(body, catalog))
      return
    }

    const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/)
    if (request.method === 'GET' && runMatch) {
      const snapshot = manager.get(runMatch[1]!)
      sendJson(response, snapshot ? 200 : 404, snapshot ?? { error: '任务不存在' })
      return
    }

    const cancelMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/cancel$/)
    if (request.method === 'POST' && cancelMatch) {
      const snapshot = manager.cancel(cancelMatch[1]!)
      sendJson(response, snapshot ? 200 : 404, snapshot ?? { error: '任务不存在' })
      return
    }

    const eventsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/)
    if (request.method === 'GET' && eventsMatch) {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      const unsubscribe = manager.subscribe(eventsMatch[1]!, (snapshot) => {
        response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`)
      })
      if (!unsubscribe) {
        response.end('event: error\ndata: {"error":"任务不存在"}\n\n')
        return
      }
      const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000)
      request.once('close', () => {
        clearInterval(heartbeat)
        unsubscribe()
      })
      return
    }

    const trajectoryMatch = url.pathname.match(
      /^\/api\/runs\/([^/]+)\/jobs\/([^/]+)\/trajectory$/,
    )
    if (request.method === 'GET' && trajectoryMatch) {
      const trajectoryPath = manager.resultPath(trajectoryMatch[1]!, trajectoryMatch[2]!)
      if (!trajectoryPath) {
        sendJson(response, 404, { error: '该任务尚无可用轨迹' })
        return
      }
      sendJson(response, 200, await readTrajectory(trajectoryPath))
      return
    }

    const performanceMatch = url.pathname.match(
      /^\/api\/runs\/([^/]+)\/jobs\/([^/]+)\/performance$/,
    )
    if (request.method === 'GET' && performanceMatch) {
      const outputDirectory = manager.resultDirectory(performanceMatch[1]!, performanceMatch[2]!)
      if (!outputDirectory) {
        sendJson(response, 404, { error: '该任务尚无可用性能结果' })
        return
      }
      sendJson(response, 200, await readPerformance(outputDirectory))
      return
    }

    const storedResultMatch = url.pathname.match(
      /^\/api\/results\/([^/]+)\/(trajectory|performance|accuracy)$/,
    )
    if (request.method === 'GET' && storedResultMatch) {
      let result = storedResults.find((item) => item.id === storedResultMatch[1])
      if (!result) {
        result = (await refreshStoredResults()).find((item) => item.id === storedResultMatch[1])
      }
      if (!result) {
        sendJson(response, 404, { error: '未找到该历史结果' })
        return
      }
      if (storedResultMatch[2] === 'trajectory') {
        if (!result.hasTrajectory) {
          sendJson(response, 404, { error: '该历史结果没有可用轨迹' })
          return
        }
        const trajectory = await readTrajectory(
          path.join(result.absoluteOutputDirectory, 'final_trajectory.csv'),
        )
        if (result.absoluteGroundTruthPath) {
          trajectory.groundTruth = await readGroundTruth(result.absoluteGroundTruthPath)
        }
        sendJson(response, 200, trajectory)
      } else if (storedResultMatch[2] === 'performance') {
        if (!result.hasPerformance) {
          sendJson(response, 404, { error: '该历史结果没有完整性能数据' })
          return
        }
        sendJson(response, 200, await readPerformance(result.absoluteOutputDirectory))
      } else {
        if (!result.hasGroundTruth) {
          sendJson(response, 404, { error: '该数据集没有 ground truth' })
          return
        }
        if (result.status === 'failed') {
          sendJson(response, 200, failedAccuracy(result.failureReason ?? '算法运行失败'))
          return
        }
        sendJson(response, 200, await readAccuracy(
          path.join(result.absoluteOutputDirectory, 'final_trajectory.csv'),
          result.absoluteGroundTruthPath,
          result.groundTruthMaxTimeDifferenceMs,
        ))
      }
      return
    }

    if (url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: '接口不存在' })
      return
    }
    await serveStatic(url.pathname, response)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendJson(response, 400, { error: message })
  }
})

const port = Number(process.env.BENCHMARK_WEB_PORT ?? 4174)
const host = process.env.BENCHMARK_WEB_HOST ?? '127.0.0.1'
server.listen(port, host, () => {
  console.log(`Benchmark API: http://${host}:${port}`)
  console.log(`Project root: ${projectRoot}`)
  console.log(`Preferred build: ${buildDirectory}`)
})
