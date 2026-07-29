export type GenerationKind = 'image' | 'video' | '3d'
export type ImageMode = 'text'
export type VideoMode = 'text' | 'first-frame' | 'first-last-frame' | 'reference-images'
export type ThreeDMode = 'image-to-3d'
export type GenerationMode = ImageMode | VideoMode | ThreeDMode
export type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16'
export type Resolution = '1K' | '2K' | '3K' | '4K' | '720p' | '1080p'
export type CanvasView = 'session' | 'history'
export type ImageModel = 'doubao-seedream-5-0-pro-260628' | 'doubao-seedream-5-0-260128' | 'doubao-seedream-4-5-251128' | 'doubao-seedream-4-0-250828' | 'agnes-image-2.0-flash' | 'agnes-image-2.1-flash'
export type VideoModel = 'doubao-seedance-2-0-260128' | 'doubao-seedance-2-0-fast-260128' | 'doubao-seedance-2-0-mini-260615' | 'agnes-video-v2.0'
export type ThreeDModel = 'doubao-seed3d-2-0-260328' | 'hyper3d-gen2-260112'

export interface FrameAsset {
  dataUrl: string
  name: string
  mimeType: string
  size: number
  width: number
  height: number
}

export interface StyleTemplate {
  id: string
  name: string
  eyebrow: string
  description: string
  gradient: string
  prompt: string
  tags: string[]
}

export interface GenerationSettings {
  kind: GenerationKind
  mode: GenerationMode
  prompt: string
  ratio: AspectRatio
  resolution: Resolution
  duration: number
  count: number
  styleId: string
  imageModel?: ImageModel
  videoModel?: VideoModel
  threeDModel?: ThreeDModel
  firstFrame?: FrameAsset
  lastFrame?: FrameAsset
  referenceImages?: FrameAsset[]
}

export type SettingsSnapshot = Omit<GenerationSettings, 'firstFrame' | 'lastFrame' | 'referenceImages'> & {
  usedFirstFrame: boolean
  usedLastFrame: boolean
  referenceImageCount: number
}

export interface GeneratedAsset {
  id: string
  kind: GenerationKind
  url: string
  prompt: string
  compiledPrompt: string
  createdAt: number
  settings: SettingsSnapshot
  sessionId: string
  taskId?: string
  outputPath?: string
}

export interface PendingVideoTask {
  taskId: string
  videoId?: string
  provider?: 'ark' | 'agnes'
  compiledPrompt: string
  settings: SettingsSnapshot
  sessionId: string
  createdAt: number
}

export interface PendingThreeDTask {
  taskId: string
  compiledPrompt: string
  settings: SettingsSnapshot
  sessionId: string
  createdAt: number
}

export type VideoJobStatus = 'queued' | 'submitting' | 'running' | 'paused' | 'failed'

export interface VideoJob {
  id: string
  status: VideoJobStatus
  settings: GenerationSettings
  sessionId: string
  createdAt: number
  updatedAt: number
  remoteTask?: PendingVideoTask
  providerStatus?: string
  error?: string
}

export type ThreeDJobStatus = VideoJobStatus

export interface ThreeDJob {
  id: string
  status: ThreeDJobStatus
  settings: GenerationSettings
  sessionId: string
  createdAt: number
  updatedAt: number
  remoteTask?: PendingThreeDTask
  providerStatus?: string
  error?: string
}

export interface WorkspacePreferences {
  maxVideoConcurrency: number
  maxThreeDConcurrency: number
}
