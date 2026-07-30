import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowLeft, Bot, FileText, Image, KeyRound, LogOut, MessageSquareText, RefreshCw, Search, Users, Video, Volume2 } from 'lucide-react'
import { getAdminOverview, getAdminRecords, getAdminUsers, type AccountUser, type AdminRecord, type AdminUser } from '../lib/account'
import { AdminConfiguration } from './AdminConfiguration'

interface AdminDashboardProps {
  user: AccountUser
  onBack: () => void
  onLogout: () => void
}

const typeLabels: Record<string, string> = {
  auth_login: '登录',
  auth_register: '注册',
  chat: '对话',
  image: '图片',
  video: '视频',
  audio: '语音',
  transcription: '转写',
  '3d': '3D',
  model_select: '模型',
}

function dateTime(value?: number) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—'
}

function mediaPreview(record: AdminRecord) {
  if (!record.media_url) return null
  if (record.type === 'image') return <img src={record.media_url} alt="生成图片" />
  if (record.type === 'video') return <video controls src={record.media_url} />
  if (record.type === 'audio') return <audio controls src={record.media_url} />
  return <a href={record.media_url} target="_blank" rel="noreferrer">打开媒体文件</a>
}

export function AdminDashboard({ user, onBack, onLogout }: AdminDashboardProps) {
  const [tab, setTab] = useState<'overview' | 'users' | 'records' | 'keys' | 'models'>('overview')
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getAdminOverview>>>()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [records, setRecords] = useState<AdminRecord[]>([])
  const [selected, setSelected] = useState<AdminRecord>()
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      if (tab === 'overview') setOverview(await getAdminOverview())
      if (tab === 'users') setUsers((await getAdminUsers(query)).users)
      if (tab === 'records') setRecords((await getAdminRecords({ type, query })).records)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '后台数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    const request = tab === 'overview'
      ? getAdminOverview().then((result) => { if (active) setOverview(result) })
      : tab === 'users'
        ? getAdminUsers('').then((result) => { if (active) setUsers(result.users) })
        : tab === 'records'
          ? getAdminRecords({ type }).then((result) => { if (active) setRecords(result.records) })
          : Promise.resolve()
    request.catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : '后台数据加载失败')
    })
    return () => { active = false }
  }, [tab, type])
  const typeCounts = useMemo(() => Object.fromEntries((overview?.byType ?? []).map((item) => [item.type, item.count])), [overview])

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-logo"><span>XY</span><div><strong>ModelHub</strong><small>ADMIN CONSOLE</small></div></div>
      <nav>
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><Activity />数据总览</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users />用户管理</button>
        <button className={tab === 'records' ? 'active' : ''} onClick={() => setTab('records')}><FileText />全部记录</button>
        <button className={tab === 'keys' ? 'active' : ''} onClick={() => setTab('keys')}><KeyRound />API Key</button>
        <button className={tab === 'models' ? 'active' : ''} onClick={() => setTab('models')}><Bot />模型管理</button>
      </nav>
      <div className="admin-account"><span>{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{user.email}</small></div></div>
      <button className="admin-back" onClick={onBack}><ArrowLeft />返回工作台</button>
      <button className="admin-logout" onClick={onLogout}><LogOut />退出登录</button>
    </aside>
    <section className="admin-main">
      <header className="admin-topbar">
        <div><small>XIAOY CONTROL CENTER</small><h1>{tab === 'overview' ? '数据总览' : tab === 'users' ? '用户管理' : tab === 'records' ? '全部使用记录' : tab === 'keys' ? 'API Key 管理' : '模型管理'}</h1></div>
        <button onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} />刷新数据</button>
      </header>
      {error && <div className="admin-error">{error}</div>}
      {tab === 'overview' && <div className="admin-overview">
        <div className="metric-grid">
          <article><span><Users /></span><div><small>注册用户</small><strong>{overview?.totalUsers ?? '—'}</strong></div></article>
          <article><span><Activity /></span><div><small>24 小时活跃</small><strong>{overview?.activeUsers24h ?? '—'}</strong></div></article>
          <article><span><FileText /></span><div><small>累计记录</small><strong>{overview?.totalRecords ?? '—'}</strong></div></article>
          <article><span><MessageSquareText /></span><div><small>对话次数</small><strong>{typeCounts.chat ?? 0}</strong></div></article>
        </div>
        <div className="admin-panels">
          <article><header><h2>内容类型</h2><small>全部用户累计</small></header><div className="type-stats">
            {Object.entries(typeLabels).filter(([key]) => !key.startsWith('auth_')).map(([key, label]) => <div key={key}><span>{key === 'chat' ? <MessageSquareText /> : key === 'image' ? <Image /> : key === 'video' ? <Video /> : key === 'audio' ? <Volume2 /> : <FileText />}{label}</span><strong>{typeCounts[key] ?? 0}</strong></div>)}
          </div></article>
          <article><header><h2>最近活动</h2><small>实时记录</small></header><div className="recent-list">
            {(overview?.latest ?? []).map((record) => <button key={record.id} onClick={() => setSelected(record)}><span>{record.display_name || record.email}</span><strong>{typeLabels[record.type] ?? record.type}</strong><small>{dateTime(record.created_at)}</small></button>)}
          </div></article>
        </div>
      </div>}
      {tab === 'users' && <div className="admin-table-page">
        <div className="admin-filters"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索邮箱或昵称" onKeyDown={(event) => event.key === 'Enter' && void refresh()} /></label><button onClick={() => void refresh()}>搜索</button></div>
        <div className="admin-table"><table><thead><tr><th>用户</th><th>角色</th><th>注册时间</th><th>最后登录</th><th>记录数</th></tr></thead><tbody>
          {users.map((item) => <tr key={item.id}><td><strong>{item.display_name}</strong><small>{item.email}</small></td><td><span className={`role ${item.role}`}>{item.role === 'admin' ? '管理员' : '用户'}</span></td><td>{dateTime(item.created_at)}</td><td>{dateTime(item.last_login_at)}</td><td>{item.record_count}</td></tr>)}
        </tbody></table></div>
      </div>}
      {tab === 'records' && <div className="admin-table-page">
        <div className="admin-filters"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户、模型或内容" onKeyDown={(event) => event.key === 'Enter' && void refresh()} /></label><select value={type} onChange={(event) => setType(event.target.value)}><option value="">全部类型</option>{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button onClick={() => void refresh()}>筛选</button></div>
        <div className="admin-table"><table><thead><tr><th>用户</th><th>类型</th><th>模型 / 平台</th><th>内容摘要</th><th>时间</th><th /></tr></thead><tbody>
          {records.map((record) => <tr key={record.id}><td><strong>{record.display_name}</strong><small>{record.email}</small></td><td><span className={`record-type ${record.type}`}>{typeLabels[record.type] ?? record.type}</span></td><td><strong>{record.model_id || '—'}</strong><small>{record.provider || ''}</small></td><td className="record-summary">{record.input_text || record.output_text || record.media_url || '系统事件'}</td><td>{dateTime(record.created_at)}</td><td><button onClick={() => setSelected(record)}>查看</button></td></tr>)}
        </tbody></table></div>
      </div>}
      {tab === 'keys' && <AdminConfiguration mode="keys" />}
      {tab === 'models' && <AdminConfiguration mode="models" />}
    </section>
    {selected && <div className="record-modal-backdrop" onClick={() => setSelected(undefined)}><article className="record-modal" onClick={(event) => event.stopPropagation()}>
      <header><div><small>{typeLabels[selected.type] ?? selected.type}</small><h2>{selected.model_id || '活动详情'}</h2></div><button onClick={() => setSelected(undefined)}>×</button></header>
      <dl><div><dt>用户</dt><dd>{selected.display_name} · {selected.email}</dd></div><div><dt>平台</dt><dd>{selected.provider || '—'}</dd></div><div><dt>时间</dt><dd>{dateTime(selected.created_at)}</dd></div><div><dt>状态</dt><dd>{selected.status}</dd></div></dl>
      {selected.input_text && <section><h3>输入</h3><pre>{selected.input_text}</pre></section>}
      {selected.output_text && <section><h3>输出</h3><pre>{selected.output_text}</pre></section>}
      {mediaPreview(selected) && <section className="record-media"><h3>媒体</h3>{mediaPreview(selected)}</section>}
      {selected.metadata && <details><summary>参数与元数据</summary><pre>{JSON.stringify(selected.metadata, null, 2)}</pre></details>}
    </article></div>}
  </main>
}
