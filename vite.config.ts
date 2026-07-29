import { request as httpsRequest } from 'node:https'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const proxyPath = '/__asset_proxy'
const savePath = '/__save_generated_asset'
const outputPath = '/__generated_output/'
const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const outputRoot = resolve(projectRoot, 'output')
const forwardedHeaders = ['accept-ranges', 'cache-control', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']
const outputFolders = { image: 'images', video: 'videos', '3d': 'models' } as const
const fallbackExtensions = { image: '.png', video: '.mp4', '3d': '.glb' } as const
const contentTypeExtensions: Record<string, string> = {
  'image/avif': '.avif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'model/gltf-binary': '.glb',
  'model/gltf+json': '.gltf',
}
const extensionContentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
}

function isAllowedAssetUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.endsWith('.volces.com') && url.hostname.includes('.tos-')
  } catch {
    return false
  }
}

function safeAssetId(value: unknown) {
  const normalized = typeof value === 'string' ? value.replace(/[^a-zA-Z0-9_-]/g, '') : ''
  return normalized.slice(0, 80) || crypto.randomUUID()
}

function timestampLabel(value: unknown) {
  const date = new Date(typeof value === 'number' && Number.isFinite(value) ? value : Date.now())
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:T]/g, '-')
}

function chooseExtension(kind: keyof typeof outputFolders, contentType: string, sourceUrl: string) {
  const normalizedContentType = contentType.split(';', 1)[0].trim().toLowerCase()
  const fromContentType = contentTypeExtensions[normalizedContentType]
  if (fromContentType) return fromContentType
  try {
    const fromUrl = extname(new URL(sourceUrl).pathname).toLowerCase()
    if (extensionContentTypes[fromUrl]) return fromUrl
  } catch { /* A data URL does not have a pathname. */ }
  return fallbackExtensions[kind]
}

async function readRequestJson(request: Parameters<Connect.NextHandleFunction>[0]) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 100 * 1024 * 1024) throw new Error('Save request is larger than 100 MB')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

async function downloadAsset(sourceUrl: string, target: string) {
  const temporary = `${target}.${crypto.randomUUID()}.part`
  try {
    if (sourceUrl.startsWith('data:')) {
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(sourceUrl)
      if (!match) throw new Error('Unsupported data URL')
      const data = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]))
      await writeFile(temporary, data)
      await copyFile(temporary, target)
      return match[1] ?? 'application/octet-stream'
    }
    if (!isAllowedAssetUrl(sourceUrl)) throw new Error('Unsupported asset URL')
    const upstream = await fetch(sourceUrl)
    if (!upstream.ok || !upstream.body) throw new Error(`Asset download failed (${upstream.status})`)
    if (!isAllowedAssetUrl(upstream.url)) throw new Error('Asset download redirected to an unsupported URL')
    await pipeline(upstream.body, createWriteStream(temporary))
    await copyFile(temporary, target)
    return upstream.headers.get('content-type') ?? 'application/octet-stream'
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

const saveGeneratedAsset: Connect.NextHandleFunction = async (request, response, next) => {
  if (!request.url?.startsWith(savePath)) return next()
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('Allow', 'POST')
    response.end('Method not allowed')
    return
  }
  try {
    const body = await readRequestJson(request)
    const kind = body.kind
    const sourceUrl = typeof body.url === 'string' ? body.url : ''
    if (kind !== 'image' && kind !== 'video' && kind !== '3d') throw new Error('Unsupported asset kind')
    if (!sourceUrl) throw new Error('Missing asset URL')

    const folder = join(outputRoot, outputFolders[kind])
    await mkdir(folder, { recursive: true })
    const id = safeAssetId(body.id)
    const baseName = `${timestampLabel(body.createdAt)}_${id}`
    const provisional = join(folder, `${baseName}${fallbackExtensions[kind]}`)
    const contentType = await downloadAsset(sourceUrl, provisional)
    const extension = chooseExtension(kind, contentType, sourceUrl)
    const target = extension === fallbackExtensions[kind] ? provisional : join(folder, `${baseName}${extension}`)
    if (target !== provisional) {
      await copyFile(provisional, target)
      await unlink(provisional)
    }

    const relativePath = relative(projectRoot, target).split(sep).join('/')
    const publicUrl = `${outputPath}${relative(outputRoot, target).split(sep).map(encodeURIComponent).join('/')}`
    response.statusCode = 201
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify({ url: publicUrl, path: relativePath }))
  } catch (error) {
    response.statusCode = 500
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to save generated asset' }))
  }
}

