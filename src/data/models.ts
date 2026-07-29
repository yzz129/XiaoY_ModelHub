import type { ImageModel, Resolution, VideoModel } from '../types/generation'

export interface GenerationModelOption<T extends ImageModel | VideoModel> {
  id: T
  apiModel?: string
  name: string
  description: string
  provider: 'ark' | 'agnes' | 'siliconflow' | 'cloudflare' | 'pollinations'
  resolutions: Resolution[]
  maxPromptLength: number
  supportsReferenceImage?: boolean
  pricing: 'free' | 'free-quota' | 'paid' | 'variable'
}

export const imageModels: GenerationModelOption<ImageModel>[] = [
  { id: 'doubao-seedream-5-0-pro-260628', name: 'Seedream 5.0 Pro', description: '方舟 · 旗舰单图与精准创作', provider: 'ark', resolutions: ['1K', '2K'], maxPromptLength: 32000, supportsReferenceImage: true, pricing: 'paid' },
  { id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0 Lite', description: '方舟 · 高性价比通用生图', provider: 'ark', resolutions: ['2K', '3K'], maxPromptLength: 600, supportsReferenceImage: true, pricing: 'paid' },
  { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5', description: '方舟 · 高质量与文字表现', provider: 'ark', resolutions: ['2K', '4K'], maxPromptLength: 600, supportsReferenceImage: true, pricing: 'paid' },
  { id: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0', description: '方舟 · 稳定通用创作', provider: 'ark', resolutions: ['1K', '2K', '4K'], maxPromptLength: 600, supportsReferenceImage: true, pricing: 'paid' },
  { id: 'agnes-image-2.0-flash', name: 'Agnes Image 2.0 Flash', description: 'Agnes AI · 免费核心模型', provider: 'agnes', resolutions: ['1K', '2K', '3K', '4K'], maxPromptLength: 32000, supportsReferenceImage: true, pricing: 'free' },
  { id: 'agnes-image-2.1-flash', name: 'Agnes Image 2.1 Flash', description: 'Agnes AI · 免费核心模型', provider: 'agnes', resolutions: ['1K', '2K', '3K', '4K'], maxPromptLength: 32000, supportsReferenceImage: true, pricing: 'free' },
  { id: 'siliconflow-kolors', apiModel: 'Kwai-Kolors/Kolors', name: 'Kolors', description: 'SiliconFlow · 费用以模型页为准', provider: 'siliconflow', resolutions: ['1K'], maxPromptLength: 2048, pricing: 'variable' },
  { id: 'cloudflare-flux-schnell', apiModel: '@cf/black-forest-labs/flux-1-schnell', name: 'FLUX.1 Schnell', description: 'Cloudflare · 每日免费额度', provider: 'cloudflare', resolutions: ['1K'], maxPromptLength: 2048, pricing: 'free-quota' },
  { id: 'cloudflare-sdxl-lightning', apiModel: '@cf/bytedance/stable-diffusion-xl-lightning', name: 'SDXL-Lightning', description: 'Cloudflare · 单步价格为 0', provider: 'cloudflare', resolutions: ['1K'], maxPromptLength: 2048, supportsReferenceImage: true, pricing: 'free-quota' },
  { id: 'pollinations-sana', apiModel: 'sana', name: 'Sana', description: 'Pollinations · Pollen 赠送额度可用', provider: 'pollinations', resolutions: ['1K'], maxPromptLength: 32000, pricing: 'free-quota' },
  { id: 'pollinations-kontext', apiModel: 'kontext', name: 'Kontext', description: 'Pollinations · 支持参考图编辑', provider: 'pollinations', resolutions: ['1K'], maxPromptLength: 32000, supportsReferenceImage: true, pricing: 'free-quota' },
  { id: 'pollinations-gptimage', apiModel: 'gptimage', name: 'GPT Image Mini', description: 'Pollinations · 支持参考图', provider: 'pollinations', resolutions: ['1K'], maxPromptLength: 32000, supportsReferenceImage: true, pricing: 'free-quota' },
  { id: 'pollinations-klein', apiModel: 'klein', name: 'FLUX Klein', description: 'Pollinations · 支持参考图', provider: 'pollinations', resolutions: ['1K'], maxPromptLength: 32000, supportsReferenceImage: true, pricing: 'free-quota' },
  { id: 'pollinations-nova-canvas', apiModel: 'nova-canvas', name: 'Nova Canvas', description: 'Pollinations · Pollen 赠送额度可用', provider: 'pollinations', resolutions: ['1K'], maxPromptLength: 32000, supportsReferenceImage: true, pricing: 'free-quota' },
  { id: 'pollinations-zimage', apiModel: 'zimage', name: 'Z-Image', description: 'Pollinations · 赠送额度可用', provider: 'pollinations', resolutions: ['1K'], maxPromptLength: 32000, pricing: 'free-quota' },
  { id: 'pollinations-flux', apiModel: 'flux', name: 'FLUX', description: 'Pollinations · 赠送额度可用', provider: 'pollinations', resolutions: ['1K'], maxPromptLength: 32000, pricing: 'free-quota' },
  { id: 'pollinations-qwen-image-community', apiModel: 'Catniti/qwen-image-3.0-pro', name: 'Qwen Image 3.0 Pro', description: 'Pollinations 社区 · 赠送额度可用', provider: 'pollinations', resolutions: ['1K'], maxPromptLength: 32000, pricing: 'free-quota' },
  { id: 'pollinations-qwen-image', apiModel: 'qwen-image', name: 'Qwen Image', description: 'Pollinations · 当前为付费专用', provider: 'pollinations', resolutions: ['1K'], maxPromptLength: 32000, supportsReferenceImage: true, pricing: 'paid' },
]

export const videoModels: GenerationModelOption<VideoModel>[] = [
  { id: 'doubao-seedance-2-0-260128', name: 'Seedance 2.0', description: '方舟 · 旗舰画质与多模态参考', provider: 'ark', resolutions: ['720p', '1080p'], maxPromptLength: 20000, pricing: 'paid' },
  { id: 'doubao-seedance-2-0-fast-260128', name: 'Seedance 2.0 Fast', description: '方舟 · 快速生成与动态表现', provider: 'ark', resolutions: ['720p'], maxPromptLength: 20000, pricing: 'paid' },
  { id: 'doubao-seedance-2-0-mini-260615', name: 'Seedance 2.0 Mini', description: '方舟 · 轻量高性价比', provider: 'ark', resolutions: ['720p'], maxPromptLength: 20000, pricing: 'paid' },
  { id: 'agnes-video-v2.0', name: 'Agnes Video V2.0', description: 'Agnes AI · 免费但限流', provider: 'agnes', resolutions: ['720p', '1080p'], maxPromptLength: 20000, pricing: 'free' },
]

const configuredImageModel = import.meta.env.VITE_ARK_IMAGE_MODEL
const configuredVideoModel = import.meta.env.VITE_ARK_VIDEO_MODEL

export const DEFAULT_IMAGE_MODEL: ImageModel = imageModels.find((model) => model.id === configuredImageModel)?.id ?? imageModels[0].id
export const DEFAULT_VIDEO_MODEL: VideoModel = videoModels.find((model) => model.id === configuredVideoModel)?.id ?? videoModels[0].id

export function getGenerationModel(settings: { kind: string; imageModel?: ImageModel; videoModel?: VideoModel }) {
  return settings.kind === 'image'
    ? imageModels.find((model) => model.id === settings.imageModel) ?? imageModels[0]
    : videoModels.find((model) => model.id === settings.videoModel) ?? videoModels[0]
}

export function getPromptLimit(settings: { kind: string; imageModel?: ImageModel; videoModel?: VideoModel }) {
  return settings.kind === '3d' ? 1200 : getGenerationModel(settings).maxPromptLength
}
