import { useState } from 'react'
import { ArrowRight, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react'
import { loginAccount, registerAccount, type AccountUser } from '../lib/account'

interface AuthPageProps {
  onAuthenticated: (user: AccountUser) => void
}

export function AuthPage({ onAuthenticated }: AuthPageProps) {
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
    <section className="auth-story">
      <div className="auth-brand"><Sparkles /> XiaoY_ModelHub</div>
      <div>
        <small>ONE ACCOUNT · ALL MODELS</small>
        <h1>一站式 AI 模型聚合与创作工作台</h1>
        <p>XiaoY ModelHub 聚合 OpenRouter、Pollinations 与 Agnes AI 等服务，让你在一个平台使用 GPT、Claude、Gemini、DeepSeek 等热门 AI 模型。</p>
        <div className="auth-seo-summary">
          <h2>覆盖文本、图片、视频、语音和 3D 的多模态 AI 工具</h2>
          <p>支持 AI 对话与写作、AI 编程、文生图、图生图、AI 视频生成、语音合成、语音转文字和 3D 模型生成，创作记录可跨设备安全归档。</p>
        </div>
      </div>
      <div className="auth-feature-row">
        <span>2,000+ 模型目录</span>
        <span>AI 对话与写作</span>
        <span>AI 图片生成</span>
        <span>AI 视频生成</span>
        <span>语音与 3D 创作</span>
      </div>
    </section>
    <section className="auth-card-wrap">
      <form className="auth-card" onSubmit={submit}>
        <header>
          <div><small>{mode === 'login' ? 'WELCOME BACK' : 'CREATE ACCOUNT'}</small><h2>{mode === 'login' ? '登录工作台' : '注册新账户'}</h2></div>
          <span><LockKeyhole /></span>
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
      </form>
    </section>
  </main>
}
