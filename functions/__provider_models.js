import { resolveProviderCredentials } from './_secure_keys.js'

const publicCatalogUrl = 'https://models.dev/api.json'
const publicCatalogProviderIds = {
  alibaba: 'alibaba-cn',
  cloudflare: 'cloudflare-workers-ai',
  cohere: 'cohere',
  gemini: 'google',
  groq: 'groq',
  minimax: 'minimax-cn',
  scaleway: 'scaleway',
  siliconflow: 'siliconflow-cn',
  stepfun: 'stepfun',
  zhipu: 'zhipuai',
}
const retiredModelsByProvider = {
  alibaba: new Set(['deepseek-r1-distill-llama-8b']),
  cerebras: new Set(['llama3.1-8b', 'qwen-3-235b-a22b-instruct-2507']),
  zhipu: new Set(['glm-4.5-flash']),
}
let publicCatalogCache
let publicCatalogCachedAt = 0

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
      if (!apiKey) {
        target = publicCatalogUrl
        break
      }
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
      if (!apiKey) {
        target = publicCatalogUrl
        break
      }
      target = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`
      break
    case 'groq':
      if (!apiKey) {
        target = publicCatalogUrl
        break
      }
      requireKey('Groq')
      target = 'https://api.groq.com/openai/v1/models'
      break
    case 'siliconflow':
      if (!apiKey) {
        target = publicCatalogUrl
        break
      }
      requireKey('SiliconFlow')
      target = 'https://api.siliconflow.cn/v1/models'
      break
    case 'cloudflare':
      if (!apiKey || !accountId) {
        target = publicCatalogUrl
        break
      }
      target = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?per_page=1000`
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'cohere':
      if (!apiKey) {
        target = publicCatalogUrl
        break
      }
      requireKey('Cohere')
      target = 'https://api.cohere.com/v1/models?page_size=1000'
      break
    case 'agnes':
      requireKey('Agnes')
      target = 'https://apihub.agnes-ai.com/v1/models'
      break
    case 'modelscope':
      target = 'https://api-inference.modelscope.cn/v1/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'alibaba':
      if (!apiKey) {
        target = publicCatalogUrl
        break
      }
      requireKey('阿里云百炼')
      target = 'https://dashscope.aliyuncs.com/compatible-mode/v1/models'
      break
    case 'ark':
      requireKey('火山方舟')
      target = 'https://ark.cn-beijing.volces.com/api/v3/models'
      break
    case 'jina':
      target = 'https://api.jina.ai/v1/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'zhipu':
      if (!apiKey) {
        target = publicCatalogUrl
        break
      }
      requireKey('智谱 BigModel')
      target = 'https://open.bigmodel.cn/api/paas/v4/models'
      break
    case 'stepfun':
      if (!apiKey) {
        target = publicCatalogUrl
        break
      }
      requireKey('阶跃星辰 StepFun')
      target = 'https://api.stepfun.com/v1/models'
      break
    case 'scaleway':
      if (!apiKey) {
        target = publicCatalogUrl
        break
      }
      requireKey('Scaleway')
      target = 'https://api.scaleway.ai/v1/models'
      break
    case 'hyperbolic':
      requireKey('Hyperbolic')
      target = 'https://api.hyperbolic.xyz/v1/models'
      break
    case 'novita':
      target = 'https://api.novita.ai/openai/v1/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'aimlapi':
      target = 'https://api.aimlapi.com/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    default:
      throw new Error('当前服务商不支持模型目录同步')
  }

  return { target, headers }
}

async function fetchPublicCatalog() {
  if (publicCatalogCache && Date.now() - publicCatalogCachedAt < 30 * 60 * 1000) {
    return publicCatalogCache
  }
  const upstream = await fetch(publicCatalogUrl, {
    headers: { Accept: 'application/json' },
    cf: { cacheEverything: true, cacheTtl: 1800 },
  })
  const payload = await upstream.json().catch(() => ({}))
  if (!upstream.ok) throw new Error(`公共模型目录请求失败（${upstream.status}）`)
  publicCatalogCache = payload
  publicCatalogCachedAt = Date.now()
  return payload
}

