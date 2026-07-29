import type { ImageModel, Resolution, VideoModel } from '../types/generation'

export interface GenerationModelOption<T extends ImageModel | VideoModel> {
  id: T
  name: string
  description: string
  provider: 'ark' | 'agnes'
  resolutions: Resolution[]
  maxPromptLength: number
}

export const imageModels: GenerationModelOption<ImageModel>[] = [
  { id: 'doubao-seedream-5-0-pro-260628', name: 'Seedream 5.0 Pro', description: '方舟 · 旗舰单图与精准创作', provider: 'ark', resolutions: ['1K', '2K'], maxPromptLength: 32000 },
  { id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0 Lite', description: '方舟 · 高性价比通用生图', provider: 'ark', resolutions: ['2K', '3K'], maxPromptLength: 600 },
  { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5', description: '方舟 · 高质量与文字表现', provider: 'ark', resolutions: ['2K', '4K'], maxPromptLength: 600 },
  { id: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0', description: '方舟 · 稳定通用创作', provider: 'ark', resolutions: ['1K', '2K', '4K'], maxPromptLength: 600 },
  { id: 'agnes-image-2.0-flash', name: 'Agnes Image 2.0 Flash', description: 'Agnes AI · 文生图与创意视觉', provider: 'agnes', resolutions: ['1K', '2K', '3K', '4K'], maxPromptLength: 32000 },
  { id: 'agnes-image-2.1-flash', name: 'Agnes Image 2.1 Flash', description: 'Agnes AI · 复杂构图与丰富细节', provider: 'agnes', resolutions: ['1K', '2K', '3K', '4K'], maxPromptLength: 32000 },
]

export const videoModels: GenerationModelOption<VideoModel>[] = [
  { id: 'doubao-seedance-2-0-260128', name: 'Seedance 2.0', description: '方舟 · 旗舰画质与多模态参考', provider: 'ark', resolutions: ['720p', '1080p'], maxPromptLength: 20000 },
  { id: 'doubao-seedance-2-0-fast-260128', name: 'Seedance 2.0 Fast', description: '方舟 · 快速生成与动态表现', provider: 'ark', resolutions: ['720p'], maxPromptLength: 20000 },
  { id: 'doubao-seedance-2-0-mini-260615', name: 'Seedance 2.0 Mini', description: '方舟 · 轻量高性价比', provider: 'ark', resolutions: ['720p'], maxPromptLength: 20000 },
  { id: 'agnes-video-v2.0', name: 'Agnes Video V2.0', description: 'Agnes AI · 异步文生视频', provider: 'agnes', resolutions: ['720p', '1080p'], maxPromptLength: 20000 },
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
