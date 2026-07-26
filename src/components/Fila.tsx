import { useEffect, useState } from 'react'
import { supabase, fmtHora, fmtData, fmtFone } from '../lib/supabase'

type Alerta = {
  id: string; aluno_id: string; gatilho: string; detalhe: string | null
  status: string; dono: string | null; prazo: string | null; created_at: string
  alunos: { nome: string | null; phone: string | null } | null
}

export default function Fila() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [resumo, setResumo] = useState({ alertas: 0, propostas: 0, humano: 0, escalacoes: 0 })
  const [resolvendo, setResolvendo] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 6000) }

  const carregar = async () => {
    const [al, a, p, h, e] = await Promise.all([
      supabase.from('alertas')
        .select('id,aluno_id,gatilho,detalhe,status,dono,prazo,created_at,alunos(nome,phone)')
        .eq('status', 'aberto').order('created_at', { ascending: true }).limit(500),
      supabase.from('alertas').select('*', { count: 'exact', head: true }).eq('status', 'aberto'),
      supabase.from('rotas').select('*', { count: 'exact', head: true }).eq('status', 'proposta'),
      supabase.from('conversas').select('*', { count: 'exact', head: true }).eq('status', 'humano'),
      supabase.from('escalacoes').select('*', { count: 'exact', head: true }).eq('status', 'aberta'),
    ])
    setAlertas((al.data as any) ?? [])
    setResumo({ alertas: a.count ?? 0, propostas: p.count ?? 0, humano: h.count ?? 0, escalacoes: e.count ?? 0 })
  }

  useEffect(() => {
    carregar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar() }, 45000)
    return () => clearInterval(t)
  }, [])

  const resolver = async (a: Alerta) => {
    const nota = window.prompt(
      `Resolver alerta "${a.gatilho}" de ${a.alunos?.nome ?? 'aluno'}.\n\n` +
      'Se quiser, descreva o que foi feito (vira registro de interação). Deixe em branco para só resolver:')
    if (nota === null) return // cancelou
    setResolvendo(a.id)
    const { data: u } = await supabase.auth.getUser()
    const autor = u.user?.email ?? 'painel'
    const { error } = await supabase.from('alertas').update({
      status: 'resolvido', resolvido_por: autor, resolvido_em: new Date().toISOString(),
    }).eq('id', a.id)
    if (error) { setResolvendo(null); return flash('⚠️ Erro ao resolver: ' + error.message) }
    if (nota.trim()) {
      const { error: e2 } = await supabase.rpc('fn_interacao_registrar', {
        p_aluno: a.aluno_id, p_tipo: 'resolucao_alerta',
        p_desc: `[${a.gatilho}] ${nota.trim()}`, p_autor: autor,
      })
      if (e2) flash('Alerta resolvido, mas a interação falhou: ' + e2.message)
      else flash('✅ Alerta resolvido e contato registrado.')
    } else flash('✅ Alerta resolvido.')
    setResolvendo(null)
    carregar()
  }

  // agrupa por gatilho
  const grupos = alertas.reduce<Record<string, Alerta[]>>((acc, a) => {
    (acc[a.gatilho] = acc[a.gatilho] ?? []).push(a)
    return acc
  }, {})

  const CARDS = [
    { label: 'Alertas abertos', valor: resumo.alertas, cls: resumo.alertas > 0 ? 'text-danger' : 'text-win' },
    { label: 'Propostas pendentes', valor: resumo.propostas, cls: resumo.propostas > 0 ? 'text-gold' : 'text-win' },
    { label: 'Conversas com humano', valor: resumo.humano, cls: 'text-teal' },
    { label: 'Escalações abertas', valor: resumo.escalacoes, cls: resumo.escalacoes > 0 ? 'text-danger' : 'text-win' },
  ]

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display font-bold text-2xl">Fila do dia</h1>
        <p className="text-sm text-dim mt-1">O que precisa de gente hoje — alertas da Diana agrupados por gatilho.</p>
      </div>

      {msg && <div className="rise border border-win/40 bg-win/10 text-win text-sm rounded-xl px-4 py-3">{msg}</div>}

      {/* Cards-resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {CARDS.map(c => (
          <div key={c.label} className="border border-line bg-panel/50 rounded-xl p-4">
            <div className={`font-display font-bold text-3xl ${c.cls}`}>{c.valor}</div>
            <div className="text-[11px] text-dim mt-1 uppercase tracking-wider">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Alertas por gatilho */}
      {Object.keys(grupos).length === 0 && (
        <div className="border border-win/25 bg-win/5 rounded-xl p-8 text-center">
          <div className="text-3xl mb-2">🏖️</div>
          <div className="text-win font-semibold">Nenhum alerta aberto</div>
          <div className="text-sm text-dim mt-1">A fila está limpa.</div>
        </div>
      )}
      {Object.entries(grupos).map(([gatilho, lista]) => (
        <section key={gatilho}>
          <h2 className="font-display font-semibold text-lg flex items-center gap-2">
            🚨 {gatilho}
            <span className="text-[11px] font-mono font-semibold bg-danger/15 text-danger border border-danger/40 rounded-full px-2 py-0.5">
              {lista.length}
            </span>
          </h2>
          <div className="mt-2 space-y-2">
            {lista.map(a => (
              <div key={a.id} className="border border-line bg-panel/50 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{a.alunos?.nome || fmtFone(a.alunos?.phone) || 'Aluno'}</div>
                  <div className="font-mono text-[11px] text-dim">{fmtFone(a.alunos?.phone)}</div>
                </div>
                {a.detalhe && <div className="text-xs text-dim flex-1 min-w-40">{a.detalhe}</div>}
                <div className="ml-auto flex items-center gap-3 shrink-0">
                  {a.prazo && <span className="text-[10px] font-mono text-gold" title="Prazo">⏳ {fmtData(a.prazo)}</span>}
                  {a.dono && <span className="text-[10px] font-mono text-dim" title="Dono">👤 {a.dono}</span>}
                  <span className="text-[10px] font-mono text-dim/60">{fmtHora(a.created_at)}</span>
                  <button onClick={() => resolver(a)} disabled={resolvendo === a.id}
                    className="text-xs font-semibold bg-win/15 text-win border border-win/40 rounded-lg px-3 py-1.5 hover:bg-win/25 transition disabled:opacity-40">
                    {resolvendo === a.id ? '…' : '✓ Resolver'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
