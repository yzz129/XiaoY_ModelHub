import { resolveProviderCredentials } from './_secure_keys.js'

const chatProviderEndpoints = {
  agnes: 'https://apihub.agnes-ai.com/v1/chat/completions',
  alibaba: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  ark: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  baidu: 'https://qianfan.baidubce.com/v2/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  cohere: 'https://api.cohere.com/compatibility/v1/chat/completions',
  deepinfra: 'https://api.deepinfra.com/v1/openai/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  fireworks: 'https://api.fireworks.ai/inference/v1/chat/completions',
  github: 'https://models.github.ai/inference/chat/completions',
  minimax: 'https://api.minimaxi.com/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  modelscope: 'https://api-inference.modelscope.cn/v1/chat/completions',
  moonshot: 'https://api.moonshot.cn/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  perplexity: 'https://api.perplexity.ai/chat/completions',
  pollinations: 'https://gen.pollinations.ai/v1/chat/completions',
  sambanova: 'https://api.sambanova.ai/v1/chat/completions',
  siliconflow: 'https://api.siliconflow.cn/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
}

const allowedSpeechVoices = new Set(['JBFqnCBsd6RMkjVDRZzb', '21m00Tcm4TlvDq8ikWAM', 'pNInz6obpgDQGcFmaJgB'])
const pollinationsSpeechVoices = {
  JBFqnCBsd6RMkjVDRZzb: 'george',
  '21m00Tcm4TlvDq8ikWAM': 'rachel',
  pNInz6obpgDQGcFmaJgB: 'adam',
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function upstreamError(payload, status) {
  const error = payload && typeof payload === 'object' ? payload.error : undefined
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
  if (payload && typeof payload === 'object' && typeof payload.message === 'string') return payload.message
  return `服务商请求失败（${status}）`
}

function responseTextContent(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.flatMap((item) => {
      if (typeof item === 'string') return [item]
      return item && typeof item.text === 'string' ? [item.text] : []
    }).join('\n')
  }
  return ''
}

function decodeBase64(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function encodeBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function sanitizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return []
  return rawMessages.slice(-20).flatMap((message) => {
    if (!message || typeof message !== 'object') return []
    const role = message.role === 'user' || message.role === 'assistant' ? message.role : undefined
    const rawContent = message.content
    const content = typeof rawContent === 'string'
      ? rawContent.slice(0, 32_000)
      : Array.isArray(rawContent)
        ? rawContent.slice(0, 6).flatMap((item) => {
            if (!item || typeof item !== 'object') return []
            if (item.type === 'text' && typeof item.text === 'string') return [{ type: 'text', text: item.text.slice(0, 32_000) }]
            if (item.type === 'image_url' && typeof item.image_url?.url === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/.test(item.image_url.url)) {
              return [{ type: 'image_url', image_url: { url: item.image_url.url.slice(0, 8_000_000) } }]
            }
            return []
          })
        : ''
    return role && content ? [{ role, content }] : []
  })
}

async function handleChat(body, provider, apiKey, model) {
  const endpoint = chatProviderEndpoints[provider]
  if (!endpoint) throw new Error('该语言模型服务商尚未接入')
  const messages = sanitizeMessages(body.messages)
  if (!messages.length) throw new Error('请输入对话内容')
  const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0, 2_000) : ''
  const temperature = typeof body.temperature === 'number' && Number.isFinite(body.temperature)
    ? Math.max(0, Math.min(1.5, body.temperature))
    : 0.7
  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://xiaoymodelhub.yzzwnw.asia', 'X-Title': 'XiaoY_ModelHub' } : {}),
      ...(provider === 'github' ? { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), ...messages],
      temperature,
      stream: false,
    }),
  })
  const result = await upstream.json().catch(() => ({}))
  if (!upstream.ok) throw new Error(upstreamError(result, upstream.status))
  const content = responseTextContent(result)
  if (!content) throw new Error('模型未返回文本内容')
  return json({ content })
}

