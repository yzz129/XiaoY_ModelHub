import { catalogModels, type CatalogModel } from '../data/providerCatalog'
import { isProviderConfigured } from './providerCredentials'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  attachments?: ChatAttachment[]
}

export interface ChatAttachment {
  id: string
  name: string
  type: string
  size: number
  dataUrl?: string
  text?: string
}

export const languageModels = catalogModels.filter((model) =>
  model.category === 'chat',
)

export const voiceModels = catalogModels.filter((model) =>
  model.category === 'audio',
)

export function hasCreativeProviderKey(providerId: string) {
  return isProviderConfigured(providerId)
}

export function supportsLanguageImageInput(model: CatalogModel) {
  const evidence = `${model.name} ${model.apiModel} ${model.description}`.toLowerCase()
  return /图片|图像|视觉|多模态|视频输入|vision|multimodal|omni|vl(?:[-_.:/]|$)|gemma-4|pixtral|llava|qwen.*(?:vl|omni)/i.test(evidence)
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
    model: model.apiModel,
    systemPrompt,
    temperature,
    messages: messages.map(({ role, content, attachments }) => {
      if (role !== 'user' || !attachments?.length) return { role, content }
      const textAttachments = attachments
        .filter((attachment) => attachment.text)
        .map((attachment) => `\n\n--- 附件：${attachment.name} ---\n${attachment.text}`)
        .join('')
      const images = attachments.filter((attachment) => attachment.type.startsWith('image/') && attachment.dataUrl)
      if (!images.length) return { role, content: `${content}${textAttachments}` }
      return {
        role,
        content: [
          { type: 'text', text: `${content}${textAttachments}` },
          ...images.map((attachment) => ({ type: 'image_url', image_url: { url: attachment.dataUrl } })),
        ],
      }
    }),
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

export interface VoiceSettings {
  stability: number
  similarityBoost: number
  style: number
  speed: number
  useSpeakerBoost: boolean
}

export async function createSpeech(
  model: CatalogModel,
  text: string,
  voiceId: string,
  voiceSettings?: VoiceSettings,
  signal?: AbortSignal,
) {
  const data = await creativeRequest<{ audioBase64?: string; contentType?: string; characterCost?: string }>({
    task: 'tts',
    provider: model.providerId,
    model: model.apiModel,
    text,
    voiceId,
    voiceSettings,
  }, signal)
  if (!data.audioBase64) throw new Error('语音服务未返回音频')
  return {
    url: `data:${data.contentType || 'audio/mpeg'};base64,${data.audioBase64}`,
    characterCost: data.characterCost,
  }
}

async function fileToBase64(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('无法读取文件'))
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.readAsDataURL(file)
  })
}

export async function cloneSpeechVoice(file: File, name: string, consent: boolean, signal?: AbortSignal) {
  if (!consent) throw new Error('请先确认你拥有该参考声音的使用权限')
  if (!file.type.startsWith('audio/')) throw new Error('参考声音必须是音频文件')
  if (file.size > 10 * 1024 * 1024) throw new Error('参考声音文件不能超过 10MB')
  const data = await creativeRequest<{ voiceId?: string }>({
    task: 'clone_voice',
    provider: 'elevenlabs',
    model: 'eleven_flash_v2_5',
    name: name.trim().slice(0, 80) || `参考声音 ${new Date().toLocaleDateString()}`,
    fileName: file.name,
    mimeType: file.type,
    audioBase64: await fileToBase64(file),
    consent,
  }, signal)
  if (!data.voiceId) throw new Error('参考声音创建失败')
  return data.voiceId
}

export async function transcribeSpeech(model: CatalogModel, file: File, signal?: AbortSignal) {
  if (file.size > 25 * 1024 * 1024) throw new Error('免费档单个音频文件不能超过 25MB')
  const audioBase64 = await fileToBase64(file)
  const data = await creativeRequest<{ text?: string }>({
    task: 'stt',
    provider: model.providerId,
    model: model.apiModel,
    fileName: file.name,
    mimeType: file.type || 'audio/mpeg',
    audioBase64,
  }, signal)
  if (!data.text?.trim()) throw new Error('语音服务未识别出文本')
  return data.text.trim()
}
