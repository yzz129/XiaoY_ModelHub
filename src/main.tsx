import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import RootApp from './RootApp'
import './styles.css'
import './ui-refinement.css'

function preventContentExtraction(event: Event) {
  event.preventDefault()
}

for (const eventName of ['contextmenu', 'copy', 'cut', 'dragstart', 'selectstart']) {
  document.addEventListener(eventName, preventContentExtraction, { capture: true })
}

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  failed: boolean
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('XiaoY ModelHub failed to render', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return <main style={{ minHeight: '100vh', padding: 24, display: 'grid', placeItems: 'center', color: '#291844', background: '#fcfbff', fontFamily: '"Microsoft YaHei", system-ui, sans-serif', textAlign: 'center' }}>
      <div>
        <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>页面暂时没有加载完整</h1>
        <p style={{ margin: '0 0 22px', color: '#766a87', fontSize: 14 }}>重新加载一次即可继续浏览模型。</p>
        <button type="button" onClick={() => window.location.replace(`${window.location.pathname}?reload=${Date.now()}`)} style={{ minHeight: 44, padding: '0 22px', border: 0, borderRadius: 999, color: '#fff', background: '#7c3aed', fontWeight: 800, cursor: 'pointer' }}>重新加载</button>
      </div>
    </main>
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><AppErrorBoundary><RootApp /></AppErrorBoundary></StrictMode>,
)
