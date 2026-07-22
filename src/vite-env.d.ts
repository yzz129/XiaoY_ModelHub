/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARK_API_KEY?: string
  readonly VITE_ARK_BASE_URL?: string
  readonly VITE_ARK_IMAGE_MODEL?: string
  readonly VITE_ARK_VIDEO_MODEL?: string
  readonly VITE_ARK_3D_MODEL?: string
  readonly VITE_ARK_HYPER3D_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
