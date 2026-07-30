import { Box, Clock3, Download, ExternalLink, Film, ImageOff, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import type { CanvasView, GeneratedAsset } from '../types/generation'
import { styleTemplates } from '../data/templates'
import { getGenerationModel } from '../data/models'
import { ModelPreview } from './ModelPreview'

interface OutputStageProps {
  assets: GeneratedAsset[]
  view: CanvasView
  selectedId?: string
  imageLoading?: boolean
  imageError?: string
  onSelect: (id: string) => void
  onReuse: (asset: GeneratedAsset) => void
  onRemove: (asset: GeneratedAsset) => void
  onSuggestion: (prompt: string) => void
  onRetryImage?: () => void
  refreshingAssetIds?: string[]
  onRefreshAsset: (asset: GeneratedAsset, force?: boolean) => void
}

const suggestions = [
  ['电影感人像', '电影感人物肖像，柔和侧逆光，真实皮肤质感，35mm 胶片色彩'],
  ['未来建筑', '悬浮在云海之上的未来建筑，清晨薄雾，宏大尺度，极简材质'],
  ['品牌视觉', '高级品牌产品视觉，雕塑感构图，精确棚拍光线，克制奢华'],
]

function AssetActions({ asset, onReuse, onRemove, onRefreshAsset, refreshingAssetIds }: Pick<OutputStageProps, 'onReuse' | 'onRemove' | 'onRefreshAsset' | 'refreshingAssetIds'> & { asset: GeneratedAsset }) {
  const refreshing = refreshingAssetIds?.includes(asset.id)
  return <div className="asset-actions"><button type="button" aria-label="复用完整参数" onClick={() => onReuse(asset)}><RotateCcw size={17} /><span>复用</span></button>{asset.taskId && asset.kind !== 'image' && <button type="button" disabled={refreshing} aria-label="重新获取资源链接" onClick={() => onRefreshAsset(asset, true)}><RefreshCw className={refreshing ? 'spin-icon' : ''} size={17} /><span>{refreshing ? '刷新中' : '刷新链接'}</span></button>}<a href={asset.url} target="_blank" rel="noreferrer" aria-label="打开原文件"><ExternalLink size={17} /><span>打开</span></a><a href={asset.url} download aria-label="下载作品"><Download size={17} /><span>下载</span></a><button type="button" className="danger" aria-label="从历史中删除" onClick={() => onRemove(asset)}><Trash2 size={17} /></button></div>
}

function assetLabel(asset: GeneratedAsset) { return asset.kind === 'image' ? 'IMAGE' : asset.kind === 'video' ? 'VIDEO' : '3D · GLB' }

function ThreeDPreview({ compact = false }: { compact?: boolean }) {
  return <div className={`three-d-preview ${compact ? 'compact' : ''}`}><Box /><strong>3D 模型已生成</strong>{!compact && <span>GLB 文件可下载并在 Blender、Unity 等工具中打开</span>}</div>
}

function VideoPreview() { return <div className="media-placeholder"><Film /><strong>视频作品</strong><span>选择后加载预览</span></div> }

export function OutputStage(props: OutputStageProps) {
  const selected = props.assets.find((item) => item.id === props.selectedId) ?? props.assets[0]
  return <div className="output-stage-wrap">
    {(props.imageLoading || props.imageError) && <div className={`image-activity ${props.imageError ? 'failed' : ''}`} role={props.imageError ? 'alert' : 'status'}><span className="activity-orb" /><div><strong>{props.imageError ? '生成请求失败' : '正在生成图片'}</strong><p>{props.imageError ?? '正在等待模型结果，历史和已有作品仍可正常浏览。'}</p></div>{props.imageError && props.onRetryImage && <button type="button" onClick={props.onRetryImage}><RotateCcw size={15} />重试</button>}</div>}
    {!props.assets.length ? <div className="empty-stage"><div className="empty-art"><div className="art-card art-one" /><div className="art-card art-two" /><div className="art-card art-three" /><div className="art-glow" /></div><p className="stage-kicker">YOUR CANVAS AWAITS</p><h2>{props.view === 'history' ? '还没有保存的作品' : '让想象，在此成形'}</h2><p>{props.view === 'history' ? '完成的图片、视频和 3D 模型会出现在这里。' : '写下一个画面，选择视觉主题，然后开始创作。'}</p>{props.view === 'session' && <div className="empty-chips">{suggestions.map(([label, prompt]) => <button type="button" key={label} onClick={() => props.onSuggestion(prompt)}>{label}</button>)}</div>}</div>
      : props.view === 'history' ? <div className="history-grid">{props.assets.map((asset) => <article className="history-card" key={asset.id}><button type="button" className="history-media" onClick={() => props.onSelect(asset.id)} aria-label={`查看作品：${asset.prompt}`}>{asset.kind === 'image' ? <img src={asset.url} alt={asset.prompt} /> : asset.kind === 'video' ? <VideoPreview /> : <ModelPreview asset={asset} compact refreshing={props.refreshingAssetIds?.includes(asset.id)} onRefresh={props.onRefreshAsset} />}</button><div className="history-info"><div><span>{assetLabel(asset)}</span><time><Clock3 size={12} />{new Date(asset.createdAt).toLocaleDateString('zh-CN')}</time></div><p>{asset.prompt}</p><AssetActions asset={asset} onReuse={props.onReuse} onRemove={props.onRemove} onRefreshAsset={props.onRefreshAsset} refreshingAssetIds={props.refreshingAssetIds} /></div></article>)}</div>
        : selected ? <div className="immersive-stage"><div className={`hero-media ${selected.kind === '3d' ? 'model-media' : ''}`} style={{ aspectRatio: selected.kind === '3d' ? '4 / 3' : selected.settings.ratio.replace(':', '/') }}>{selected.kind === 'image' ? <img src={selected.url} alt={selected.prompt} /> : selected.kind === 'video' ? <video key={selected.url} src={selected.url} controls loop playsInline aria-label={selected.prompt} onError={() => props.onRefreshAsset(selected)} /> : <ModelPreview key={selected.url} asset={selected} refreshing={props.refreshingAssetIds?.includes(selected.id)} onRefresh={props.onRefreshAsset} />}</div><div className="asset-rail"><div className="asset-meta"><span>{assetLabel(selected)}</span>{selected.kind !== '3d' && <><strong>{selected.settings.ratio}</strong><strong>{selected.settings.resolution}</strong></>}{selected.kind === 'video' && <strong>{selected.settings.duration}s</strong>}{selected.kind === '3d' ? <strong>{selected.settings.threeDModel === 'hyper3d-gen2-260112' ? 'Hyper3D Gen2' : 'Seed3D 2.0'}</strong> : <><strong>{getGenerationModel(selected.settings).name}</strong><strong>{styleTemplates.find((item) => item.id === selected.settings.styleId)?.name ?? '无视觉主题'}</strong></>}</div><AssetActions asset={selected} onReuse={props.onReuse} onRemove={props.onRemove} onRefreshAsset={props.onRefreshAsset} refreshingAssetIds={props.refreshingAssetIds} /></div>{props.assets.length > 1 && <div className="filmstrip">{props.assets.map((asset) => <button key={asset.id} type="button" className={selected.id === asset.id ? 'active' : ''} aria-current={selected.id === asset.id} onClick={() => props.onSelect(asset.id)}>{asset.kind === 'image' ? <img src={asset.url} alt="" /> : asset.kind === 'video' ? <Film /> : <ThreeDPreview compact />}</button>)}</div>}</div>
          : <div className="empty-stage"><ImageOff /><p>作品暂时无法显示</p></div>}
  </div>
}
