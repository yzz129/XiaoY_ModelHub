import { useState } from 'react'
import { ArrowRight, AudioLines, Box, Image, LockKeyhole, Mail, MessageSquareText, Sparkles, UserRound, Video } from 'lucide-react'
import { loginAccount, registerAccount, type AccountUser } from '../lib/account'
import { BinaryBubbleTrail } from './BinaryBubbleTrail'

interface AuthPageProps {
  onAuthenticated: (user: AccountUser) => void
  onCancel?: () => void
}

const authCapabilities = [
  { icon: MessageSquareText, label: '对话' },
  { icon: Image, label: '图像' },
  { icon: Video, label: '视频' },
  { icon: AudioLines, label: '声音' },
  { icon: Box, label: '3D' },
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
      setError(caught instanceof Error ? caught.message : '登录失败')
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
          <small>YOUR CREATIVE SPACE</small>
          <h1>回来啦，<br /><span>灵感已经就位。</span></h1>
          <p>想写、想画、想让画面动起来，都从这里继续。</p>
          <div className="auth-capability-icons" aria-label="创作能力">
            {authCapabilities.map(({ icon: Icon, label }) => <span key={label}><Icon /><small>{label}</small></span>)}
          </div>
        </div>
        <div className="auth-mascot-stage" aria-hidden="true">
          <i className="auth-mascot-halo" />
          <img className="auth-mascot-main" src="/images/capabilities/chat-writing-cutout.png" alt="" />
          <span className="auth-sticker auth-sticker-models"><Sparkles /><b>132</b><small>MODELS</small></span>
          <span className="auth-sticker auth-sticker-live"><i /> READY</span>
        </div>
      </div>
      <div className="auth-story-foot"><Sparkles /> 选择合适的模型，把想法做出来。</div>
    </section>
    <section className="auth-card-wrap">
      <form className="auth-card" onSubmit={submit}>
        <header>
          <div><small>{mode === 'login' ? 'HELLO AGAIN' : 'NEW CREATOR'}</small><h2>{mode === 'login' ? '继续创作' : '创建账户'}</h2></div>
          <span className="auth-card-mascot"><img src="/images/capabilities/image-generation.webp" alt="" /></span>
        </header>
        {mode === 'register' && <label>
          <span>昵称</span>
          <div><UserRound /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="怎么称呼你" required minLength={2} /></div>
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
        <button type="submit" disabled={loading}>{loading ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'} <ArrowRight /></button>
        <footer>{mode === 'login' ? '还没有账户？' : '已经有账户？'}<button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? '立即注册' : '返回登录'}</button></footer>
        {onCancel && <button type="button" className="auth-return-home" onClick={onCancel}>暂不登录，返回首页</button>}
      </form>
    </section>
  </main>
}
