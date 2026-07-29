import {
  Boxes,
  History,
  Image,
  KeyRound,
  MessageSquareText,
  Mic2,
  Sparkles,
  Video,
} from 'lucide-react'
import type { GenerationKind } from '../types/generation'
import type { ModelFamily } from './ModelCenter'

export type PortalView = 'marketplace' | 'studio' | 'language' | 'audio'

interface PortalSidebarProps {
  view: PortalView
  kind: GenerationKind
  historyActive: boolean
  historyCount: number
  modelCount: number
  onMarketplace: (family?: ModelFamily) => void
  onStudio: (kind: GenerationKind) => void
  onLanguage: () => void
  onAudio: () => void
  onHistory: () => void
  onSettings: () => void
}

interface NavButtonProps {
  active?: boolean
  badge?: string | number
  icon: typeof Boxes
  label: string
  onClick: () => void
}

function NavButton({ active, badge, icon: Icon, label, onClick }: NavButtonProps) {
  return (
    <button type="button" className={`portal-nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon />
      <span>{label}</span>
      {badge !== undefined && <b>{badge}</b>}
    </button>
  )
}

export function PortalSidebar({
  view,
  kind,
  historyActive,
  historyCount,
  modelCount,
  onMarketplace,
  onStudio,
  onLanguage,
  onAudio,
  onHistory,
  onSettings,
}: PortalSidebarProps) {
  return (
    <aside className="portal-sidebar" aria-label="主导航">
      <div className="portal-brand"><span><Sparkles /></span><strong>小Y中转站</strong></div>

      <div className="portal-nav-scroll">
        <section>
          <small>模型服务</small>
          <NavButton active={view === 'marketplace'} badge={modelCount} icon={Boxes} label="模型广场" onClick={() => onMarketplace('language')} />
        </section>

        <section>
          <small>创作中心</small>
          <NavButton active={view === 'language'} icon={MessageSquareText} label="语言模型" onClick={onLanguage} />
          <NavButton active={view === 'audio'} icon={Mic2} label="语音模型" onClick={onAudio} />
          <NavButton active={view === 'studio' && kind === 'image' && !historyActive} icon={Image} label="图像生成" onClick={() => onStudio('image')} />
          <NavButton active={view === 'studio' && kind === 'video' && !historyActive} icon={Video} label="视频生成" onClick={() => onStudio('video')} />
          <NavButton active={view === 'studio' && kind === '3d' && !historyActive} icon={Boxes} label="3D 生成" onClick={() => onStudio('3d')} />
          <NavButton active={historyActive} badge={historyCount} icon={History} label="创作历史" onClick={onHistory} />
        </section>

        <section>
          <small>系统</small>
          <NavButton icon={KeyRound} label="API 与设置" onClick={onSettings} />
        </section>
      </div>

      <footer>
        <p>小Y中转站 · Local workspace</p>
      </footer>
    </aside>
  )
}
