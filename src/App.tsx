import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, keyConfigurada, SUPABASE_URL } from './lib/supabase'
import Login from './components/Login'
import Fila from './components/Fila'
import Alunos from './components/Alunos'
import Propostas from './components/Propostas'
import Inbox from './components/Inbox'
import Metricas from './components/Metricas'
import Config from './components/Config'

const TABS = [
  { id: 'fila', label: 'Fila', icon: '📋' },
  { id: 'alunos', label: 'Alunos', icon: '👥' },
  { id: 'propostas', label: 'Propostas', icon: '🤖' },
  { id: 'inbox', label: 'Inbox', icon: '💬' },
  { id: 'metricas', label: 'Métricas', icon: '📊' },
  { id: 'config', label: 'Config', icon: '⚙️' },
] as const

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<string>('fila')
  const [alertasAbertos, setAlertasAbertos] = useState(0)
  const [propostasPend, setPropostasPend] = useState(0)

  useEffect(() => {
    if (!keyConfigurada) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    const contar = async () => {
      const [a, p] = await Promise.all([
        supabase.from('alertas').select('*', { count: 'exact', head: true }).eq('status', 'aberto'),
        supabase.from('rotas').select('*', { count: 'exact', head: true }).eq('status', 'proposta'),
      ])
      setAlertasAbertos(a.count ?? 0)
      setPropostasPend(p.count ?? 0)
    }
    contar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') contar() }, 60000)
    return () => clearInterval(t)
  }, [session, tab])

  if (!keyConfigurada) {
    return (
      <div className="h-full grid place-items-center px-6">
        <div className="max-w-md rise border border-gold/40 bg-gold/5 rounded-xl p-6">
          <div className="text-3xl mb-3">🔑</div>
          <h1 className="font-display font-bold text-xl">Configure a chave do Supabase</h1>
          <p className="text-sm text-dim mt-3 leading-relaxed">
            Cole a chave <b className="text-cream">anon / publishable</b> do projeto
            {' '}<span className="font-mono text-[12px] text-teal break-all">{SUPABASE_URL}</span>{' '}
            na constante <span className="font-mono text-[12px] text-gold">ANON_KEY</span> em
            {' '}<span className="font-mono text-[12px] text-cream">src/lib/supabase.ts</span> e
            gere o build novamente.
          </p>
        </div>
      </div>
    )
  }

  if (loading) return <div className="h-full grid place-items-center text-dim font-mono text-sm">carregando…</div>
  if (!session) return <Login />

  const badge = (id: string) =>
    id === 'fila' ? alertasAbertos : id === 'propostas' ? propostasPend : 0

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Barra superior (mobile) */}
      <header className="md:hidden shrink-0 border-b border-line bg-panel/60 backdrop-blur">
        <div className="flex items-center px-4 pt-3">
          <div className="font-display font-bold text-lg leading-none">💎 Diana</div>
          <button onClick={() => supabase.auth.signOut()}
            className="ml-auto text-[11px] text-dim hover:text-danger transition-colors">sair →</button>
        </div>
        <nav className="flex gap-1 px-2 py-2 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`relative shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5
                ${tab === t.id ? 'bg-panel2 text-cream' : 'text-dim'}`}>
              <span>{t.icon}</span>{t.label}
              {badge(t.id) > 0 && (
                <span className="text-[9px] font-mono font-semibold bg-danger/20 text-danger border border-danger/40 rounded-full px-1.5">
                  {badge(t.id)}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-line flex-col bg-panel/60 backdrop-blur">
        <div className="px-5 pt-6 pb-5 border-b border-line">
          <div className="font-display font-bold text-2xl tracking-tight leading-none">
            💎 Diana
          </div>
          <div className="font-mono text-[10px] text-dim mt-1.5 uppercase tracking-[0.2em]">Central de Comando</div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2.5
                ${tab === t.id ? 'tab-active bg-panel2' : 'text-dim hover:text-cream hover:bg-panel2/60'}`}>
              <span className="text-base">{t.icon}</span>
              {t.label}
              {badge(t.id) > 0 && (
                <span className={`ml-auto text-[10px] font-mono font-semibold rounded-full px-2 py-0.5 border
                  ${t.id === 'fila' ? 'bg-danger/20 text-danger border-danger/40 pulse-danger' : 'bg-gold/20 text-gold border-gold/40'}`}>
                  {badge(t.id)}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-line">
          <div className="text-[11px] text-dim truncate font-mono">{session.user.email}</div>
          <button onClick={() => supabase.auth.signOut()}
            className="mt-2 text-[11px] text-dim hover:text-danger transition-colors">sair →</button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {tab === 'fila' && <Fila />}
        {tab === 'alunos' && <Alunos />}
        {tab === 'propostas' && <Propostas />}
        {tab === 'inbox' && <Inbox />}
        {tab === 'metricas' && <Metricas />}
        {tab === 'config' && <Config />}
      </main>
    </div>
  )
}
