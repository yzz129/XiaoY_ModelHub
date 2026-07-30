import { resolveProviderCredentials } from './_secure_keys.js'

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function providerRequest(provider, apiKey, accountId) {
  const headers = { Accept: 'application/json' }
  const requireKey = (name) => {
    if (!apiKey) throw new Error(`需要先配置 ${name} API Key 才能同步完整模型目录`)
    headers.Authorization = `Bearer ${apiKey}`
  }
  let target

  switch (provider) {
    case 'openrouter':
      target = 'https://openrouter.ai/api/v1/models?output_modalities=all'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'pollinations':
      target = 'https://gen.pollinations.ai/v1/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'huggingface':
      target = 'https://huggingface.co/api/models?inference_provider=hf-inference&limit=1000&full=true'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'elevenlabs':
      if (!apiKey) throw new Error('需要先配置 ElevenLabs API Key 才能同步完整模型目录')
      target = 'https://api.elevenlabs.io/v1/models'
      headers['xi-api-key'] = apiKey
      break
    case 'openai':
      requireKey('OpenAI')
      target = 'https://api.openai.com/v1/models'
      break
    case 'anthropic':
      if (!apiKey) throw new Error('需要先配置 Anthropic API Key 才能同步完整模型目录')
      target = 'https://api.anthropic.com/v1/models?limit=1000'
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
      break
    case 'mistral':
      requireKey('Mistral')
      target = 'https://api.mistral.ai/v1/models'
      break
    case 'together':
      requireKey('Together AI')
      target = 'https://api.together.xyz/v1/models'
      break
    case 'deepinfra':
      target = 'https://api.deepinfra.com/v1/openai/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'cerebras':
      requireKey('Cerebras')
      target = 'https://api.cerebras.ai/v1/models'
      break
    case 'sambanova':
      requireKey('SambaNova')
      target = 'https://api.sambanova.ai/v1/models'
      break
    case 'nvidia':
      target = 'https://integrate.api.nvidia.com/v1/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'deepseek':
      requireKey('DeepSeek')
      target = 'https://api.deepseek.com/models'
      break
    case 'moonshot':
      requireKey('Moonshot AI')
      target = 'https://api.moonshot.cn/v1/models'
      break
    case 'minimax':
      requireKey('MiniMax')
      target = 'https://api.minimaxi.com/v1/models'
      break
    case 'baidu':
      requireKey('百度千帆')
      target = 'https://qianfan.baidubce.com/v2/models'
      break
    case 'xai':
      requireKey('xAI')
      target = 'https://api.x.ai/v1/models'
      break
    case 'perplexity':
      requireKey('Perplexity')
      target = 'https://api.perplexity.ai/v1/models'
      break
    case 'github':
      target = 'https://models.github.ai/catalog/models'
      headers['X-GitHub-Api-Version'] = '2026-03-10'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'fireworks':
      if (!apiKey || !accountId) throw new Error('需要同时配置 Fireworks API Key 和 Account ID')
      target = `https://api.fireworks.ai/v1/accounts/${encodeURIComponent(accountId)}/models?pageSize=1000`
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'replicate':
      requireKey('Replicate')
      target = 'https://api.replicate.com/v1/models?sort_by=latest_version_created_at&sort_direction=desc'
      break
    case 'gemini':
      if (!apiKey) throw new Error('需要先配置 Google Gemini API Key 才能同步完整模型目录')
      target = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`
      break
    case 'groq':
      requireKey('Groq')
      target = 'https://api.groq.com/openai/v1/models'
      break
    case 'siliconflow':
      requireKey('SiliconFlow')
      target = 'https://api.siliconflow.cn/v1/models'
      break
    case 'cloudflare':
      if (!apiKey || !accountId) throw new Error('需要同时配置 Cloudflare API Token 和 Account ID')
      target = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?per_page=1000`
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'cohere':
      requireKey('Cohere')
      target = 'https://api.cohere.com/v1/models?page_size=1000'
      break
    case 'agnes':
      requireKey('Agnes')
      target = 'https://apihub.agnes-ai.com/v1/models'
      break
    case 'modelscope':
      requireKey('ModelScope')
      target = 'https://api-inference.modelscope.cn/v1/models'
      break
    case 'alibaba':
      requireKey('阿里云百炼')
      target = 'https://dashscope.aliyuncs.com/compatible-mode/v1/models'
      break
    case 'ark':
      requireKey('火山方舟')
      target = 'https://ark.cn-beijing.volces.com/api/v3/models'
      break
    case 'jina':
      requireKey('Jina')
      target = 'https://api.jina.ai/v1/models'
      break
    default:
      throw new Error('当前服务商不支持模型目录同步')
  }

  return { target, headers }
}

