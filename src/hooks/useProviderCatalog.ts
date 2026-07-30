import { useCallback, useEffect, useMemo, useState } from 'react'
import { catalogModels } from '../data/providerCatalog'
import {
  mergeProviderCatalog,
  syncProviderCatalog,
  type ProviderCatalogSync,
} from '../lib/providerModels'

export function useProviderCatalog() {
  const [syncResult, setSyncResult] = useState<ProviderCatalogSync>()
  const [syncing, setSyncing] = useState(true)
  const [syncError, setSyncError] = useState('')

  const refresh = useCallback(async () => {
    setSyncing(true)
    setSyncError('')
    try {
      setSyncResult(await syncProviderCatalog(true))
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : '无法同步服务商模型目录')
    } finally {
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    syncProviderCatalog(false)
      .then((result) => {
        if (active) setSyncResult(result)
      })
      .catch((error) => {
        if (active) setSyncError(error instanceof Error ? error.message : '无法同步服务商模型目录')
      })
      .finally(() => {
        if (active) setSyncing(false)
      })
    return () => {
      active = false
    }
  }, [])

  const models = useMemo(
    () => mergeProviderCatalog(syncResult?.models ?? [], catalogModels)
      .filter((model) => (model.providerId === 'agnes' || model.providerId === 'openrouter') && model.pricing === 'free'),
    [syncResult],
  )

  const summary = syncing
    ? '正在同步全部服务商模型…'
    : syncResult
      ? `已同步 ${syncResult.syncedProviders.length} 个平台、${syncResult.models.length} 个官方模型`
      : syncError || '使用内置模型目录'

  const detail = syncResult
    ? [
        syncResult.failedProviders.length ? `同步失败：${syncResult.failedProviders.join('、')}` : '',
        syncResult.skippedProviders.length ? `待配置 Key：${syncResult.skippedProviders.join('、')}` : '',
      ].filter(Boolean).join('；')
    : syncError

  return {
    models,
    syncing,
    summary,
    detail,
    refresh,
  }
}
