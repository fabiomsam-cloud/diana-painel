import { useEffect, useState } from 'react'
import { supabase, fmtHora, fmtFone } from '../lib/supabase'

type Proposta = {
  id: string; aluno_id: string; mentoria_id: string | null; concurso: string | null
  meta_90_dias: string | null; horas_semana: number | null; motivo: string | null
  origem: string | null; created_at: string
  alunos: { nome: string | null; phone: string | null } | null
  mentorias: { nome: string } | null
}
type Mentoria = { id: string; slug: string; nome: string }
type Diagnostico = {
  id: string; aluno_id: string | null; respostas: Record<string, any> | null
  needs_review: boolean; whatsapp_informado: string | null; concluido_em: string | null
  alunos: { id: string; nome: string | null; phone: string | null; situacao: string | null } | null
}
type StatusRotaAluno = 'sem' | 'proposta' | 'ativa'

const inp = 'w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold/60 placeholder:text-dim/40'

// Labels legíveis das respostas do diagnóstico (na ordem de exibição)
const LABELS_DIAG: [string, string][] = [
  ['nome_completo', 'Nome completo'],
  ['como_chamar', 'Como quer ser chamado(a)'],
  ['concurso_prioridade', 'Concurso prioridade'],
  ['motivo_aprovacao', 'Por que quer a aprovação'],
  ['tempo_estudo', 'Há quanto tempo estuda'],
  ['momento_atual', 'Momento atual'],
  ['ja_aprovado', 'Já foi aprovado(a) antes'],
  ['horas_dia', 'Horas de estudo por dia'],
  ['dias_semana', 'Dias de estudo por semana'],
  ['obstaculo', 'Maior obstáculo'],
  ['tem_plano', 'Tem plano de estudos'],
  ['dificuldade', 'Maior dificuldade'],
  ['disciplina_preocupa', 'Disciplina que mais preocupa'],
  ['questoes_revisoes', 'Questões e revisões'],
  ['motivacao_0a10', 'Motivação (0–10)'],
  ['quando_nao_estuda', 'Quando não estuda…'],
  ['o_que_ajuda', 'O que mais ajudaria'],
  ['estilo_acompanhamento', 'Estilo de acompanhamento'],
  ['ajuda_professor', 'Ajuda de professor'],
  ['luta_pessoal', 'Luta pessoal'],
]

