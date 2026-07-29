/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARK_API_KEY?: string
  readonly VITE_ARK_BASE_URL?: string
  readonly VITE_ARK_IMAGE_MODEL?: string
  readonly VITE_ARK_VIDEO_MODEL?: string
  readonly VITE_ARK_3D_MODEL?: string
  readonly VITE_ARK_HYPER3D_MODEL?: string
  readonly VITE_AGNES_API_KEY?: string
  readonly VITE_AGNES_BASE_URL?: string
  readonly VITE_SILICONFLOW_API_KEY?: string
  readonly VITE_SILICONFLOW_BASE_URL?: string
  readonly VITE_MODELSCOPE_API_KEY?: string
  readonly VITE_GEMINI_API_KEY?: string
  readonly VITE_GROQ_API_KEY?: string
  readonly VITE_OPENROUTER_API_KEY?: string
  readonly VITE_CLOUDFLARE_API_TOKEN?: string
  readonly VITE_CLOUDFLARE_ACCOUNT_ID?: string
  readonly VITE_HUGGINGFACE_TOKEN?: string
  readonly VITE_DASHSCOPE_API_KEY?: string
  readonly VITE_POLLINATIONS_API_KEY?: string
  readonly VITE_ELEVENLABS_API_KEY?: string
  readonly VITE_JINA_API_KEY?: string
  readonly VITE_COHERE_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