function publicCatalogRows(provider, payload) {
  const sourceId = publicCatalogProviderIds[provider]
  const source = objectValue(objectValue(payload)?.[sourceId])
  const models = objectValue(source?.models)
  if (!models) return []

  return Object.entries(models).flatMap(([fallbackId, value]) => {
    const model = objectValue(value)
    if (!model || model.status === 'deprecated') return []
    const apiModel = stringValue(model, 'id') || fallbackId
    if (retiredModelsByProvider[provider]?.has(apiModel)) return []
    const modalities = objectValue(model.modalities)
    const outputs = stringArray(modalities?.output).map((item) => item.toLowerCase())
    const descriptor = `${apiModel} ${stringValue(model, 'name', 'family')}`.toLowerCase()
    const task = outputs.includes('video')
      ? 'text-to-video'
      : outputs.includes('image')
        ? 'text-to-image'
        : outputs.includes('audio')
          ? 'text-to-speech'
          : /rerank/.test(descriptor)
            ? 'reranker'
            : /embed/.test(descriptor)
              ? 'embedding'
              : 'chat'
    return [{
      ...model,
      id: apiModel,
      name: stringValue(model, 'name') || apiModel,
      task,
      pricing: objectValue(model.cost),
    }]
  })
}

function nextProviderPage(provider, currentUrl, payload) {
  const root = objectValue(payload)
  if (!root) return undefined
  const nextUrl = new URL(currentUrl)

  if (provider === 'gemini') {
    const token = stringValue(root, 'nextPageToken')
    if (!token) return undefined
    nextUrl.searchParams.set('pageToken', token)
    return nextUrl.toString()
  }

  if (provider === 'cohere') {
    const token = stringValue(root, 'next_page_token', 'nextPageToken')
    if (!token) return undefined
    nextUrl.searchParams.set('page_token', token)
    return nextUrl.toString()
  }

  if (provider === 'cloudflare') {
    const resultInfo = objectValue(root.result_info)
    const currentPage = Number(resultInfo?.page)
    const totalPages = Number(resultInfo?.total_pages)
    if (!Number.isFinite(currentPage) || !Number.isFinite(totalPages) || currentPage >= totalPages) return undefined
    nextUrl.searchParams.set('page', String(currentPage + 1))
    return nextUrl.toString()
  }

  return undefined
}

