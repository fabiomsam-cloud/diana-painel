import { useEffect, useState } from 'react'
import { supabase, fmtFone } from '../lib/supabase'

// segunda-feira da semana corrente (data LOCAL, formato YYYY-MM-DD) — mesma
// régua do motor/formulário usada no Disparos.tsx
function segundaDaSemana() {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Perf = {
  aluno_id: string; nome: string | null; phone: string | null; situacao: string | null
  diagnostico_em: string | null; ultima_semana: string | null
  horas_atual: number | null; horas_anterior: number | null; dias_atual: number | null
  sentimento: number | null; tendencia: string
}
type CkSemana = {
  aluno_id: string; semana: string; respostas: any; created_at: string
  alunos: { nome: string | null; phone: string | null; ficha: any } | null
}
type DiagRecente = {
  aluno_id: string; respostas: any; concluido_em: string | null
  alunos: { nome: string | null; ficha: any } | null
}
type Ponto = { aluno_id: string; nome: string | null; pontos: number; eventos: number; ultimo_evento: string | null }

// nome de tratamento: a ficha guarda "como_chamar" (apelido que o aluno pediu)
const tratamento = (ficha: any, nome: string | null) =>
  (ficha?.como_chamar && String(ficha.como_chamar).trim()) || nome || '—'

const txt = (v: any) => {
  const s = String(v ?? '').trim()
  return s && s !== '-' && s !== '—' ? s : ''
}

const DIA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const fmtDia = (ts: string) => {
  const d = new Date(ts)
  return `${DIA_SEMANA[d.getDay()]} · ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// bolinha de sentimento 0-10: verde ≥7 · amarela 4-6 · vermelha <4 · cinza sem nota
const corSentimento = (n: number | null) =>
  n == null ? 'bg-dim/40' : n >= 7 ? 'bg-win' : n >= 4 ? 'bg-gold' : 'bg-danger'

const TENDENCIAS: {
  key: string; emoji: string; label: string
  num: string; bd: string; bg: string
}[] = [
  { key: 'subindo', emoji: '🚀', label: 'Subindo', num: 'text-win', bd: 'border-win/40', bg: 'bg-win/10' },
  { key: 'estavel', emoji: '➖', label: 'Estável', num: 'text-teal', bd: 'border-teal/40', bg: 'bg-teal/10' },
  { key: 'caindo', emoji: '📉', label: 'Caindo', num: 'text-danger', bd: 'border-danger/40', bg: 'bg-danger/10' },
  { key: 'parado', emoji: '⏸', label: 'Parado', num: 'text-danger/80', bd: 'border-danger/30', bg: 'bg-panel2/80' },
  { key: 'primeiro_checkin', emoji: '🆕', label: '1º check-in', num: 'text-gold', bd: 'border-gold/40', bg: 'bg-gold/10' },
  { key: 'sem_checkin', emoji: '⬜', label: 'Sem check-in', num: 'text-dim', bd: 'border-line', bg: 'bg-panel/60' },
]
const ATENCAO = new Set(['caindo', 'parado'])

export default function Metricas() {
  const [ativos, setAtivos] = useState(0)
  const [adimpl, setAdimpl] = useState(0)
  const [perf, setPerf] = useState<Perf[]>([])
  const [cks, setCks] = useState<CkSemana[]>([])
  const [diags, setDiags] = useState<DiagRecente[]>([])
  const [pontos, setPontos] = useState<Ponto[]>([])
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set(['caindo', 'parado']))
  const [carregado, setCarregado] = useState(false)

  const carregar = async () => {
    const semana = segundaDaSemana()
    const seteDias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [ats, pf, ck, dg, pt] = await Promise.all([
      supabase.from('alunos').select('situacao').eq('status', 'ativo').limit(5000),
      supabase.from('vw_performance_alunos').select('*').limit(5000),
      supabase.from('checkins_semana')
        .select('aluno_id,semana,respostas,created_at,alunos(nome,phone,ficha)')
        .eq('semana', semana).order('created_at', { ascending: false }).limit(2000),
      supabase.from('diagnosticos')
        .select('aluno_id,respostas,concluido_em,alunos(nome,ficha)')
        .gte('concluido_em', seteDias).order('concluido_em', { ascending: false }).limit(300),
      supabase.from('vw_pontos_saldo').select('aluno_id,nome,pontos,eventos,ultimo_evento').limit(5000),
    ])
    const listaAtivos = ((ats.data as any) ?? []) as { situacao: string | null }[]
    setAtivos(listaAtivos.length)
    setAdimpl(listaAtivos.filter(a => a.situacao === 'adimplente').length)
    setPerf(((pf.data as any) ?? []))
    setCks(((ck.data as any) ?? []))
    setDiags(((dg.data as any) ?? []))
    setPontos(((pt.data as any) ?? []))
    setCarregado(true)
  }

  useEffect(() => {
    carregar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar() }, 60000)
    return () => clearInterval(t)
  }, [])

  // ── derivados ────────────────────────────────────────────────────────────
  const comDiag = perf.length
  const ckAlunos = new Set(cks.map(c => c.aluno_id)).size
  const pontosTotal = pontos.reduce((a, p) => a + (p.pontos ?? 0), 0)
  const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0

  const porTendencia: Record<string, Perf[]> = {}
  for (const t of TENDENCIAS) porTendencia[t.key] = []
  for (const p of perf) (porTendencia[p.tendencia] = porTendencia[p.tendencia] ?? []).push(p)
  for (const k of Object.keys(porTendencia)) {
    porTendencia[k].sort((a, b) => (a.sentimento ?? 11) - (b.sentimento ?? 11)
      || (a.nome ?? '').localeCompare(b.nome ?? ''))
  }

  const pedidosSemana = cks.filter(c => txt(c.respostas?.precisa_semana))
  const pedidosDiag = diags.filter(d => txt(d.respostas?.ajuda_professor))
  const vitorias = cks.flatMap(c => {
    const out: { c: CkSemana; tipo: 'vitoria' | 'registro'; texto: string }[] = []
    const v = txt(c.respostas?.vitoria); const r = txt(c.respostas?.registro_especial)
    if (v) out.push({ c, tipo: 'vitoria', texto: v })
    if (r) out.push({ c, tipo: 'registro', texto: r })
    return out
  })
  const ranking = [...pontos].sort((a, b) => (b.pontos ?? 0) - (a.pontos ?? 0)).slice(0, 10)
  const maxPontos = ranking[0]?.pontos || 1

  const toggle = (k: string) => {
    const s = new Set(expandidos)
    s.has(k) ? s.delete(k) : s.add(k)
    setExpandidos(s)
  }

  // ── blocos ───────────────────────────────────────────────────────────────
  const CARDS = [
    { icon: '👥', label: 'Alunos ativos', valor: String(ativos), cls: 'text-cream', sub: 'base do acompanhamento' },
    {
      icon: '💳', label: 'Adimplentes / Inadimpl.', valor: '', cls: '', sub: `${pct(adimpl, ativos)}% em dia`,
      custom: (
        <div className="font-display font-bold text-3xl mt-1">
          <span className="text-win">{adimpl}</span>
          <span className="text-dim text-xl mx-1">/</span>
          <span className={ativos - adimpl > 0 ? 'text-danger' : 'text-win'}>{ativos - adimpl}</span>
        </div>
      ),
    },
    { icon: '🩺', label: 'Diagnósticos concluídos', valor: String(comDiag), cls: 'text-teal', sub: `${pct(comDiag, ativos)}% da base` },
    { icon: '📝', label: 'Check-ins desta semana', valor: String(ckAlunos), cls: 'text-gold', sub: `${pct(ckAlunos, comDiag)}% de quem tem diagnóstico` },
    { icon: '⭐', label: 'Pontos distribuídos', valor: pontosTotal.toLocaleString('pt-BR'), cls: 'text-gold', sub: `${pontos.length} alunos pontuando` },
  ]

  const FUNIL = [
    { label: 'Base ativa', n: ativos, cor: 'bg-dim/50', txt: 'text-cream' },
    { label: 'Diagnóstico concluído', n: comDiag, cor: 'bg-teal/60', txt: 'text-teal' },
    { label: 'Check-in desta semana', n: ckAlunos, cor: 'bg-win/60', txt: 'text-win' },
  ]

  const linhaAluno = (p: Perf) => {
    const ha = p.horas_anterior; const hc = p.horas_atual
    const seta = ha == null || hc == null ? { s: '→', c: 'text-dim' }
      : hc > ha ? { s: '↑', c: 'text-win' } : hc < ha ? { s: '↓', c: 'text-danger' } : { s: '→', c: 'text-dim' }
    return (
      <div key={p.aluno_id} className="flex items-center gap-3 border-t border-line/50 px-4 py-2 text-xs first:border-t-0">
        <span title={p.sentimento != null ? `sentimento ${p.sentimento}/10` : 'sem nota de sentimento'}
          className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${corSentimento(p.sentimento)}`} />
        <span className="font-medium text-sm truncate min-w-0 flex-1">{p.nome || '—'}</span>
        {p.situacao && p.situacao !== 'adimplente' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-danger/40 text-danger bg-danger/10 shrink-0">{p.situacao}</span>
        )}
        <span className="font-mono text-dim shrink-0">
          {ha ?? '—'}h <b className={seta.c}>{seta.s}</b> <b className="text-cream">{hc ?? '—'}h</b>
        </span>
        <span className="font-mono text-dim shrink-0 w-12 text-right" title="sentimento 0-10">
          {p.sentimento != null ? `${p.sentimento}/10` : ''}
        </span>
        <span className="font-mono text-[10px] text-dim/60 shrink-0 hidden sm:inline">{fmtFone(p.phone)}</span>
      </div>
    )
  }

  const listaGrupo = (key: string) => {
    const meta = TENDENCIAS.find(t => t.key === key)!
    const lista = porTendencia[key] ?? []
    return (
      <div key={key} className="rise border border-line rounded-xl overflow-hidden">
        <div className={`px-4 py-2 flex items-center gap-2 ${meta.bg} border-b border-line`}>
          <span>{meta.emoji}</span>
          <span className="text-xs font-semibold uppercase tracking-wider">{meta.label}</span>
          <span className={`font-mono text-xs ${meta.num}`}>{lista.length}</span>
          <button onClick={() => toggle(key)} className="ml-auto text-[10px] text-dim hover:text-cream transition">fechar ✕</button>
        </div>
        {lista.length === 0
          ? <div className="px-4 py-3 text-xs text-dim">Ninguém neste grupo. 🎉</div>
          : <div className="max-h-72 overflow-y-auto bg-panel/40">{lista.map(linhaAluno)}</div>}
      </div>
    )
  }

  const outrosExpandidos = TENDENCIAS.filter(t => !ATENCAO.has(t.key) && expandidos.has(t.key))
  const atencaoExpandidos = TENDENCIAS.filter(t => ATENCAO.has(t.key) && expandidos.has(t.key))
  const totalAtencao = (porTendencia.caindo?.length ?? 0) + (porTendencia.parado?.length ?? 0)

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-8 max-w-5xl">
      <div>
        <h1 className="font-display font-bold text-2xl">Métricas</h1>
        <p className="text-sm text-dim mt-1">Dashboard executivo do acompanhamento — quem avança, quem precisa de resgate e o que os alunos estão pedindo.</p>
      </div>

      {!carregado && <div className="text-dim font-mono text-sm">carregando…</div>}

      {/* ── 1 · Cards de topo ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {CARDS.map(c => (
          <div key={c.label} className="border border-line bg-panel/50 rounded-xl p-4">
            <div className="text-lg">{c.icon}</div>
            {(c as any).custom ?? <div className={`font-display font-bold text-3xl mt-1 ${c.cls}`}>{c.valor}</div>}
            <div className="text-[11px] text-dim mt-1 uppercase tracking-wider">{c.label}</div>
            <div className="text-[10px] font-mono text-dim/60 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── 2 · Funil ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="font-display font-semibold text-lg mb-3">🎯 Funil do acompanhamento</h2>
        <div className="border border-line bg-panel/40 rounded-xl p-4 space-y-3">
          {FUNIL.map((f, i) => (
            <div key={f.label} className="flex items-center gap-3">
              <div className="w-44 shrink-0 text-xs text-dim text-right">{f.label}</div>
              <div className="flex-1 h-7 bg-panel2 rounded-lg overflow-hidden relative">
                <div className={`h-full ${f.cor} rounded-lg transition-all duration-700`}
                  style={{ width: `${Math.max(pct(f.n, ativos), f.n > 0 ? 4 : 0)}%` }} />
                <span className="absolute inset-y-0 left-3 flex items-center font-mono text-xs font-bold text-cream drop-shadow">
                  {f.n}
                </span>
              </div>
              <div className={`w-12 shrink-0 font-mono text-xs text-right ${f.txt}`}>
                {i === 0 ? '100%' : `${pct(f.n, ativos)}%`}
              </div>
            </div>
          ))}
          <div className="text-[10px] text-dim/60 pl-[11.75rem]">
            % sobre a base ativa · check-in conta 1× por aluno na semana corrente
          </div>
        </div>
      </section>

      {/* ── 3 · Tendências ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg">📈 Tendências de performance
          <span className="ml-2 text-[11px] font-mono text-dim">{comDiag} alunos com diagnóstico · semana vs. anterior</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {TENDENCIAS.map(t => (
            <button key={t.key} onClick={() => toggle(t.key)}
              className={`text-left border rounded-xl p-3 transition hover:brightness-110
                ${expandidos.has(t.key) ? `${t.bd} ${t.bg}` : 'border-line bg-panel/50'}`}>
              <div className="text-base">{t.emoji}</div>
              <div className={`font-display font-bold text-2xl ${t.num}`}>{(porTendencia[t.key] ?? []).length}</div>
              <div className="text-[10px] text-dim uppercase tracking-wider mt-0.5">{t.label}</div>
            </button>
          ))}
        </div>

        {outrosExpandidos.length > 0 && (
          <div className="space-y-2">{outrosExpandidos.map(t => listaGrupo(t.key))}</div>
        )}

        <div className="space-y-2">
          <h3 className="font-display font-semibold text-base text-danger">
            ⚠️ Precisam de atenção
            <span className="ml-2 text-[11px] font-mono">{totalAtencao} alunos</span>
            <span className="ml-2 text-[11px] font-normal text-dim">— lista de resgate da equipe</span>
          </h3>
          {totalAtencao === 0
            ? <div className="border border-win/25 bg-win/5 rounded-xl p-4 text-sm text-win">Ninguém caindo ou parado esta semana. 🏖️</div>
            : atencaoExpandidos.length === 0
              ? <div className="text-xs text-dim">Listas recolhidas — clique nos cards 📉 Caindo / ⏸ Parado acima para reabrir.</div>
              : atencaoExpandidos.map(t => listaGrupo(t.key))}
        </div>
      </section>

      {/* ── 4 · Pedidos ao professor ──────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg">💛 Pedidos ao professor Fábio
          <span className="ml-2 text-[11px] font-mono text-gold">{pedidosSemana.length} nesta semana</span>
        </h2>
        {pedidosSemana.length === 0 && pedidosDiag.length === 0 ? (
          <div className="border border-line bg-panel/40 rounded-xl p-5 text-sm text-dim">Nenhum pedido esta semana 🎉</div>
        ) : (
          <>
            {pedidosSemana.length === 0
              ? <div className="text-xs text-dim">Nenhum pedido nos check-ins desta semana.</div>
              : (
                <div className="space-y-1.5">
                  {pedidosSemana.map(c => (
                    <div key={c.aluno_id + c.created_at} className="border border-gold/25 bg-gold/5 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{tratamento(c.alunos?.ficha, c.alunos?.nome)}</span>
                        <span className="ml-auto font-mono text-[10px] text-dim/70">{fmtDia(c.created_at)}</span>
                      </div>
                      <div className="text-xs text-cream/90 mt-1 leading-relaxed">“{txt(c.respostas?.precisa_semana)}”</div>
                    </div>
                  ))}
                </div>
              )}
            {pedidosDiag.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-dim uppercase tracking-widest pt-1">🗣 Pedidos do diagnóstico (últimos 7 dias)</div>
                {pedidosDiag.map(d => (
                  <div key={d.aluno_id + (d.concluido_em ?? '')} className="border border-line bg-panel/40 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{tratamento(d.alunos?.ficha, d.alunos?.nome)}</span>
                      <span className="ml-auto font-mono text-[10px] text-dim/70">{d.concluido_em ? fmtDia(d.concluido_em) : ''}</span>
                    </div>
                    <div className="text-xs text-cream/90 mt-1 leading-relaxed">“{txt(d.respostas?.ajuda_professor)}”</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── 5 · Vitórias ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg">🏆 Vitórias e registros da semana
          <span className="ml-2 text-[11px] font-mono text-win">{vitorias.length}</span>
        </h2>
        {vitorias.length === 0 ? (
          <div className="border border-line bg-panel/40 rounded-xl p-5 text-sm text-dim">Nenhuma vitória registrada ainda nesta semana — os check-ins chegam no fim de semana. ⏳</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {vitorias.map((v, i) => (
              <div key={v.c.aluno_id + v.tipo + i}
                className={`rounded-xl px-4 py-3 border ${v.tipo === 'vitoria' ? 'border-win/25 bg-win/5' : 'border-teal/25 bg-teal/5'}`}>
                <div className="text-xs leading-relaxed text-cream/90">
                  {v.tipo === 'vitoria' ? '🏆' : '✨'} “{v.texto}”
                </div>
                <div className="mt-2 text-[11px] font-medium text-dim">
                  — {tratamento(v.c.alunos?.ficha, v.c.alunos?.nome)}
                  <span className="font-mono text-[10px] text-dim/60 ml-2">{fmtDia(v.c.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 6 · Ranking de pontos ─────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-lg">⭐ Ranking de pontos
          <span className="ml-2 text-[11px] font-mono text-dim">top 10 · {pontosTotal.toLocaleString('pt-BR')} pts na base</span>
        </h2>
        {ranking.length === 0 ? (
          <div className="border border-line bg-panel/40 rounded-xl p-5 text-sm text-dim">Ninguém pontuou ainda.</div>
        ) : (
          <div className="border border-line rounded-xl overflow-hidden bg-panel/40">
            {ranking.map((p, i) => (
              <div key={p.aluno_id} className="flex items-center gap-3 border-t border-line/50 px-4 py-2.5 text-sm first:border-t-0">
                <span className="w-8 shrink-0 text-center">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="font-mono text-xs text-dim">{i + 1}º</span>}
                </span>
                <span className="font-medium truncate min-w-0 w-48 shrink-0">{p.nome || '—'}</span>
                <div className="flex-1 h-1.5 bg-panel2 rounded-full overflow-hidden hidden sm:block">
                  <div className="h-full bg-gold/60 rounded-full transition-all duration-700"
                    style={{ width: `${Math.max((p.pontos / maxPontos) * 100, 2)}%` }} />
                </div>
                <span className="font-mono text-[10px] text-dim shrink-0">{p.eventos} evento{p.eventos === 1 ? '' : 's'}</span>
                <span className="font-mono text-sm font-bold text-gold w-16 text-right shrink-0">{p.pontos}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="text-[11px] text-dim/60 pb-4">Dados ao vivo do banco da Diana · atualiza a cada 60s</div>
    </div>
  )
}
