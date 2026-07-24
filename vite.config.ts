import { request as httpsRequest } from 'node:https'
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
  configureServer(server) { server.middlewares.use(assetProxy) },
  configurePreviewServer(server) { server.middlewares.use(assetProxy) },
}

export default defineConfig({
  plugins: [react(), assetProxyPlugin],
})
