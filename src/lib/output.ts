import type { GeneratedAsset } from '../types/generation'

interface SavedAssetResponse {
  url?: string
  path?: string
  error?: string
}

export async function saveGeneratedAsset(asset: GeneratedAsset, signal?: AbortSignal): Promise<GeneratedAsset> {
  const response = await fetch('/__save_generated_asset', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: asset.id,
      kind: asset.kind,
      url: asset.url,
      createdAt: asset.createdAt,
      provider: asset.settings.imageModel?.startsWith('agnes-') || asset.settings.videoModel?.startsWith('agnes-') ? 'agnes' : 'ark',
    }),
  })
  const result = await response.json().catch(() => ({})) as SavedAssetResponse
  if (!response.ok || !result.url || !result.path) {
    throw new Error(result.error ? `素材保存失败：${result.error}` : '素材保存失败：本地服务没有返回文件路径')
  }
  return { ...asset, url: result.url, outputPath: result.path }
}