const str = (v: any) => v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))
const num = (v: any): number | null => {
  const m = str(v).replace(',', '.').match(/\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

function BolinhaMotivacao({ valor }: { valor: any }) {
  const n = num(valor)
  if (n == null) return null
  const cls = n <= 4 ? 'bg-danger' : n <= 7 ? 'bg-gold' : 'bg-win'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls}`} />
      motivação <b>{str(valor)}</b>
    </span>
  )
}

function RespostasDiag({ respostas }: { respostas: Record<string, any> | null }) {
  const r = respostas ?? {}
  const conhecidas = LABELS_DIAG.filter(([k]) => r[k] != null && str(r[k]).trim() !== '')
  const extras = Object.keys(r).filter(k =>
    !LABELS_DIAG.some(([lk]) => lk === k) && r[k] != null && str(r[k]).trim() !== '')
  if (!conhecidas.length && !extras.length)
    return <div className="text-xs text-dim">Sem respostas registradas.</div>
  return (
    <div className="border border-line bg-panel2/40 rounded-xl p-3 space-y-1.5">
      {conhecidas.map(([k, label]) => (
        <div key={k} className="flex gap-2 text-xs">
          <span className="text-dim shrink-0 w-44 md:w-52">{label}:</span>
          <span className="text-cream break-words leading-relaxed">{str(r[k])}</span>
        </div>
      ))}
      {extras.map(k => (
        <div key={k} className="flex gap-2 text-xs">
          <span className="text-dim font-mono shrink-0 w-44 md:w-52">{k}:</span>
          <span className="text-cream break-words leading-relaxed">{str(r[k])}</span>
        </div>
      ))}
    </div>
  )
}

export default function Propostas() {
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [mentorias, setMentorias] = useState<Mentoria[]>([])
  const [agindo, setAgindo] = useState<string | null>(null)
  const [ajustando, setAjustando] = useState<string | null>(null)
  const [form, setForm] = useState({ mentoria_id: '', concurso: '', meta: '', horas: '10', motivo: '' })
  const [msg, setMsg] = useState('')

  // Diagnósticos concluídos
  const [diags, setDiags] = useState<Diagnostico[]>([])
  const [diagsReview, setDiagsReview] = useState<Diagnostico[]>([])
  const [statusRota, setStatusRota] = useState<Record<string, StatusRotaAluno>>({})
  const [filtro, setFiltro] = useState<'todos' | StatusRotaAluno>('todos')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [propondoDiag, setPropondoDiag] = useState<string | null>(null)
  const [diagForm, setDiagForm] = useState({ mentoria_id: '', concurso: '', meta: '', horas: '10', motivo: '' })
  const [salvandoDiag, setSalvandoDiag] = useState(false)

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 7000) }

  const carregar = async () => {
    const [{ data }, { data: ms }, { data: dg }, { data: dr }] = await Promise.all([
      supabase.from('rotas')
        .select('id,aluno_id,mentoria_id,concurso,meta_90_dias,horas_semana,motivo,origem,created_at,alunos(nome,phone),mentorias(nome)')
        .eq('status', 'proposta').order('created_at', { ascending: true }),
      supabase.from('mentorias').select('id,slug,nome').order('nome'),
      supabase.from('diagnosticos')
        .select('id,aluno_id,respostas,needs_review,whatsapp_informado,concluido_em,alunos(id,nome,phone,situacao)')
        .eq('needs_review', false).order('concluido_em', { ascending: false }),
      supabase.from('diagnosticos')
        .select('id,aluno_id,respostas,needs_review,whatsapp_informado,concluido_em,alunos(id,nome,phone,situacao)')
        .eq('needs_review', true).order('concluido_em', { ascending: false }),
    ])
    setPropostas((data as any) ?? [])
    setMentorias((ms as any) ?? [])
    const listaDiag = ((dg as any) as Diagnostico[]) ?? []
    setDiags(listaDiag)
    setDiagsReview(((dr as any) as Diagnostico[]) ?? [])

    // status de rota por aluno (resolvido client-side)
    const ids = [...new Set(listaDiag.map(d => d.aluno_id).filter(Boolean))] as string[]
    if (!ids.length) { setStatusRota({}); return }
    const { data: rts } = await supabase.from('rotas')
      .select('aluno_id,status').in('aluno_id', ids).in('status', ['proposta', 'ativa'])
    const st: Record<string, StatusRotaAluno> = {}
    for (const r of (((rts as any) ?? []) as { aluno_id: string; status: string }[])) {
      if (r.status === 'ativa') st[r.aluno_id] = 'ativa'
      else if (st[r.aluno_id] !== 'ativa') st[r.aluno_id] = 'proposta'
    }
    setStatusRota(st)
  }

  useEffect(() => {
    carregar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar() }, 45000)
    return () => clearInterval(t)
  }, [])

  const emailLogado = async () => {
    const { data: u } = await supabase.auth.getUser()
    return u.user?.email ?? 'painel'
  }

  const aprovar = async (p: Proposta) => {
    setAgindo(p.id)
    const { error } = await supabase.rpc('fn_rota_aprovar', { p_rota: p.id, p_por: await emailLogado() })
    setAgindo(null)
    if (error) return flash('⚠️ Erro ao aprovar: ' + error.message)
    flash(`✅ Rota de ${p.alunos?.nome ?? 'aluno'} aprovada — vira a rota ativa.`)
    carregar()
  }

  const rejeitar = async (p: Proposta) => {
    if (!window.confirm(`Rejeitar a proposta de rota (${p.concurso || 'sem concurso'}) de ${p.alunos?.nome ?? 'aluno'}?`)) return
    setAgindo(p.id)
    const { error } = await supabase.rpc('fn_rota_rejeitar', { p_rota: p.id, p_por: await emailLogado() })
    setAgindo(null)
    if (error) return flash('⚠️ Erro ao rejeitar: ' + error.message)
    flash('Proposta rejeitada.')
    carregar()
  }

  const abrirAjuste = (p: Proposta) => {
    setAjustando(p.id)
    setForm({
      mentoria_id: p.mentoria_id ?? '',
      concurso: p.concurso ?? '',
      meta: p.meta_90_dias ?? '',
      horas: String(p.horas_semana ?? 10),
      motivo: p.motivo ?? '',
    })
  }

  const salvarAjuste = async (p: Proposta) => {
    if (!form.mentoria_id) return flash('⚠️ Escolha a mentoria antes de aprovar o ajuste.')
    setAgindo(p.id)
    const { error } = await supabase.from('rotas').update({
      mentoria_id: form.mentoria_id,
      concurso: form.concurso.trim() || null,
      meta_90_dias: form.meta.trim() || null,
      horas_semana: Number(form.horas) || 0,
      motivo: form.motivo.trim() || null,
    }).eq('id', p.id)
    if (error) { setAgindo(null); return flash('⚠️ Erro ao ajustar: ' + error.message) }
    const { error: e2 } = await supabase.rpc('fn_rota_aprovar', { p_rota: p.id, p_por: await emailLogado() })
    setAgindo(null)
    if (e2) return flash('Rota ajustada, mas a aprovação falhou: ' + e2.message)
    setAjustando(null)
    flash('✅ Rota ajustada e aprovada.')
    carregar()
  }

  // ── Diagnósticos concluídos ──────────────────────────────────────────────

  const horasEstimadas = (d: Diagnostico): number | null => {
    const hd = num(d.respostas?.horas_dia)
    const ds = num(d.respostas?.dias_semana)
    if (hd == null || ds == null) return null
    return Math.round(hd * ds * 2) / 2
  }

  const abrirProporDiag = (d: Diagnostico) => {
    const hs = horasEstimadas(d)
    const elite = mentorias.find(m => m.slug === 'elite_diamante')
    setPropondoDiag(d.id)
    setExpandido(d.id)
    setDiagForm({
      mentoria_id: elite?.id ?? '',
      concurso: str(d.respostas?.concurso_prioridade),
      meta: `Concluir o PASSO 01 + cumprir o plano de ${hs != null ? hs : 'X'} horas/semana configurado na plataforma`,
      horas: String(hs ?? 10),
      motivo: 'Proposta da equipe a partir do diagnóstico',
    })
  }

  const proporRotaDiag = async (e: React.FormEvent, d: Diagnostico) => {
    e.preventDefault()
    if (!d.aluno_id || !diagForm.concurso.trim()) return
    setSalvandoDiag(true)
    const { error } = await supabase.rpc('fn_rota_propor', {
      p_aluno: d.aluno_id,
      p_mentoria: diagForm.mentoria_id || null,
      p_concurso: diagForm.concurso.trim(),
      p_meta: diagForm.meta.trim(),
      p_horas: Number(diagForm.horas) || 0,
      p_motivo: diagForm.motivo.trim() || 'Proposta da equipe a partir do diagnóstico',
    })
    setSalvandoDiag(false)
    if (error) return flash('⚠️ Erro ao propor rota: ' + error.message)
    setPropondoDiag(null)
    flash(`✅ Rota proposta para ${d.alunos?.nome ?? 'aluno'} — aparece acima para aprovação.`)
    carregar()
  }

  const stAluno = (d: Diagnostico): StatusRotaAluno =>
    (d.aluno_id && statusRota[d.aluno_id]) || 'sem'

  const diagsFiltrados = filtro === 'todos' ? diags : diags.filter(d => stAluno(d) === filtro)

  const BADGE_ST: Record<StatusRotaAluno, { label: string; cls: string }> = {
    sem: { label: 'sem rota', cls: 'text-dim border-line bg-panel2' },
    proposta: { label: '⏳ proposta pendente', cls: 'text-gold border-gold/40 bg-gold/10' },
    ativa: { label: '🎯 rota ativa', cls: 'text-win border-win/40 bg-win/10' },
  }

  const CHIPS: { key: 'todos' | StatusRotaAluno; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'sem', label: 'Sem rota' },
    { key: 'proposta', label: 'Com proposta' },
    { key: 'ativa', label: 'Com rota ativa' },
  ]

  const CardDiag = ({ d }: { d: Diagnostico }) => {
    const r = d.respostas ?? {}
    const st = stAluno(d)
    const aberto = expandido === d.id
    const hs = horasEstimadas(d)
    const nome = str(r.como_chamar).trim() || d.alunos?.nome || str(r.nome_completo).trim() || 'Aluno'
    return (
      <div className="rise border border-line bg-panel/50 rounded-xl">
        <div className="p-4 space-y-2 cursor-pointer hover:bg-panel2/30 transition-colors rounded-xl"
          onClick={() => { setExpandido(aberto ? null : d.id); if (aberto) setPropondoDiag(null) }}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0">
              <div className="font-display font-semibold truncate">
                {nome}
                {d.alunos?.nome && str(r.como_chamar).trim() && d.alunos.nome !== str(r.como_chamar).trim() &&
                  <span className="font-normal text-xs text-dim ml-2">({d.alunos.nome})</span>}
              </div>
              <div className="font-mono text-[11px] text-dim">{fmtFone(d.alunos?.phone || d.whatsapp_informado)}</div>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${BADGE_ST[st].cls}`}>{BADGE_ST[st].label}</span>
            {str(r.luta_pessoal).trim() &&
              <span title="O aluno compartilhou uma luta pessoal no diagnóstico"
                className="text-[10px] px-2 py-0.5 rounded-full border border-gold/30 bg-gold/5 text-gold/90">💛 relato pessoal</span>}
            <span className="ml-auto font-mono text-[10px] text-dim/70">✔ {fmtHora(d.concluido_em)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dim">
            {str(r.concurso_prioridade).trim() && <span>🎯 <span className="text-cream">{str(r.concurso_prioridade)}</span></span>}
            {(str(r.horas_dia).trim() || str(r.dias_semana).trim()) &&
              <span>⏱ {str(r.horas_dia) || '—'}h/dia · {str(r.dias_semana) || '—'} dias/sem{hs != null && <span className="text-dim/70"> (~{hs}h/sem)</span>}</span>}
            {str(r.momento_atual).trim() && <span className="max-w-xs truncate">📍 {str(r.momento_atual)}</span>}
            <BolinhaMotivacao valor={r.motivacao_0a10} />
            {str(r.estilo_acompanhamento).trim() && <span className="max-w-xs truncate">🤝 {str(r.estilo_acompanhamento)}</span>}
            <span className="ml-auto text-dim/50">{aberto ? '▲ recolher' : '▼ ver respostas'}</span>
          </div>
        </div>

        {aberto && (
          <div className="px-4 pb-4 space-y-3" onClick={e => e.stopPropagation()}>
            <RespostasDiag respostas={d.respostas} />

            {st === 'sem' && d.aluno_id && (
              propondoDiag === d.id ? (
                <form onSubmit={e => proporRotaDiag(e, d)} className="border border-gold/25 bg-gold/5 rounded-xl p-3 space-y-2">
                  <div className="text-xs text-gold font-mono uppercase tracking-widest">Propor rota</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <label className="block text-xs text-dim">Mentoria
                      <select value={diagForm.mentoria_id} onChange={e => setDiagForm({ ...diagForm, mentoria_id: e.target.value })}
                        className={inp + ' mt-1'}>
                        <option value="">A definir</option>
                        {mentorias.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs text-dim">Concurso
                      <input required value={diagForm.concurso} onChange={e => setDiagForm({ ...diagForm, concurso: e.target.value })}
                        placeholder="ex.: PRF" className={inp + ' mt-1'} />
                    </label>
                    <label className="block text-xs text-dim sm:col-span-2">Meta de 90 dias
                      <input value={diagForm.meta} onChange={e => setDiagForm({ ...diagForm, meta: e.target.value })} className={inp + ' mt-1'} />
                    </label>
                    <label className="block text-xs text-dim">Horas/semana
                      <input type="number" min="0" step="0.5" value={diagForm.horas}
                        onChange={e => setDiagForm({ ...diagForm, horas: e.target.value })} className={inp + ' mt-1'} />
                    </label>
                    <label className="block text-xs text-dim">Motivo
                      <input value={diagForm.motivo} onChange={e => setDiagForm({ ...diagForm, motivo: e.target.value })} className={inp + ' mt-1'} />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button disabled={salvandoDiag || !diagForm.concurso.trim()}
                      className="flex-1 bg-gold text-ink font-semibold rounded-lg py-2 text-sm hover:brightness-110 transition disabled:opacity-40">
                      {salvandoDiag ? 'Propondo…' : 'Propor rota →'}
                    </button>
                    <button type="button" onClick={() => setPropondoDiag(null)}
                      className="text-xs text-dim border border-line rounded-lg px-4 hover:text-cream transition">Cancelar</button>
                  </div>
                </form>
              ) : (
                <button onClick={() => abrirProporDiag(d)}
                  className="text-sm font-semibold bg-gold/15 text-gold border border-gold/40 rounded-lg px-4 py-2 hover:bg-gold/25 transition">
                  ➕ Propor rota
                </button>
              )
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="font-display font-bold text-2xl">Propostas de rota</h1>
        <p className="text-sm text-dim mt-1">
          Rotas que a Diana (ou a equipe) propôs e aguardam o seu OK. Aprovar torna a rota <b className="text-win">ativa</b> para o aluno.
        </p>
      </div>

      {msg && <div className="rise border border-win/40 bg-win/10 text-win text-sm rounded-xl px-4 py-3">{msg}</div>}

      {propostas.length === 0 && (
        <div className="border border-line bg-panel/40 rounded-xl p-8 text-center text-dim">
          <div className="text-3xl mb-2">🤖</div>
          <div className="text-sm">Nenhuma proposta pendente.</div>
        </div>
      )}

      {propostas.map(p => (
        <div key={p.id} className="rise border border-gold/25 bg-panel/50 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <div className="font-display font-semibold">{p.alunos?.nome || fmtFone(p.alunos?.phone) || 'Aluno'}</div>
              <div className="font-mono text-[11px] text-dim">{fmtFone(p.alunos?.phone)}</div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-line text-dim">
              {p.origem === 'ia' ? '🤖 proposta da Diana' : '👤 proposta humana'}
            </span>
            <span className="ml-auto font-mono text-[10px] text-dim/70">{fmtHora(p.created_at)}</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <div className="border border-line bg-panel2/40 rounded-lg px-3 py-2">
              <div className="text-[10px] font-mono text-dim uppercase tracking-widest">Concurso</div>
              <div className="mt-0.5">🎯 {p.concurso || '—'}</div>
            </div>
            <div className="border border-line bg-panel2/40 rounded-lg px-3 py-2">
              <div className="text-[10px] font-mono text-dim uppercase tracking-widest">Mentoria</div>
              <div className="mt-0.5">{p.mentorias?.nome ?? <span className="text-gold">A DEFINIR</span>}</div>
            </div>
            <div className="border border-line bg-panel2/40 rounded-lg px-3 py-2 sm:col-span-2">
              <div className="text-[10px] font-mono text-dim uppercase tracking-widest">Meta de 90 dias</div>
              <div className="mt-0.5">{p.meta_90_dias || '—'}</div>
            </div>
            <div className="border border-line bg-panel2/40 rounded-lg px-3 py-2">
              <div className="text-[10px] font-mono text-dim uppercase tracking-widest">Horas/semana</div>
              <div className="mt-0.5">⏱ {p.horas_semana ?? '—'}</div>
            </div>
            <div className="border border-line bg-panel2/40 rounded-lg px-3 py-2">
              <div className="text-[10px] font-mono text-dim uppercase tracking-widest">Motivo</div>
              <div className="mt-0.5 text-xs text-dim leading-relaxed">{p.motivo || '—'}</div>
            </div>
          </div>

          {ajustando === p.id ? (
            <div className="border border-teal/25 bg-teal/5 rounded-xl p-3 space-y-2">
              <div className="text-xs text-teal font-mono uppercase tracking-widest">Ajustar e aprovar</div>
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="block text-xs text-dim">Mentoria
                  <select value={form.mentoria_id} onChange={e => setForm({ ...form, mentoria_id: e.target.value })}
                    className={inp + ' mt-1'}>
                    <option value="">Escolha…</option>
                    {mentorias.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-dim">Concurso
                  <input value={form.concurso} onChange={e => setForm({ ...form, concurso: e.target.value })} className={inp + ' mt-1'} />
                </label>
                <label className="block text-xs text-dim sm:col-span-2">Meta de 90 dias
                  <input value={form.meta} onChange={e => setForm({ ...form, meta: e.target.value })} className={inp + ' mt-1'} />
                </label>
                <label className="block text-xs text-dim">Horas/semana
                  <input type="number" min="0" step="0.5" value={form.horas}
                    onChange={e => setForm({ ...form, horas: e.target.value })} className={inp + ' mt-1'} />
                </label>
                <label className="block text-xs text-dim">Motivo
                  <input value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} className={inp + ' mt-1'} />
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={() => salvarAjuste(p)} disabled={agindo === p.id}
                  className="flex-1 bg-win/15 text-win border border-win/40 font-semibold rounded-lg py-2 text-sm hover:bg-win/25 transition disabled:opacity-40">
                  {agindo === p.id ? '…' : '✓ Salvar ajuste e aprovar'}
                </button>
                <button onClick={() => setAjustando(null)}
                  className="text-xs text-dim border border-line rounded-lg px-4 hover:text-cream transition">Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {p.mentoria_id ? (
                <button onClick={() => aprovar(p)} disabled={agindo === p.id}
                  className="text-sm font-semibold bg-win/15 text-win border border-win/40 rounded-lg px-4 py-2 hover:bg-win/25 transition disabled:opacity-40">
                  {agindo === p.id ? '…' : '✓ Aprovar'}
                </button>
              ) : (
                <span className="text-xs text-gold border border-gold/40 bg-gold/10 rounded-lg px-3 py-2">
                  ⚠️ Mentoria <b>A DEFINIR</b> — ajuste antes de aprovar.
                </span>
              )}
              <button onClick={() => abrirAjuste(p)}
                className="text-sm font-semibold bg-teal/15 text-teal border border-teal/40 rounded-lg px-4 py-2 hover:bg-teal/25 transition">
                ✎ Ajustar
              </button>
              <button onClick={() => rejeitar(p)} disabled={agindo === p.id}
                className="text-sm text-danger/80 border border-danger/30 rounded-lg px-4 py-2 hover:bg-danger/10 hover:text-danger transition disabled:opacity-40">
                ✕ Rejeitar
              </button>
            </div>
          )}
        </div>
      ))}

      {/* ── Diagnósticos concluídos ─────────────────────────────────────── */}
      <div className="pt-4 border-t border-line/60">
        <h2 className="font-display font-bold text-xl">
          🧾 Diagnósticos concluídos
          <span className="ml-2 text-sm font-normal text-dim font-mono">({diags.length})</span>
        </h2>
        <p className="text-sm text-dim mt-1">
          Todos os alunos que completaram o diagnóstico enviado pela Diana. Clique no card para ver as respostas.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {CHIPS.map(c => (
            <button key={c.key} onClick={() => setFiltro(c.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                filtro === c.key
                  ? 'text-gold border-gold/50 bg-gold/10 font-semibold'
                  : 'text-dim border-line hover:text-cream'
              }`}>
              {c.label}
              <span className="ml-1.5 font-mono text-[10px] opacity-70">
                {c.key === 'todos' ? diags.length : diags.filter(d => stAluno(d) === c.key).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {diagsFiltrados.length === 0 && (
        <div className="border border-line bg-panel/40 rounded-xl p-8 text-center text-dim">
          <div className="text-3xl mb-2">🧾</div>
          <div className="text-sm">
            {diags.length === 0 ? 'Nenhum diagnóstico concluído ainda.' : 'Nenhum diagnóstico nesse filtro.'}
          </div>
        </div>
      )}

      {diagsFiltrados.map(d => <CardDiag key={d.id} d={d} />)}

      {/* ── Sem match de aluno ──────────────────────────────────────────── */}
      {diagsReview.length > 0 && (
        <>
          <div className="pt-4 border-t border-line/60">
            <h2 className="font-display font-bold text-lg text-gold">
              ⚠️ Sem match de aluno (revisar)
              <span className="ml-2 text-sm font-normal text-dim font-mono">({diagsReview.length})</span>
            </h2>
            <p className="text-sm text-dim mt-1">
              Diagnósticos concluídos cujo WhatsApp informado não bateu com nenhum aluno da base.
            </p>
          </div>
          {diagsReview.map(d => {
            const r = d.respostas ?? {}
            const aberto = expandido === d.id
            const nome = str(r.como_chamar).trim() || str(r.nome_completo).trim() || d.alunos?.nome || 'Sem identificação'
            return (
              <div key={d.id} className="rise border border-gold/25 bg-gold/5 rounded-xl">
                <div className="p-4 cursor-pointer hover:bg-gold/10 transition-colors rounded-xl"
                  onClick={() => setExpandido(aberto ? null : d.id)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0">
                      <div className="font-display font-semibold truncate">{nome}</div>
                      <div className="font-mono text-[11px] text-dim">
                        WhatsApp informado: <span className="text-gold">{fmtFone(d.whatsapp_informado) || '—'}</span>
                      </div>
                    </div>
                    <span className="ml-auto font-mono text-[10px] text-dim/70">✔ {fmtHora(d.concluido_em)}</span>
                    <span className="text-dim/50 text-xs">{aberto ? '▲' : '▼'}</span>
                  </div>
                </div>
                {aberto && (
                  <div className="px-4 pb-4" onClick={e => e.stopPropagation()}>
                    <RespostasDiag respostas={d.respostas} />
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
