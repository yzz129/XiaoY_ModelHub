import { catalogModels, type CatalogModel } from '../data/providerCatalog'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export const languageModels = catalogModels.filter((model) =>
  model.category === 'chat' && model.integration === 'ready',
)

export const voiceModels = catalogModels.filter((model) =>
  model.category === 'audio' && model.integration === 'ready',
)

const providerKeys: Record<string, string> = {
  siliconflow: import.meta.env.VITE_SILICONFLOW_API_KEY ?? '',
  groq: import.meta.env.VITE_GROQ_API_KEY ?? '',
  openrouter: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
  pollinations: import.meta.env.VITE_POLLINATIONS_API_KEY ?? '',
  elevenlabs: import.meta.env.VITE_ELEVENLABS_API_KEY ?? '',
}

export function hasCreativeProviderKey(providerId: string) {
  return Boolean(providerKeys[providerId])
}

async function creativeRequest<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch('/__creative_ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('已停止本次请求', { cause: error })
    throw new Error('无法连接本地 AI 代理，请确认开发服务仍在运行', { cause: error })
  }
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`)
  return data
}

export async function sendLanguageMessage(
  model: CatalogModel,
  messages: ChatMessage[],
  systemPrompt: string,
  temperature: number,
  signal?: AbortSignal,
) {
  const data = await creativeRequest<{ content?: string }>({
    task: 'chat',
    provider: model.providerId,
    apiKey: providerKeys[model.providerId],
    model: model.apiModel,
    systemPrompt,
    temperature,
    messages: messages.map(({ role, content }) => ({ role, content })),
  }, signal)
  if (!data.content?.trim()) throw new Error(`${model.name} 未返回文本内容`)
  return data.content.trim()
}

export interface SpeechVoice {
  id: string
  name: string
  description: string
}

export const speechVoices: SpeechVoice[] = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: '沉稳清晰，适合旁白' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: '自然柔和，适合讲解' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: '厚实有力，适合宣传' },
]

export function isTextToSpeechModel(model: CatalogModel) {
  return model.providerId === 'elevenlabs' || model.apiModel.includes('tts') || model.apiModel.startsWith('eleven')
}

export async function createSpeech(
  model: CatalogModel,
  text: string,
  voiceId: string,
  signal?: AbortSignal,
) {
  const data = await creativeRequest<{ audioBase64?: string; contentType?: string; characterCost?: string }>({
    task: 'tts',
    provider: model.providerId,
    apiKey: providerKeys[model.providerId],
    model: model.apiModel,
    text,
    voiceId,
  }, signal)
  if (!data.audioBase64) throw new Error('语音服务未返回音频')
  return {
    url: `data:${data.contentType || 'audio/mpeg'};base64,${data.audioBase64}`,
    characterCost: data.characterCost,
  }
}

export async function transcribeSpeech(model: CatalogModel, file: File, signal?: AbortSignal) {
  if (file.size > 25 * 1024 * 1024) throw new Error('免费档单个音频文件不能超过 25MB')
  const audioBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取音频文件'))
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.readAsDataURL(file)
  })
  const data = await creativeRequest<{ text?: string }>({
    task: 'stt',
    provider: model.providerId,
    apiKey: providerKeys[model.providerId],
    model: model.apiModel,
    fileName: file.name,
    mimeType: file.type || 'audio/mpeg',
    audioBase64,
  }, signal)
  if (!data.text?.trim()) throw new Error('语音服务未识别出文本')
  return data.text.trim()
}