const serveGeneratedAsset: Connect.NextHandleFunction = async (request, response, next) => {
  if (!request.url?.startsWith(outputPath)) return next()
  try {
    const requestUrl = new URL(request.url, 'http://localhost')
    const requestedPath = decodeURIComponent(requestUrl.pathname.slice(outputPath.length))
    const target = resolve(outputRoot, requestedPath)
    if (target !== outputRoot && !target.startsWith(`${outputRoot}${sep}`)) {
      response.statusCode = 403
      response.end('Forbidden')
      return
    }
    const file = await stat(target)
    if (!file.isFile()) throw new Error('Not a file')
    const contentType = extensionContentTypes[extname(target).toLowerCase()] ?? 'application/octet-stream'
    const range = request.headers.range
    let start = 0
    let end = file.size - 1
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match) {
        response.statusCode = 416
        response.setHeader('Content-Range', `bytes */${file.size}`)
        response.end()
        return
      }
      start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2] || 0))
      end = match[2] ? Number(match[2]) : file.size - 1
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= file.size) {
        response.statusCode = 416
        response.setHeader('Content-Range', `bytes */${file.size}`)
        response.end()
        return
      }
      end = Math.min(end, file.size - 1)
      response.statusCode = 206
      response.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`)
    } else {
      response.statusCode = 200
    }
    response.setHeader('Accept-Ranges', 'bytes')
    response.setHeader('Cache-Control', 'no-cache')
    response.setHeader('Content-Type', contentType)
    response.setHeader('Content-Length', String(end - start + 1))
    response.setHeader('Content-Disposition', `inline; filename="${basename(target).replace(/"/g, '')}"`)
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(target, { start, end }).pipe(response)
  } catch {
    response.statusCode = 404
    response.end('Generated asset not found')
  }
}

const assetProxy: Connect.NextHandleFunction = (request, response, next) => {
  if (!request.url?.startsWith(proxyPath)) return next()
  const requestUrl = new URL(request.url, 'http://localhost')
  const target = requestUrl.searchParams.get('url') ?? ''
  if (!isAllowedAssetUrl(target)) {
    response.statusCode = 400
    response.end('Unsupported asset URL')
    return
  }

  try {
    const targetUrl = new URL(target)
    const headers: Record<string, string> = { Host: targetUrl.host }
    if (request.headers.range) headers.Range = request.headers.range
    const upstreamRequest = httpsRequest({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || 443,
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers,
    }, (upstream) => {
      response.statusCode = upstream.statusCode ?? 502
      response.setHeader('Access-Control-Allow-Origin', '*')
      for (const name of forwardedHeaders) {
        const value = upstream.headers[name]
        if (value) response.setHeader(name, value)
      }
      if (request.method === 'HEAD') {
        upstream.resume()
        response.end()
        return
      }
      upstream.pipe(response)
    })
    upstreamRequest.on('error', (error) => {
      if (response.headersSent) {
        response.destroy(error)
        return
      }
      response.statusCode = 502
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.end(error.message)
    })
    request.on('aborted', () => upstreamRequest.destroy())
    upstreamRequest.end()
  } catch (error) {
    response.statusCode = 502
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.end(error instanceof Error ? error.message : 'Asset proxy failed')
  }
}

const assetProxyPlugin: Plugin = {
  name: 'volcengine-asset-proxy',
  configureServer(server) {
    server.middlewares.use(saveGeneratedAsset)
    server.middlewares.use(serveGeneratedAsset)
    server.middlewares.use(assetProxy)
  },
  configurePreviewServer(server) {
    server.middlewares.use(saveGeneratedAsset)
    server.middlewares.use(serveGeneratedAsset)
    server.middlewares.use(assetProxy)
  },
}

export default defineConfig({
  plugins: [react(), assetProxyPlugin],
})
