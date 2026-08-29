import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Box,
  Image,
  MessageSquareText,
  Play,
  Search,
  Sparkles,
  Video,
} from 'lucide-react'
import type { ProviderCatalogState } from '../hooks/useProviderCatalog'
import { BinaryBubbleTrail } from './BinaryBubbleTrail'
import { ModelCenter } from './ModelCenter'

interface PublicHomeProps {
  onRequireAuth: () => void
  providerCatalog: ProviderCatalogState
}

const capabilities = [
  {
    icon: MessageSquareText,
    number: '01',
    title: '你问不过我你信不',
    description: '有事找模型 没事找点事',
    note: 'CHAT / REASONING',
    image: '/images/capabilities/chat-writing-poop.webp',
  },
  {
    icon: Image,
    number: '02',
    title: '我一口气能生成3斤屎',
    description: '一句话下去 画面直接喷涌而出',
    note: 'IMAGE LAB',
    image: '/images/capabilities/image-generation-poop.webp',
  },
  {
    icon: Video,
    number: '03',
    title: '这坨画面自己会跑',
    description: '静止只是它最后的倔强',
    note: 'MOTION',
    image: '/images/capabilities/video-generation-poop.webp',
  },
  {
    icon: AudioLines,
    number: '04',
    title: '声音中弥漫着屎的味道',
    description: '先听个响 再闻个味',
    note: 'AUDIO',
    image: '/images/capabilities/voice-audio-poop.webp',
  },
  {
    icon: Box,
    number: '05',
    title: '我要做赤石仙人',
    description: '平面的屎也有立体梦想',
    note: 'SPATIAL',
    image: '/images/capabilities/three-d-assets-poop.webp',
  },
]

export function PublicHome({ onRequireAuth, providerCatalog }: PublicHomeProps) {
  const providerCount = new Set(providerCatalog.models.map((model) => model.providerId)).size

  function browseModels() {
    document.getElementById('public-models')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <div className="public-home">
    <BinaryBubbleTrail />
    <header className="public-nav">
      <div className="public-nav-inner">
        <a className="public-brand" href="#top" aria-label="XiaoY ModelHub 首页">
          <span className="public-brand-mark"><Sparkles /></span>
          <span className="public-brand-copy"><strong>XiaoY</strong><small>MODELHUB</small></span>
        </a>
        <nav aria-label="首页导航">
          <button type="button" onClick={browseModels}>去挖模型</button>
          <button type="button" className="public-login" onClick={onRequireAuth}>开始造屎 <ArrowUpRight /></button>
        </nav>
      </div>
    </header>

    <main id="top">
      <section className="public-hero" aria-labelledby="public-home-title">
        <div className="public-hero-grid">
          <div className="public-hero-copy">
            <span className="public-eyebrow"><i /> XIAOY MODELHUB</span>
            <h1 id="public-home-title">自己做的shit<span>自己享用</span></h1>
            <p>你生成不过我你信不</p>
            <div className="public-actions">
              <button type="button" className="primary" onClick={browseModels}>去屎山里挖模型 <ArrowRight /></button>
              <button type="button" className="secondary" onClick={onRequireAuth}><Play /> 登录开始出货</button>
            </div>
            <div className="public-trust-row" aria-label="平台数据">
              <span><b>{providerCatalog.models.length}</b><small>个模型<br />随时开席</small></span>
              <span><b>05</b><small>种玩法<br />各显神通</small></span>
              <span><b>{providerCount}</b><small>个平台<br />轮流上桌</small></span>
            </div>
          </div>

          <div className="public-hero-visual" aria-label="XiaoY ModelHub 模型选择界面示意">
            <div className="public-sticker sticker-models"><Sparkles /><b>{providerCatalog.models.length} MODELS</b><small>OPEN TO EXPLORE</small></div>
            <div className="public-prism" aria-hidden="true"><i /><i /><i /></div>
            <div className="public-product-window">
              <div className="public-window-bar"><span /><span /><span /><b>XY / MODEL MAP</b><em>LIVE</em></div>
              <div className="public-window-search"><Search /><span>今天准备整点什么</span><kbd>⌘ K</kbd></div>
              <div className="public-window-grid">
                <article className="window-card window-card-featured">
                  <div><MessageSquareText /><span>SMART CHAT</span></div>
                  <h3>问题甩过来<br />模型自己上</h3>
                  <p>能聊 能写 还能胡说</p>
                  <button type="button" tabIndex={-1}>来坨大的 <ArrowUpRight /></button>
                </article>
                <article className="window-card window-card-image"><Image /><span>IMAGE</span><b>我一口气能生成3斤屎</b><small>12 models</small></article>
                <article className="window-card window-card-video"><Video /><span>VIDEO</span><b>这坨画面自己会跑</b><small>08 models</small></article>
              </div>
              <div className="public-window-foot"><span><i /> ALL SYSTEMS READY</span><b>OPENROUTER · POLLINATIONS · AGNES</b></div>
            </div>
            <div className="public-sticker sticker-no-login"><b>先来白嫖</b><small>用时再登录</small><ArrowUpRight /></div>
          </div>
        </div>
      </section>

      <section className="public-capabilities" aria-labelledby="capability-title">
        <div className="public-section-heading public-section-heading-split">
          <div><span>01 / CREATIVE CAPABILITIES</span><h2 id="capability-title">Shit!<br />Just do it</h2></div>
          <p>你负责整活 模型负责把活整出来</p>
        </div>
        <div className="public-capability-grid">
          {capabilities.map(({ icon: Icon, number, title, description, note, image }, index) => <article key={title} className={`public-capability-card capability-${index + 1}`}>
            <div className="capability-card-top"><span>{number}</span><Icon /><ArrowUpRight /></div>
            <div>
              <small>{note}</small>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
            <img className="capability-art" src={image} alt="" aria-hidden="true" />
          </article>)}
        </div>
      </section>

      <section className="public-model-section" id="public-models" aria-labelledby="public-model-title">
        <div className="public-model-heading">
          <div><span>02 / MODEL MARKETPLACE</span><h2 id="public-model-title">模型屎山欢迎来挖</h2></div>
          <div className="public-model-heading-note"><i /><p><b>今日新鲜出炉</b><br />好赤爱赤</p></div>
        </div>
        <div className="public-model-marketplace">
          <ModelCenter
            embedded
            guest
            models={providerCatalog.models}
            modelsRefreshing={providerCatalog.syncing}
            modelSyncSummary={providerCatalog.syncing ? '正在同步官方模型目录…' : `今天有 ${providerCatalog.models.length} 坨可以挑`}
            modelSyncDetail={providerCatalog.detail}
            onRefreshModels={providerCatalog.refresh}
            onUseModel={() => onRequireAuth()}
          />
        </div>
      </section>
    </main>
  </div>
}