async function fetchProviderPayload(provider, target, headers) {
  if (provider === 'replicate') {
    const results = []
    let nextPage = target
    for (let page = 0; page < 12 && nextPage; page += 1) {
      const nextUrl = new URL(nextPage)
      if (nextUrl.protocol !== 'https:' || nextUrl.hostname !== 'api.replicate.com') {
        throw new Error('Replicate 返回了不安全的分页地址')
      }
      const upstream = await fetch(nextUrl, { headers })
      const payload = await upstream.json().catch(() => ({}))
      if (!upstream.ok) {
        const message = payload?.error?.message || payload?.error || payload?.message
        throw new Error(typeof message === 'string' ? message : `服务商目录请求失败（${upstream.status}）`)
      }
      results.push(...rowsFromModelPayload(payload))
      const root = objectValue(payload)
      nextPage = typeof root?.next === 'string' && root.next ? root.next : undefined
    }
    return { results }
  }

  const upstream = await fetch(target, { headers })
  const payload = await upstream.json().catch(() => ({}))
  if (!upstream.ok) {
    const message = payload?.error?.message || payload?.error || payload?.message
    throw new Error(typeof message === 'string' ? message : `服务商目录请求失败（${upstream.status}）`)
  }
  return payload
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function stringValue(record, ...keys) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function rowsFromModelPayload(payload) {
  if (Array.isArray(payload)) return payload.filter((item) => objectValue(item))
  const root = objectValue(payload)
  if (!root) return []
  for (const key of ['data', 'models', 'result', 'results', 'items', 'llms']) {
    const value = root[key]
    if (Array.isArray(value)) return value.filter((item) => objectValue(item))
  }
  return []
}

function inferModelCategory(record, apiModel) {
  const architecture = objectValue(record.architecture)
  const outputModalities = [
    ...stringArray(record.output_modalities),
    ...stringArray(record.supported_output_modalities),
    ...stringArray(architecture?.output_modalities),
  ].map((value) => value.toLowerCase())

  if (outputModalities.includes('embeddings') || outputModalities.includes('embedding')) return 'embedding'
  if (outputModalities.includes('video')) return 'video'
  if (outputModalities.includes('image')) return 'image'
  if (outputModalities.includes('audio')) return 'audio'

  const descriptor = [
    apiModel,
    stringValue(record, 'type', 'sub_type', 'task', 'pipeline_tag', 'category', 'model_type'),
    stringValue(record, 'name', 'displayName', 'display_name', 'description', 'summary'),
    ...stringArray(record.endpoints),
  ].join(' ').toLowerCase()

  if (/rerank|re-rank/.test(descriptor)) return 'reranker'
  if (/embedding|feature-extraction|sentence-similarity/.test(descriptor)) return 'embedding'
  if (/text-to-video|image-to-video|video-generation|\bvideo\b/.test(descriptor)) return 'video'
  if (/text-to-image|image-to-image|image-generation|stable-diffusion|flux|seedream/.test(descriptor)) return 'image'
  if (/text-to-speech|speech-to-text|transcription|\btts\b|\basr\b|whisper|\baudio\b|music/.test(descriptor)) return 'audio'
  if (/text-to-3d|image-to-3d|\b3d\b/.test(descriptor)) return '3d'
  return 'chat'
}

function inferModelPricing(provider, record, apiModel) {
  if (apiModel.endsWith(':free') || /(?:^|[-_/])free(?:$|[-_/])/.test(apiModel.toLowerCase())) return 'free'
  const pricing = objectValue(record.pricing)
  if (pricing) {
    const numericPrices = Object.values(pricing)
      .flatMap((value) => typeof value === 'number' || typeof value === 'string' ? [Number(value)] : [])
      .filter(Number.isFinite)
    if (numericPrices.length && numericPrices.every((value) => value === 0)) return 'free'
  }
  if (record.paid_only === false || record.is_free === true) return 'free'
  if (record.paid_only === true) return 'paid'
  return provider === 'agnes' ? 'free' : 'variable'
}

function normalizeProviderModels(provider, payload) {
  const unique = new Map()
  for (const record of rowsFromModelPayload(payload)) {
    const apiModel = stringValue(record, 'baseModelId', 'model_id', 'id', 'name', 'llm')
      .replace(/^models\//, '')
    if (!apiModel || apiModel.length > 240) continue
    const rawName = stringValue(record, 'displayName', 'display_name', 'name', 'model_name', 'model_id', 'id', 'llm')
    unique.set(apiModel, {
      apiModel,
      name: (rawName.replace(/^models\//, '') || apiModel).slice(0, 160),
      description: stringValue(record, 'description', 'summary').slice(0, 500)
        || '由服务商官方模型目录动态同步',
      category: inferModelCategory(record, apiModel),
      pricing: inferModelPricing(provider, record, apiModel),
    })
  }
  return [...unique.values()]
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json()
    const provider = typeof body.provider === 'string' ? body.provider : ''
    const credentials = await resolveProviderCredentials(env, request, provider)
    const apiKey = credentials.apiKey
    const accountId = credentials.accountId
    const { target, headers } = providerRequest(provider, apiKey, accountId)
    const payload = await fetchProviderPayload(provider, target, headers)

    return json({
      provider,
      models: normalizeProviderModels(provider, payload),
      syncedAt: Date.now(),
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '同步服务商模型目录失败' }, 502)
  }
}
