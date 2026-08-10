import {
  ArrowRight,
  AudioLines,
  Box,
  Image,
  MessageSquareText,
  Sparkles,
  Video,
} from 'lucide-react'
import { catalogModels } from '../data/providerCatalog'
import { ModelCenter } from './ModelCenter'

interface PublicHomeProps {
  onRequireAuth: () => void
}

const capabilities = [
  { icon: MessageSquareText, title: 'AI 对话与写作', description: '聚合对话、推理和多模态理解模型，按任务快速筛选。' },
  { icon: Image, title: 'AI 图片生成', description: '支持文生图、图生图与多种画幅，连接主流视觉模型。' },
  { icon: Video, title: 'AI 视频生成', description: '从创意提示词到视频任务队列，在统一工作台完成创作。' },
  { icon: AudioLines, title: '语音与音频', description: '覆盖语音合成、语音识别和常用音频模型。' },
  { icon: Box, title: '3D 模型生成', description: '使用图片或描述生成 3D 资产，集中管理创作结果。' },
]

export function PublicHome({ onRequireAuth }: PublicHomeProps) {
  function browseModels() {
    document.getElementById('public-models')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <div className="public-home">
    <header className="public-nav">
      <a className="public-brand" href="#top" aria-label="XiaoY ModelHub 首页"><span><Sparkles /></span><strong>XiaoY_ModelHub</strong></a>
      <nav aria-label="首页导航">
        <button type="button" onClick={browseModels}>模型广场</button>
        <button type="button" className="public-login" onClick={onRequireAuth}>登录 / 注册 <ArrowRight /></button>
      </nav>
    </header>

    <main id="top">
      <section className="public-hero" aria-labelledby="public-home-title">
        <div className="public-hero-copy">
          <span className="public-eyebrow"><Sparkles /> AI MODEL CREATIVE HUB</span>
          <h1 id="public-home-title">一站式 AI 模型聚合与多模态创作平台</h1>
          <p>XiaoY ModelHub 聚合 OpenRouter、Pollinations、Agnes AI 等服务，让你先浏览和比较模型，再按需登录进行 AI 对话、图片、视频、语音与 3D 创作。</p>
          <div className="public-actions">
            <button type="button" className="primary" onClick={browseModels}>免费浏览模型 <ArrowRight /></button>
            <button type="button" onClick={onRequireAuth}>登录后开始创作</button>
          </div>
          <div className="public-trust-row">
            <span><b>{catalogModels.length}+</b> 内置模型</span>
            <span><b>5</b> 类创作能力</span>
            <span><b>统一</b> 模型工作台</span>
          </div>
        </div>
        <div className="public-hero-visual" aria-hidden="true">
          <div className="public-orbit orbit-one" />
          <div className="public-orbit orbit-two" />
          <div className="public-ai-core"><Sparkles /><strong>XY</strong><small>MODEL HUB</small></div>
          <span className="public-chip chip-chat"><MessageSquareText />对话</span>
          <span className="public-chip chip-image"><Image />图片</span>
          <span className="public-chip chip-video"><Video />视频</span>
          <span className="public-chip chip-audio"><AudioLines />语音</span>
        </div>
      </section>

      <section className="public-capabilities" aria-labelledby="capability-title">
        <div className="public-section-heading">
          <span>CREATIVE CAPABILITIES</span>
          <h2 id="capability-title">从一个首页，发现适合任务的 AI 模型</h2>
          <p>浏览模型无需登录；只有开始使用模型、保存作品或配置 API Key 时才需要账户。</p>
        </div>
        <div className="public-capability-grid">
          {capabilities.map(({ icon: Icon, title, description }) => <article key={title}>
            <span><Icon /></span>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>)}
        </div>
      </section>

      <section className="public-model-section" id="public-models" aria-labelledby="public-model-title">
        <div className="public-section-heading">
          <span>MODEL MARKETPLACE</span>
          <h2 id="public-model-title">公开模型广场</h2>
          <p>按模型类型、平台和价格筛选。点击具体模型时，我们再请你登录。</p>
        </div>
        <div className="public-model-marketplace">
          <ModelCenter
            embedded
            guest
            models={catalogModels}
            modelSyncSummary={`公开展示 ${catalogModels.length} 个内置模型`}
            onUseModel={() => onRequireAuth()}
          />
        </div>
      </section>
    </main>

    <footer className="public-footer">
      <div className="public-brand"><span><Sparkles /></span><strong>XiaoY_ModelHub</strong></div>
      <p>AI 模型聚合、对话写作、图片生成、视频生成、语音处理与 3D 创作平台。</p>
      <button type="button" onClick={onRequireAuth}>登录工作台 <ArrowRight /></button>
    </footer>
  </div>
}