async function fetchProviderPayload(provider, target, headers) {
  if (target === publicCatalogUrl) {
    return { results: publicCatalogRows(provider, await fetchPublicCatalog()) }
  }

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

  if (provider === 'huggingface') {
    const results = []
    let nextPage = target
    for (let page = 0; page < 30 && nextPage; page += 1) {
      const nextUrl = new URL(nextPage)
      if (nextUrl.protocol !== 'https:' || nextUrl.hostname !== 'huggingface.co') {
        throw new Error('Hugging Face 返回了不安全的分页地址')
      }
      const upstream = await fetch(nextUrl, { headers })
      const payload = await upstream.json().catch(() => ({}))
      if (!upstream.ok) {
        const message = payload?.error?.message || payload?.error || payload?.message
        throw new Error(typeof message === 'string' ? message : `服务商目录请求失败（${upstream.status}）`)
      }
      results.push(...rowsFromModelPayload(payload))
      const link = upstream.headers.get('Link') || ''
      nextPage = link.match(/<([^>]+)>;\s*rel="next"/)?.[1]
    }
    return { results }
  }

  if (provider === 'gemini' || provider === 'cohere' || provider === 'cloudflare') {
    const results = []
    let nextPage = target
    for (let page = 0; page < 30 && nextPage; page += 1) {
      const upstream = await fetch(nextPage, { headers })
      const payload = await upstream.json().catch(() => ({}))
      if (!upstream.ok) {
        const message = payload?.error?.message || payload?.error || payload?.message
        throw new Error(typeof message === 'string' ? message : `服务商目录请求失败（${upstream.status}）`)
      }
      results.push(...rowsFromModelPayload(payload))
      nextPage = nextProviderPage(provider, nextPage, payload)
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
  if (outputModalities.includes('rerank') || outputModalities.includes('reranker')) return 'reranker'
  if (outputModalities.includes('video')) return 'video'
  if (outputModalities.includes('image')) return 'image'
  if (outputModalities.some((value) => ['audio', 'speech', 'tts'].includes(value))) return 'audio'

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

const cloudflarePaidOnlyModels = new Set([
  '@cf/moonshotai/kimi-k2.6',
  '@cf/moonshotai/kimi-k2.7-code',
  '@cf/zai-org/glm-5.2',
  '@cf/deepseek-ai/deepseek-v4-flash-0731',
  '@cf/deepseek-ai/deepseek-v4-pro-0813',
])

const geminiFreeTierModels = new Set([
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-live-translate-preview',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-live-preview',
  'gemini-3.1-flash-tts-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash-lite-preview-09-2025',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-flash-preview-tts',
  'gemini-embedding-2',
  'gemini-embedding-001',
  'gemini-robotics-er-2-preview',
  'gemini-robotics-er-2-streaming-preview',
  'gemini-robotics-er-1.6-preview',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
])

const groqFreePlanModels = new Set([
  'whisper-large-v3',
  'whisper-large-v3-turbo',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'allam-2-7b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-safeguard-20b',
  'qwen/qwen3.6-27b',
  'meta-llama/llama-prompt-guard-2-86m',
  'meta-llama/llama-prompt-guard-2-22m',
  'groq/compound-mini',
  'groq/compound',
  'canopylabs/orpheus-arabic-saudi',
  'canopylabs/orpheus-v1-english',
])

const cerebrasFreePlanModels = new Set(['gpt-oss-120b', 'zai-glm-4.7'])
const sambanovaFreePlanModels = new Set([
  'DeepSeek-V3.1',
  'Meta-Llama-3.3-70B-Instruct',
  'gpt-oss-120b',
  'Llama-4-Maverick-17B-128E-Instruct',
  'DeepSeek-V3.2',
])

const baiduFreeQuotaModels = new Set([
  'ernie-4.5-turbo-128k',
  'ernie-4.5-turbo-32k',
  'ernie-4.5-turbo-vl',
  'ernie-x1-turbo-32k',
  'deepseek-r1',
  'deepseek-r1-250528',
  'deepseek-v3-250324',
  'deepseek-v3.1-250821',
  'deepseek-v3.1-think-250821',
  'kimi-k2-instruct',
  'qwen3-235b-a22b-instruct-2507',
  'qwen3-30b-a3b-instruct-2507',
  'qwen3-coder-30b-a3b-instruct',
  'qwen3-coder-480b-a35b-instruct',
  'bge-large-en',
  'bge-large-zh',
  'qianfan-sug-8k',
])

const alibabaFreeQuotaModels = new Set([
  'deepseek-r1-distill-qwen-32b',
  'qwen3-vl-plus',
  'qwen3-coder-30b-a3b-instruct',
  'qwen3.7-max',
  'deepseek-r1',
  'deepseek-v3-1',
  'qwen-turbo',
  'qwen-omni-turbo',
  'qwen-vl-max',
  'qwen3-32b',
  'deepseek-v3-2-exp',
  'deepseek-v4-flash',
  'qwen3-vl-30b-a3b',
  'qwen-math-plus',
  'qwen3-235b-a22b',
  'qwen-max',
  'qwen3.5-397b-a17b',
  'qwen3.5-flash',
  'qwen-plus',
  'deepseek-v4-pro',
  'deepseek-v3',
  'qwen3.5-plus',
  'deepseek-r1-0528',
  'qwen3-coder-flash',
  'glm-5',
  'qwen3.6-max-preview',
  'qwen3.8-max',
  'qwen3.7-plus',
  'qwen3.7-flash',
  'qwen3-vl-235b-a22b',
  'qwen-vl-ocr',
  'qwen3-14b',
  'qwen-mt-turbo',
  'qwen3-next-80b-a3b-thinking',
  'qwen3-coder-480b-a35b-instruct',
  'qwen3-omni-flash',
  'kimi-k2.5',
  'qwen-flash',
  'moonshot-kimi-k2-instruct',
  'qwen3-8b',
  'qwen3-max',
  'glm-5.2',
  'deepseek-r1-distill-llama-70b',
  'deepseek-r1-distill-qwen-7b',
  'qwen2-5-omni-7b',
  'qvq-max',
  'qwen3-next-80b-a3b-instruct',
  'qwen-long',
  'qwen3-omni-flash-realtime',
  'qwen3.6-plus',
  'qwen-mt-plus',
  'qwq-plus',
  'glm-5.1',
  'minimax-m2.5',
  'deepseek-r1-distill-qwen-14b',
  'qwen-omni-turbo-realtime',
  'qwen3-asr-flash',
  'qwen-vl-plus',
  'kimi-k2-thinking',
  'qwen3.6-flash',
  'kimi-k2.6',
  'qwen3-coder-plus',
  'qwen-image-3.0-pro',
  'wan2.7-image-pro',
  'wan2.6-image',
  'wan2.6-i2v',
  'wan2.6-t2v',
  'happyhorse-1.1-t2v',
  'qwen-audio-3.0-tts-plus',
  'qwen-audio-3.0-realtime-plus',
  'fun-asr',
  'fun-asr-realtime',
  'text-embedding-v4',
  'text-embedding-v3',
  'qwen2.5-vl-embedding',
  'tongyi-embedding-vision-plus',
  'gte-rerank-v2',
])

function isArkFreeQuotaModel(apiModel) {
  return /^(?:doubao-seed-2-1-(?:pro|turbo)|doubao-seed-evolving|doubao-seed-character|doubao-seedance-(?:1-5-pro|1-0-pro)|doubao-seedream-(?:5-0-lite|4-5|4-0)|doubao-embedding-vision)(?:$|-)/i.test(apiModel)
}

function outputModalities(record) {
  const architecture = objectValue(record.architecture)
  return [
    ...stringArray(record.output_modalities),
    ...stringArray(record.supported_output_modalities),
    ...stringArray(architecture?.output_modalities),
  ].map((value) => value.toLowerCase())
}

function hasRichMediaOutput(record) {
  return outputModalities(record).some((value) => ['video', 'image', 'audio', 'speech', 'tts'].includes(value))
}

export function inferModelPricing(provider, record, apiModel) {
  if (record.paid_only === true) return 'paid'
  if (apiModel.endsWith(':free') || /(?:^|[-_/])free(?:$|[-_/])/.test(apiModel.toLowerCase())) return 'free'
  if (record.is_free === true) return 'free'

  if (provider === 'cloudflare') {
    return cloudflarePaidOnlyModels.has(apiModel) ? 'paid' : 'daily-refresh'
  }
  if (provider === 'gemini') {
    return geminiFreeTierModels.has(apiModel) ? 'daily-refresh' : 'paid'
  }
  if (provider === 'groq') {
    return groqFreePlanModels.has(apiModel) ? 'daily-refresh' : 'paid'
  }
  if (provider === 'modelscope') return 'daily-refresh'
  if (provider === 'cerebras') {
    return cerebrasFreePlanModels.has(apiModel) ? 'daily-refresh' : 'paid'
  }
  if (provider === 'sambanova') {
    return sambanovaFreePlanModels.has(apiModel) ? 'daily-refresh' : 'paid'
  }
  if (provider === 'cohere') {
    return /(?:^|\/)north-mini-code(?:-1-0)?$/i.test(apiModel) ? 'free' : 'free-quota'
  }
  if (provider === 'elevenlabs') {
    const freeUserLimit = Number(record.max_characters_request_free_user)
    return Number.isFinite(freeUserLimit) && freeUserLimit > 0 ? 'free-quota' : 'paid'
  }
  if (provider === 'baidu') {
    return baiduFreeQuotaModels.has(apiModel.toLowerCase()) ? 'free-quota' : 'paid'
  }
  if (provider === 'alibaba') {
    const normalizedId = apiModel.toLowerCase()
    if (normalizedId === 'deepseek-r1-distill-qwen-1-5b') return 'free'
    return alibabaFreeQuotaModels.has(normalizedId) ? 'free-quota' : 'paid'
  }
  if (provider === 'ark') return isArkFreeQuotaModel(apiModel) ? 'free-quota' : 'paid'
  if (provider === 'zhipu') {
    return new Set(['glm-4.7-flash', 'glm-4.6v-flash', 'glm-4v-flash', 'bge-reranker-large'])
      .has(apiModel.toLowerCase()) ? 'free' : 'paid'
  }
  if (provider === 'stepfun') {
    return new Set(['step-gui', 'step-2x-large', 'step-1x-edit'])
      .has(apiModel.toLowerCase()) ? 'free' : 'paid'
  }
  if (['scaleway', 'hyperbolic', 'novita', 'aimlapi'].includes(provider)) return 'free-quota'
  if (provider === 'minimax') return 'free-quota'
  if (provider === 'pollinations') return 'free-quota'
  if (['huggingface', 'jina', 'nvidia', 'mistral', 'fireworks'].includes(provider)) return 'free-quota'

  const pricing = objectValue(record.pricing)
  let numericPrices = []
  if (pricing) {
    numericPrices = Object.values(pricing)
      .flatMap((value) => typeof value === 'number' || typeof value === 'string' ? [Number(value)] : [])
      .filter(Number.isFinite)
    if (numericPrices.length > 0 && numericPrices.every((value) => value === 0)) {
      // OpenRouter exposes token prices separately from image/audio/video generation
      // prices. A zero token price is only sufficient evidence for non-rich-media models.
      if (provider === 'openrouter' && hasRichMediaOutput(record)) return 'variable'
      return 'free'
    }
  }
  if (record.free_tier === true || record.has_free_tier === true) return 'free-quota'
  if (numericPrices.some((value) => value > 0)) return 'paid'
  if (provider === 'deepinfra') return 'paid'
  return provider === 'agnes' ? 'free' : 'variable'
}

const chineseDescriptionByCategory = {
  chat: '对话、文本生成与知识问答',
  image: '图片生成、图像编辑与视觉创作',
  video: '文生视频、图生视频与动态画面创作',
  audio: '语音识别、语音合成与音频处理',
  embedding: '文本向量化与语义检索',
  reranker: '搜索结果重排与相关性优化',
  '3d': '三维内容生成与空间资产创作',
}

function chineseModelDescription(record, category) {
  const rawDescription = stringValue(record, 'description', 'summary')
  if (/[\u3400-\u9fff]/.test(rawDescription)) return rawDescription.slice(0, 500)

  const source = rawDescription.toLowerCase()
  const features = []
  const addFeature = (pattern, label) => {
    if (pattern.test(source) && !features.includes(label)) features.push(label)
  }
  addFeature(/reasoning|chain.of.thought|problem.solving/, '复杂推理')
  addFeature(/code|coding|programming|software/, '编程与代码任务')
  addFeature(/multimodal|vision.language|image understanding/, '多模态理解')
  addFeature(/long.context|context window|document/, '长上下文与文档处理')
  addFeature(/agent|tool.call|function.call/, '工具调用与智能体工作流')
  addFeature(/reference.image|image.guided|first.frame|last.frame/, '参考图与关键帧控制')
  addFeature(/video edit|video extension|extend video/, '视频编辑与续写')
  addFeature(/text.to.speech|speech synthesis|\btts\b/, '文字转语音')
  addFeature(/speech.to.text|transcri|\basr\b/, '语音转文字')
  addFeature(/multilingual|multiple languages/, '多语言任务')

  const base = chineseDescriptionByCategory[category] || chineseDescriptionByCategory.chat
  return `主要用于${base}${features.length ? `，支持${features.slice(0, 3).join('、')}` : ''}。`
}

export function normalizeProviderModels(provider, payload) {
  const unique = new Map()
  for (const record of rowsFromModelPayload(payload)) {
    const apiModel = stringValue(record, 'baseModelId', 'model_id', 'id', 'name', 'llm')
      .replace(/^models\//, '')
    if (!apiModel || apiModel.length > 240) continue
    if (retiredModelsByProvider[provider]?.has(apiModel)) continue
    const rawName = stringValue(record, 'displayName', 'display_name', 'name', 'model_name', 'model_id', 'id', 'llm')
    unique.set(apiModel, {
      apiModel,
      name: (rawName.replace(/^models\//, '') || apiModel).slice(0, 160),
      description: chineseModelDescription(record, inferModelCategory(record, apiModel)),
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
