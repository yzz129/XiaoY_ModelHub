import { Readable } from 'node:stream'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const proxyPath = '/__asset_proxy'
const forwardedHeaders = ['accept-ranges', 'cache-control', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']

function isAllowedAssetUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.endsWith('.volces.com') && url.hostname.includes('.tos-')
  } catch {
    return false
  }
}

const assetProxy: Connect.NextHandleFunction = async (request, response, next) => {
  if (!request.url?.startsWith(proxyPath)) return next()
  const requestUrl = new URL(request.url, 'http://localhost')
  const target = requestUrl.searchParams.get('url') ?? ''
  if (!isAllowedAssetUrl(target)) {
    response.statusCode = 400
    response.end('Unsupported asset URL')
    return
  }

  try {
    const headers: Record<string, string> = {}
    if (request.headers.range) headers.Range = request.headers.range
    const upstream = await fetch(target, { headers, redirect: 'follow' })
    response.statusCode = upstream.status
    response.setHeader('Access-Control-Allow-Origin', '*')
    for (const name of forwardedHeaders) {
      const value = upstream.headers.get(name)
      if (value) response.setHeader(name, value)
    }
    if (!upstream.body || request.method === 'HEAD') {
      response.end()
      return
    }
    Readable.fromWeb(upstream.body).pipe(response)
  } catch (error) {
    response.statusCode = 502
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.end(error instanceof Error ? error.message : 'Asset proxy failed')
  }
}

const assetProxyPlugin: Plugin = {
  name: 'volcengine-asset-proxy',
  configureServer(server) { server.middlewares.use(assetProxy) },
  configurePreviewServer(server) { server.middlewares.use(assetProxy) },
}

export default defineConfig({
  plugins: [react(), assetProxyPlugin],
})
