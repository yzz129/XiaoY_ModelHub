import { useState } from 'react'
import { ArrowRight, AudioLines, Box, Image, LockKeyhole, Mail, MessageSquareText, Sparkles, UserRound, Video } from 'lucide-react'
import { loginAccount, registerAccount, type AccountUser } from '../lib/account'
import { BinaryBubbleTrail } from './BinaryBubbleTrail'

interface AuthPageProps {
  onAuthenticated: (user: AccountUser) => void
  onCancel?: () => void
}

const authCapabilities = [
  { icon: MessageSquareText, label: '聊两句' },
  { icon: Image, label: '画一坨' },
  { icon: Video, label: '跑起来' },
  { icon: AudioLines, label: '来点声' },
  { icon: Box, label: '捏立体' },
]

export function AuthPage({ onAuthenticated, onCancel }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const result = mode === 'login'
        ? await loginAccount(email, password)
        : await registerAccount(displayName, email, password)
      onAuthenticated(result.user)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录翻车了')
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-page">
    <BinaryBubbleTrail />
    <section className="auth-story">
      <div className="auth-brand"><span><Sparkles /></span><div><strong>XiaoY</strong><small>MODELHUB</small></div></div>
      <div className="auth-story-main">
        <div className="auth-story-copy">
          <small>AI SHIT FACTORY</small>
          <h1>回来啦，<br /><span>你的屎山还热着。</span></h1>
          <p>想聊就聊，想画就画，今天继续造点新的。</p>
          <div className="auth-capability-icons" aria-label="创作能力">
            {authCapabilities.map(({ icon: Icon, label }) => <span key={label}><Icon /><small>{label}</small></span>)}
          </div>
        </div>
        <div className="auth-mascot-stage" aria-hidden="true">
          <i className="auth-mascot-halo" />
          <img className="auth-mascot-main" src="/images/capabilities/chat-writing-poop-cutout.png" alt="" />
          <span className="auth-sticker auth-sticker-models"><Sparkles /><b>132</b><small>MODELS</small></span>
          <span className="auth-sticker auth-sticker-live"><i /> READY</span>
        </div>
      </div>
      <div className="auth-story-foot"><Sparkles /> 模型已经就位，今天准备造点什么。</div>
    </section>
    <section className="auth-card-wrap">
      <form className="auth-card" onSubmit={submit}>
        <header>
          <div><small>{mode === 'login' ? 'WELCOME BACK' : 'NEW SHIT MAKER'}</small><h2>{mode === 'login' ? '登录开造' : '注册开造'}</h2></div>
          <span className="auth-card-mascot"><img src="/images/capabilities/image-generation-poop.webp" alt="" /></span>
        </header>
        {mode === 'register' && <label>
          <span>昵称</span>
          <div><UserRound /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="屎山留什么名" required minLength={2} /></div>
        </label>}
        <label>
          <span>邮箱</span>
          <div><Mail /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required /></div>
        </label>
        <label>
          <span>密码</span>
          <div><LockKeyhole /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="至少 8 位" required minLength={8} /></div>
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? '正在装车…' : mode === 'login' ? '进场造屎' : '注册并开造'} <ArrowRight /></button>
        <footer>{mode === 'login' ? '还没有铲子？' : '铲子已经到手？'}<button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? '立即注册' : '返回登录'}</button></footer>
        {onCancel && <button type="button" className="auth-return-home" onClick={onCancel}>今天先不造，返回首页</button>}
      </form>
    </section>
  </main>
}
