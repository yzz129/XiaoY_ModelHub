import type { ImageModel, Resolution, VideoModel } from '../types/generation'

export interface GenerationModelOption<T extends ImageModel | VideoModel> {
  id: T
  name: string
  description: string
  resolutions: Resolution[]
}

export const imageModels: GenerationModelOption<ImageModel>[] = [
  { id: 'doubao-seedream-5-0-pro-260628', name: 'Seedream 5.0 Pro', description: '旗舰单图与精准创作', resolutions: ['1K', '2K'] },
  { id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0 Lite', description: '高性价比通用生图', resolutions: ['2K', '3K'] },
  { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5', description: '高质量与文字表现', resolutions: ['2K', '4K'] },
  { id: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0', description: '稳定通用创作', resolutions: ['1K', '2K', '4K'] },
]

export const videoModels: GenerationModelOption<VideoModel>[] = [
  { id: 'doubao-seedance-2-0-260128', name: 'Seedance 2.0', description: '旗舰画质与多模态参考', resolutions: ['720p', '1080p'] },
  { id: 'doubao-seedance-2-0-fast-260128', name: 'Seedance 2.0 Fast', description: '快速生成与动态表现', resolutions: ['720p'] },
  { id: 'doubao-seedance-2-0-mini-260615', name: 'Seedance 2.0 Mini', description: '轻量高性价比', resolutions: ['720p'] },
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
