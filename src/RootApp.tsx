import { useEffect, useState } from 'react'
import { LogOut, Save, ShieldCheck, UserRound, X } from 'lucide-react'
import App from './App'
import { AdminDashboard } from './components/AdminDashboard'
import { AuthPage } from './components/AuthPage'
import { PublicHome } from './components/PublicHome'
import { getAccountCredentials, getCurrentAccount, logoutAccount, updateAccountProfile, type AccountUser } from './lib/account'
import { applyProviderConfigurationStatus, clearLegacyBrowserCredentials } from './lib/providerCredentials'
import './admin.css'

export default function RootApp() {
  const [user, setUser] = useState<AccountUser>()
  const [loading, setLoading] = useState(true)
  const [route, setRoute] = useState(() => window.location.hash)
  const [profileOpen, setProfileOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    clearLegacyBrowserCredentials()
    getCurrentAccount()
      .then(async (result) => {
        setUser(result.user)
        const remote = await getAccountCredentials().catch(() => ({ credentials: [], configuredProviders: [] }))
        applyProviderConfigurationStatus(remote.configuredProviders)
      })
      .catch(() => setUser(undefined))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const update = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  async function logout() {
    await logoutAccount().catch(() => undefined)
    setUser(undefined)
    window.location.hash = ''
  }

  async function authenticated(nextUser: AccountUser) {
    setUser(nextUser)
    setAuthOpen(false)
    clearLegacyBrowserCredentials()
    const remote = await getAccountCredentials().catch(() => ({ credentials: [], configuredProviders: [] }))
    applyProviderConfigurationStatus(remote.configuredProviders)
  }

  if (loading) return <main className="account-loading"><span /><strong>正在连接工作台…</strong></main>
  if (!user) {
    if (authOpen) return <AuthPage onAuthenticated={(nextUser) => { void authenticated(nextUser) }} onCancel={() => setAuthOpen(false)} />
    return <PublicHome onRequireAuth={() => setAuthOpen(true)} />
  }
  if (route === '#admin' && user.role === 'admin') {
    return <AdminDashboard user={user} onBack={() => { window.location.hash = '' }} onLogout={() => void logout()} />
  }

  return <div className="account-root">
    <App />
    <div className="account-dock">
      <button className="account-profile-button" onClick={() => setProfileOpen(true)}><UserRound /><b>{user.displayName}</b><small>修改资料</small></button>
      {user.role === 'admin' && <button onClick={() => { window.location.hash = 'admin' }}><ShieldCheck />后台</button>}
      <button className="account-logout-button" onClick={() => void logout()}><LogOut />退出登录</button>
    </div>
    {profileOpen && <ProfileDialog user={user} onClose={() => setProfileOpen(false)} onSaved={(nextUser) => { setUser(nextUser); setProfileOpen(false) }} />}
  </div>
}

function ProfileDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AccountUser
  onClose: () => void
  onSaved: (user: AccountUser) => void
}) {
  const [displayName, setDisplayName] = useState(user.displayName)
  const [email, setEmail] = useState(user.email)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const result = await updateAccountProfile(displayName, email)
      onSaved(result.user)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '个人资料保存失败')
    } finally {
      setSaving(false)
    }
  }

  return <div className="profile-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title">
      <header><div><small>ACCOUNT PROFILE</small><h2 id="profile-dialog-title">修改个人信息</h2></div><button aria-label="关闭" onClick={onClose}><X /></button></header>
      <label><span>昵称</span><input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" /></label>
      <label><span>邮箱</span><input type="email" value={email} maxLength={254} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
      {error && <p role="alert">{error}</p>}
      <footer><button className="profile-cancel" onClick={onClose}>取消</button><button className="profile-save" disabled={saving || displayName.trim().length < 2 || !email.trim()} onClick={() => void save()}><Save />{saving ? '保存中…' : '保存修改'}</button></footer>
    </section>
  </div>
}
