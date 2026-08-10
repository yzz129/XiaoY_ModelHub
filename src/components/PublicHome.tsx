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
import { useEffect, useRef } from 'react'
import { catalogModels } from '../data/providerCatalog'
import { ModelCenter } from './ModelCenter'

interface PublicHomeProps {
  onRequireAuth: () => void
}

const capabilities = [
  {
    icon: MessageSquareText,
    number: '01',
    title: '对话与写作',
    description: '从快速问答到复杂推理，在同一处比较不同模型的表达、速度与上下文能力。',
    note: 'CHAT / REASONING',
    image: '/images/capabilities/chat-writing.webp',
  },
  {
    icon: Image,
    number: '02',
    title: '图像生成',
    description: '文生图、图生图与多画幅创作。',
    note: 'IMAGE LAB',
    image: '/images/capabilities/image-generation.webp',
  },
  {
    icon: Video,
    number: '03',
    title: '视频生成',
    description: '从创意描述到视频任务队列。',
    note: 'MOTION',
    image: '/images/capabilities/video-generation.webp',
  },
  {
    icon: AudioLines,
    number: '04',
    title: '语音与音频',
    description: '合成、识别与声音处理模型。',
    note: 'AUDIO',
    image: '/images/capabilities/voice-audio.webp',
  },
  {
    icon: Box,
    number: '05',
    title: '3D 资产',
    description: '用图片或文字生成可管理的 3D 内容。',
    note: 'SPATIAL',
    image: '/images/capabilities/three-d-assets.webp',
  },
]

const binaryTokens = ['0', '1', '01', '10', '0101', '1010']

function BinaryPointerTrail() {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let lastEmit = 0
    let lastX = 0
    let lastY = 0

    function spawnParticle(x: number, y: number, energy = 1) {
      if (reducedMotion.matches || !layer) return

      while (layer.childElementCount >= 32) layer.firstElementChild?.remove()

      const particle = document.createElement('span')
      const angle = Math.random() * Math.PI * 2
      const distance = (24 + Math.random() * 42) * energy
      particle.className = 'public-binary-particle'
      particle.textContent = binaryTokens[Math.floor(Math.random() * binaryTokens.length)]
      particle.style.left = `${x}px`
      particle.style.top = `${y}px`
      particle.style.setProperty('--binary-x', `${Math.cos(angle) * distance}px`)
      particle.style.setProperty('--binary-y', `${Math.sin(angle) * distance - 18}px`)
      particle.style.setProperty('--binary-rotate', `${-14 + Math.random() * 28}deg`)
      particle.style.setProperty('--binary-duration', `${720 + Math.random() * 360}ms`)
      particle.dataset.tone = Math.random() > .78 ? 'ice' : 'violet'
      particle.addEventListener('animationend', () => particle.remove(), { once: true })
      layer.appendChild(particle)
    }

    function handlePointerMove(event: PointerEvent) {
      const now = event.timeStamp
      const minInterval = event.pointerType === 'touch' ? 90 : 64
      const minDistance = event.pointerType === 'touch' ? 24 : 16
      if (now - lastEmit < minInterval || Math.hypot(event.clientX - lastX, event.clientY - lastY) < minDistance) return

      lastEmit = now
      lastX = event.clientX
      lastY = event.clientY
      spawnParticle(event.clientX, event.clientY, event.pointerType === 'touch' ? .8 : .68)
    }

    function handlePointerDown(event: PointerEvent) {
      const particleCount = event.pointerType === 'touch' ? 5 : 4
      for (let index = 0; index < particleCount; index += 1) {
        spawnParticle(event.clientX, event.clientY, 1 + index * .08)
      }
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerdown', handlePointerDown, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
      layer.replaceChildren()
    }
  }, [])

  return <div ref={layerRef} className="public-binary-layer" aria-hidden="true" />
}

