import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// segunda-feira da semana corrente (data local, formato YYYY-MM-DD)
function segundaDaSemana() {
  const d = new Date()
  const dia = d.getDay() // 0 = domingo
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Metricas() {
  const [m, setM] = useState({
    ativos: 0, comRota: 0, semRota: 0, checkinsSemana: 0, conversas7d: 0,
  })
  const [porGatilho, setPorGatilho] = useState<Record<string, number>>({})
  const [carregado, setCarregado] = useState(false)

  const carregar = async () => {
    const seteDias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [ativos, rotas, cks, convs, alrt] = await Promise.all([
      supabase.from('alunos').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
      supabase.from('rotas').select('aluno_id').eq('status', 'ativa').limit(5000),
      supabase.from('checkins').select('*', { count: 'exact', head: true }).gte('semana', segundaDaSemana()),
      supabase.from('conversas').select('*', { count: 'exact', head: true }).gte('last_message_at', seteDias),
      supabase.from('alertas').select('gatilho').eq('status', 'aberto').limit(2000),
    ])
    const alunosComRota = new Set(((rotas.data as any) ?? []).map((r: any) => r.aluno_id)).size
    const totalAtivos = ativos.count ?? 0
    setM({
      ativos: totalAtivos,
      comRota: alunosComRota,
      semRota: Math.max(0, totalAtivos - alunosComRota),
      checkinsSemana: cks.count ?? 0,
      conversas7d: convs.count ?? 0,
    })
    const g: Record<string, number> = {}
    for (const a of ((alrt.data as any) ?? [])) g[a.gatilho] = (g[a.gatilho] ?? 0) + 1
    setPorGatilho(g)
    setCarregado(true)
  }

  useEffect(() => {
    carregar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar() }, 60000)
    return () => clearInterval(t)
  }, [])

  const CARDS = [
    { label: 'Alunos ativos', valor: m.ativos, cls: 'text-cream', icon: '👥' },
    { label: 'Com rota ativa', valor: m.comRota, cls: 'text-win', icon: '🎯' },
    { label: 'Sem rota', valor: m.semRota, cls: m.semRota > 0 ? 'text-gold' : 'text-win', icon: '🧭' },
    { label: 'Check-ins nesta semana', valor: m.checkinsSemana, cls: 'text-teal', icon: '📝' },
    { label: 'Conversas nos últimos 7d', valor: m.conversas7d, cls: 'text-teal', icon: '💬' },
  ]

  const totalAlertas = Object.values(porGatilho).reduce((a, b) => a + b, 0)

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display font-bold text-2xl">Métricas</h1>
        <p className="text-sm text-dim mt-1">Pulso geral do acompanhamento — atualiza a cada minuto.</p>
      </div>

      {!carregado && <div className="text-dim font-mono text-sm">carregando…</div>}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {CARDS.map(c => (
          <div key={c.label} className="border border-line bg-panel/50 rounded-xl p-4">
            <div className="text-lg">{c.icon}</div>
            <div className={`font-display font-bold text-3xl mt-1 ${c.cls}`}>{c.valor}</div>
            <div className="text-[11px] text-dim mt-1 uppercase tracking-wider">{c.label}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="font-display font-semibold text-lg mb-2">
          Alertas abertos por gatilho
          <span className="ml-2 text-[11px] font-mono text-danger">{totalAlertas} no total</span>
        </h2>
        {totalAlertas === 0 ? (
          <div className="border border-win/25 bg-win/5 rounded-xl p-5 text-sm text-win">Nenhum alerta aberto. 🏖️</div>
        ) : (
          <div className="space-y-1.5">
            {Object.entries(porGatilho).sort((a, b) => b[1] - a[1]).map(([g, n]) => (
              <div key={g} className="border border-line bg-panel/40 rounded-lg px-4 py-2.5 flex items-center gap-3">
                <span className="text-sm">🚨 {g}</span>
                <div className="flex-1 h-1.5 bg-panel2 rounded-full overflow-hidden">
                  <div className="h-full bg-danger/60 rounded-full" style={{ width: `${(n / totalAlertas) * 100}%` }} />
                </div>
                <span className="font-mono text-sm text-danger w-8 text-right">{n}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
