import {
  BadgeCheck,
  BookOpen,
  Boxes,
  CircleHelp,
  Cpu,
  CreditCard,
  FileText,
  Gift,
  History,
  Image,
  KeyRound,
  Layers3,
  MessageSquareText,
  Mic2,
  ReceiptText,
  Share2,
  Sparkles,
  UserRoundCheck,
  Video,
} from 'lucide-react'
import type { GenerationKind } from '../types/generation'
import type { ModelFamily } from './ModelCenter'

export type PortalView = 'marketplace' | 'studio'

interface PortalSidebarProps {
  view: PortalView
  kind: GenerationKind
  historyActive: boolean
  historyCount: number
  modelCount: number
  onMarketplace: (family?: ModelFamily) => void
  onStudio: (kind: GenerationKind) => void
  onHistory: () => void
  onSettings: () => void
  onUnavailable: (label: string) => void
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
  onHistory,
  onSettings,
  onUnavailable,
}: PortalSidebarProps) {
  return (
    <aside className="portal-sidebar" aria-label="主导航">
      <div className="portal-brand"><span><Sparkles /></span><strong>MUSE FLOW</strong></div>

      <div className="portal-nav-scroll">
        <section>
          <small>模型</small>
          <NavButton active={view === 'marketplace'} badge={modelCount} icon={Boxes} label="模型广场" onClick={() => onMarketplace('language')} />
          <NavButton icon={Layers3} label="批量推理" onClick={() => onUnavailable('批量推理')} />
        </section>

        <section>
          <small>体验中心</small>
          <NavButton icon={MessageSquareText} label="文本对话" onClick={() => onMarketplace('language')} />
          <NavButton active={view === 'studio' && kind === 'image' && !historyActive} icon={Image} label="图像生成" onClick={() => onStudio('image')} />
          <NavButton active={view === 'studio' && kind === 'video' && !historyActive} icon={Video} label="视频生成" onClick={() => onStudio('video')} />
          <NavButton icon={Mic2} label="语音合成" onClick={() => onMarketplace('speech')} />
          <NavButton active={view === 'studio' && kind === '3d' && !historyActive} icon={Boxes} label="3D 生成" onClick={() => onStudio('3d')} />
          <NavButton active={historyActive} badge={historyCount} icon={History} label="创作历史" onClick={onHistory} />
        </section>

        <section>
          <small>弹性 GPU <em>Beta</em></small>
          <NavButton icon={Cpu} label="GPU 云函数" onClick={() => onUnavailable('GPU 云函数')} />
        </section>

        <section>
          <small>账户管理</small>
          <NavButton icon={UserRoundCheck} label="实名认证" onClick={() => onUnavailable('实名认证')} />
          <NavButton icon={KeyRound} label="API 密钥" onClick={onSettings} />
          <NavButton icon={CreditCard} label="余额充值" onClick={() => onUnavailable('余额充值')} />
          <NavButton icon={ReceiptText} label="费用明细" onClick={() => onUnavailable('费用明细')} />
          <NavButton icon={FileText} label="发票开具" onClick={() => onUnavailable('发票开具')} />
        </section>

        <section>
          <small>活动中心</small>
          <NavButton icon={Gift} label="推荐官计划" onClick={() => onUnavailable('推荐官计划')} />
          <NavButton icon={BadgeCheck} label="认证专享礼" onClick={() => onUnavailable('认证专享礼')} />
          <NavButton icon={Share2} label="我的邀请记录" onClick={() => onUnavailable('我的邀请记录')} />
        </section>
      </div>

      <footer>
        <button type="button" onClick={() => onUnavailable('文档中心')}><BookOpen />文档中心</button>
        <button type="button" onClick={() => onUnavailable('工单反馈')}><CircleHelp />工单反馈</button>
        <button type="button" onClick={onSettings}><KeyRound />系统设置</button>
        <p>Local AI Generation Workspace</p>
      </footer>
    </aside>
  )
}