export function PublicHome({ onRequireAuth }: PublicHomeProps) {
  function browseModels() {
    document.getElementById('public-models')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <div className="public-home">
    <BinaryPointerTrail />
    <header className="public-nav">
      <div className="public-nav-inner">
        <a className="public-brand" href="#top" aria-label="XiaoY ModelHub 首页">
          <span className="public-brand-mark"><Sparkles /></span>
          <span className="public-brand-copy"><strong>XiaoY</strong><small>MODELHUB</small></span>
        </a>
        <nav aria-label="首页导航">
          <button type="button" onClick={browseModels}>探索模型</button>
          <button type="button" className="public-login" onClick={onRequireAuth}>进入工作台 <ArrowUpRight /></button>
        </nav>
      </div>
    </header>

    <main id="top">
      <section className="public-hero" aria-labelledby="public-home-title">
        <div className="public-hero-grid">
          <div className="public-hero-copy">
            <span className="public-eyebrow"><i /> OPEN MODEL CREATIVE SPACE <b>2026</b></span>
            <h1 id="public-home-title">让每一种灵感，<span>找到合适的 AI。</span></h1>
            <p>XiaoY ModelHub 把分散的 AI 对话、图像、视频、语音与 3D 模型带进一个清晰的创作入口。先自由浏览，再选择真正适合任务的工具。</p>
            <div className="public-actions">
              <button type="button" className="primary" onClick={browseModels}>浏览全部模型 <ArrowRight /></button>
              <button type="button" className="secondary" onClick={onRequireAuth}><Play /> 登录开始创作</button>
            </div>
            <div className="public-trust-row" aria-label="平台数据">
              <span><b>{catalogModels.length}</b><small>个模型<br />持续更新</small></span>
              <span><b>05</b><small>类创作<br />统一入口</small></span>
              <span><b>11</b><small>服务平台<br />灵活接入</small></span>
            </div>
          </div>

          <div className="public-hero-visual" aria-label="XiaoY ModelHub 模型选择界面示意">
            <div className="public-sticker sticker-models"><Sparkles /><b>{catalogModels.length} MODELS</b><small>OPEN TO EXPLORE</small></div>
            <div className="public-prism" aria-hidden="true"><i /><i /><i /></div>
            <div className="public-product-window">
              <div className="public-window-bar"><span /><span /><span /><b>XY / MODEL MAP</b><em>LIVE</em></div>
              <div className="public-window-search"><Search /><span>今天想创造什么？</span><kbd>⌘ K</kbd></div>
              <div className="public-window-grid">
                <article className="window-card window-card-featured">
                  <div><MessageSquareText /><span>SMART CHAT</span></div>
                  <h3>先定义问题，<br />再选择模型。</h3>
                  <p>推理 · 长文本 · 多模态</p>
                  <button type="button" tabIndex={-1}>开始探索 <ArrowUpRight /></button>
                </article>
                <article className="window-card window-card-image"><Image /><span>IMAGE</span><b>视觉实验室</b><small>12 models</small></article>
                <article className="window-card window-card-video"><Video /><span>VIDEO</span><b>让画面动起来</b><small>08 models</small></article>
              </div>
              <div className="public-window-foot"><span><i /> ALL SYSTEMS READY</span><b>OPENROUTER · POLLINATIONS · AGNES</b></div>
            </div>
            <div className="public-sticker sticker-no-login"><b>自由浏览</b><small>使用时再登录</small><ArrowUpRight /></div>
          </div>
        </div>
      </section>

      <section className="public-capabilities" aria-labelledby="capability-title">
        <div className="public-section-heading public-section-heading-split">
          <div><span>01 / CREATIVE CAPABILITIES</span><h2 id="capability-title">想做什么，<br />就从这里开始。</h2></div>
          <p>不同任务需要不同能力。我们用更直观的分类，让模型选择回到创作本身，而不是被参数和平台名称淹没。</p>
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
          <div><span>02 / MODEL MARKETPLACE</span><h2 id="public-model-title">公开模型广场</h2></div>
          <div className="public-model-heading-note"><i /><p><b>实时目录</b><br />共收录 {catalogModels.length} 个模型，可直接筛选和比较。</p></div>
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
  </div>
}