async function handleTts(body, provider, apiKey, model) {
  if (provider !== 'elevenlabs' && provider !== 'pollinations') throw new Error('该文字转语音服务商尚未接入')
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 5_000) : ''
  const voiceId = typeof body.voiceId === 'string' && (allowedSpeechVoices.has(body.voiceId) || (provider === 'elevenlabs' && /^[a-zA-Z0-9_-]{10,80}$/.test(body.voiceId))) ? body.voiceId : ''
  if (!text) throw new Error('请输入需要朗读的文字')
  if (!voiceId) throw new Error('不支持当前声音')
  const settings = body.voiceSettings && typeof body.voiceSettings === 'object' ? body.voiceSettings : undefined
  const upstream = provider === 'pollinations'
    ? await fetch('https://gen.pollinations.ai/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ input: text, model, voice: pollinationsSpeechVoices[voiceId], response_format: 'mp3' }),
      })
    : await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: settings ? {
            stability: Math.max(0, Math.min(1, Number(settings.stability) || 0.5)),
            similarity_boost: Math.max(0, Math.min(1, Number(settings.similarityBoost) || 0.75)),
            style: Math.max(0, Math.min(1, Number(settings.style) || 0)),
            speed: Math.max(0.7, Math.min(1.2, Number(settings.speed) || 1)),
            use_speaker_boost: settings.useSpeakerBoost !== false,
          } : undefined,
        }),
      })
  if (!upstream.ok) {
    const result = await upstream.json().catch(() => ({}))
    throw new Error(upstreamError(result, upstream.status))
  }
  return json({
    audioBase64: encodeBase64(await upstream.arrayBuffer()),
    contentType: upstream.headers.get('content-type') || 'audio/mpeg',
    characterCost: upstream.headers.get('character-cost') || undefined,
  })
}

async function handleCloneVoice(body, provider, apiKey) {
  if (provider !== 'elevenlabs') throw new Error('当前服务商不支持参考声音')
  if (body.consent !== true) throw new Error('必须确认拥有参考声音的使用权限')
  const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : ''
  const fileName = typeof body.fileName === 'string' ? body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) : 'reference.mp3'
  const mimeType = typeof body.mimeType === 'string' && body.mimeType.startsWith('audio/') ? body.mimeType : 'audio/mpeg'
  const audio = decodeBase64(audioBase64)
  if (!audio.length) throw new Error('参考声音文件为空')
  if (audio.length > 10 * 1024 * 1024) throw new Error('参考声音文件不能超过 10MB')
  const form = new FormData()
  form.append('files', new Blob([audio], { type: mimeType }), fileName)
  form.append('name', typeof body.name === 'string' ? body.name.slice(0, 80) : '参考声音')
  form.append('description', '由 XiaoY_ModelHub 根据用户授权的参考音频创建')
  form.append('remove_background_noise', 'false')
  const upstream = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  })
  const result = await upstream.json().catch(() => ({}))
  if (!upstream.ok) throw new Error(upstreamError(result, upstream.status))
  if (!result.voice_id) throw new Error('服务商未返回自定义声音 ID')
  return json({ voiceId: result.voice_id })
}

async function handleStt(body, provider, apiKey, model) {
  if (provider !== 'groq' && provider !== 'pollinations') throw new Error('该语音转文字服务商尚未接入')
  const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : ''
  const fileName = typeof body.fileName === 'string' ? body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) : 'audio.mp3'
  const mimeType = typeof body.mimeType === 'string' && body.mimeType.startsWith('audio/') ? body.mimeType : 'audio/mpeg'
  const audio = decodeBase64(audioBase64)
  if (!audio.length) throw new Error('音频文件为空')
  if (audio.length > 25 * 1024 * 1024) throw new Error('免费档单个音频文件不能超过 25MB')
  const form = new FormData()
  form.append('file', new Blob([audio], { type: mimeType }), fileName)
  form.append('model', model)
  form.append('response_format', 'json')
  const upstream = await fetch(provider === 'pollinations'
    ? 'https://gen.pollinations.ai/v1/audio/transcriptions'
    : 'https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  const result = await upstream.json().catch(() => ({}))
  if (!upstream.ok) throw new Error(upstreamError(result, upstream.status))
  if (!result.text) throw new Error('模型未识别出文本')
  return json({ text: result.text })
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json()
    const task = typeof body.task === 'string' ? body.task : ''
    const provider = typeof body.provider === 'string' ? body.provider : ''
    const credentials = await resolveProviderCredentials(env, request, provider)
    const apiKey = credentials.apiKey
    const model = typeof body.model === 'string' ? body.model : ''
    if (!apiKey) throw new Error('请先配置个人 API Key，或联系管理员配置全局 Key')
    if (!model) throw new Error('缺少模型 ID')
    if (task === 'chat') return await handleChat(body, provider, apiKey, model)
    if (task === 'tts') return await handleTts(body, provider, apiKey, model)
    if (task === 'clone_voice') return await handleCloneVoice(body, provider, apiKey)
    if (task === 'stt') return await handleStt(body, provider, apiKey, model)
    throw new Error('不支持的创作任务')
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Creative AI request failed' }, 400)
  }
}
