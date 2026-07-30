import { useCallback, useEffect, useMemo, useState } from 'react'
import { catalogModels, type CatalogModel } from '../data/providerCatalog'
import { getCustomCatalogModels } from '../lib/account'
import {
  mergeProviderCatalog,
  syncProviderCatalog,
  type ProviderCatalogSync,
} from '../lib/providerModels'

export function useProviderCatalog() {
  const [syncResult, setSyncResult] = useState<ProviderCatalogSync>()
  const [syncing, setSyncing] = useState(true)
  const [syncError, setSyncError] = useState('')
  const [customModels, setCustomModels] = useState<CatalogModel[]>([])

  const refresh = useCallback(async () => {
    setSyncing(true)
    setSyncError('')
    try {
      const [providerResult, customResult] = await Promise.all([
        syncProviderCatalog(true),
        getCustomCatalogModels(),
      ])
      setSyncResult(providerResult)
      setCustomModels(customResult.models)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : '无法同步服务商模型目录')
    } finally {
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      syncProviderCatalog(false),
      getCustomCatalogModels().catch(() => ({ models: [] })),
    ])
      .then(([result, customResult]) => {
        if (active) {
          setSyncResult(result)
          setCustomModels(customResult.models)
        }
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
    () => mergeProviderCatalog(syncResult?.models ?? [], [...catalogModels, ...customModels]),
    [customModels, syncResult],
  )

  const summary = syncing
    ? '正在同步全部服务商模型…'
    : syncResult
      ? `已同步 ${syncResult.syncedProviders.length} 个平台、${syncResult.models.length} 个官方模型${customModels.length ? `，含 ${customModels.length} 个后台模型` : ''}`
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
