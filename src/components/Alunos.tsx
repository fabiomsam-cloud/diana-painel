import { useEffect, useRef, useState } from 'react'
import { supabase, fmtHora, fmtData, fmtFone, COR_INDICE, STATUS_ROTA } from '../lib/supabase'

type Aluno = {
  id: string; phone: string | null; nome: string | null; email: string | null
  ficha: any; opted_out: boolean; status: string; created_at: string
}
type Mentoria = { id: string; slug: string; nome: string; ativa: boolean }
type Rota = {
  id: string; aluno_id: string; mentoria_id: string | null; concurso: string | null
  status: string; meta_90_dias: string | null; horas_semana: number | null
  motivo: string | null; origem: string | null; aprovada_por: string | null; aprovada_em: string | null
}
type Matricula = {
  id: string; aluno_id: string; mentoria_id: string; status: string; origem: string | null
  primeira_compra: string | null; ultima_compra: string | null; total_pago: number | null
  mentorias: { nome: string } | null
}
type Checkin = {
  id: string; semana: string; horas_planejadas: number | null; horas_cumpridas: number | null
  dificuldades: string | null; nota_moral: number | null; created_at: string
}
type Interacao = { id: string; tipo: string; descricao: string | null; autor: string | null; created_at: string }

const inp = 'w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold/60 placeholder:text-dim/40'

export default function Alunos() {
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [indices, setIndices] = useState<Record<string, { cor: string; score: number }>>({})
  const [rotasAtivas, setRotasAtivas] = useState<Record<string, Rota>>({})
  const [mats, setMats] = useState<Record<string, Matricula[]>>({})
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)

  // drawer
  const [sel, setSel] = useState<Aluno | null>(null)
  const [selRotas, setSelRotas] = useState<Rota[]>([])
  const [selMats, setSelMats] = useState<Matricula[]>([])
  const [selCheckins, setSelCheckins] = useState<Checkin[]>([])
  const [selInteracoes, setSelInteracoes] = useState<Interacao[]>([])
  const [mentorias, setMentorias] = useState<Mentoria[]>([])
  const [contato, setContato] = useState({ tipo: 'ligacao', descricao: '' })
  const [salvandoContato, setSalvandoContato] = useState(false)
  const [propondo, setPropondo] = useState(false)
  const [rotaForm, setRotaForm] = useState({ mentoria_id: '', concurso: '', meta: '', horas: '10', motivo: '' })
  const [salvandoRota, setSalvandoRota] = useState(false)
  const [msg, setMsg] = useState('')

  const buscaRef = useRef('')
  buscaRef.current = busca

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 6000) }

  const carregar = async () => {
    setCarregando(true)
    const q = buscaRef.current.trim()
    let query = supabase.from('alunos')
      .select('id,phone,nome,email,ficha,opted_out,status,created_at')
      .order('nome', { ascending: true, nullsFirst: false })
      .limit(200)
    if (q) {
      // busca NO BANCO: nome, e-mail e telefone
      const digits = q.replace(/\D/g, '')
      const ors = [`nome.ilike.%${q}%`, `email.ilike.%${q}%`]
      if (digits.length >= 4) ors.push(`phone.ilike.%${digits}%`, `phone_norm.ilike.%${digits}%`)
      query = query.or(ors.join(','))
    }
    const { data } = await query
    const lista = (data as any as Aluno[]) ?? []
    setAlunos(lista)
    setCarregando(false)

    const ids = lista.map(a => a.id)
    if (!ids.length) { setIndices({}); setRotasAtivas({}); setMats({}); return }
    const [idx, rts, ms] = await Promise.all([
      supabase.from('indice_aluno').select('aluno_id,score,cor').in('aluno_id', ids),
      supabase.from('rotas').select('id,aluno_id,mentoria_id,concurso,status,meta_90_dias,horas_semana,motivo,origem,aprovada_por,aprovada_em')
        .in('aluno_id', ids).eq('status', 'ativa'),
      supabase.from('matriculas').select('id,aluno_id,mentoria_id,status,origem,primeira_compra,ultima_compra,total_pago,mentorias(nome)')
        .in('aluno_id', ids),
    ])
    const mi: Record<string, { cor: string; score: number }> = {}
    for (const r of ((idx.data as any) ?? [])) mi[r.aluno_id] = { cor: r.cor, score: r.score }
    setIndices(mi)
    const mr: Record<string, Rota> = {}
    for (const r of ((rts.data as any) ?? [])) mr[r.aluno_id] = r
    setRotasAtivas(mr)
    const mm: Record<string, Matricula[]> = {}
    for (const m of ((ms.data as any) ?? [])) (mm[m.aluno_id] = mm[m.aluno_id] ?? []).push(m)
    setMats(mm)
  }

  useEffect(() => { carregar() }, [])
  useEffect(() => {
    const t = setTimeout(carregar, 350)
    return () => clearTimeout(t)
  }, [busca])

  const abrir = async (a: Aluno) => {
    setSel(a); setPropondo(false)
    setContato({ tipo: 'ligacao', descricao: '' })
    const [rts, ms, cks, its] = await Promise.all([
      supabase.from('rotas').select('id,aluno_id,mentoria_id,concurso,status,meta_90_dias,horas_semana,motivo,origem,aprovada_por,aprovada_em')
        .eq('aluno_id', a.id).order('created_at', { ascending: false }),
      supabase.from('matriculas').select('id,aluno_id,mentoria_id,status,origem,primeira_compra,ultima_compra,total_pago,mentorias(nome)')
        .eq('aluno_id', a.id).order('primeira_compra', { ascending: false }),
      supabase.from('checkins').select('id,semana,horas_planejadas,horas_cumpridas,dificuldades,nota_moral,created_at')
        .eq('aluno_id', a.id).order('semana', { ascending: false }).limit(8),
      supabase.from('interacoes').select('id,tipo,descricao,autor,created_at')
        .eq('aluno_id', a.id).order('created_at', { ascending: false }).limit(30),
    ])
    setSelRotas((rts.data as any) ?? [])
    setSelMats((ms.data as any) ?? [])
    setSelCheckins((cks.data as any) ?? [])
    setSelInteracoes((its.data as any) ?? [])
    if (!mentorias.length) {
      const { data } = await supabase.from('mentorias').select('id,slug,nome,ativa').order('nome')
      setMentorias(((data as any) ?? []))
    }
  }

  const registrarContato = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sel || !contato.descricao.trim()) return
    setSalvandoContato(true)
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.rpc('fn_interacao_registrar', {
      p_aluno: sel.id, p_tipo: contato.tipo,
      p_desc: contato.descricao.trim(), p_autor: u.user?.email ?? 'painel',
    })
    setSalvandoContato(false)
    if (error) return flash('⚠️ Erro ao registrar: ' + error.message)
    setContato({ ...contato, descricao: '' })
    flash('✅ Contato registrado.')
    abrir(sel)
  }

  const proporRota = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sel || !rotaForm.concurso.trim()) return
    setSalvandoRota(true)
    const { error } = await supabase.rpc('fn_rota_propor', {
      p_aluno: sel.id,
      p_mentoria: rotaForm.mentoria_id || null,
      p_concurso: rotaForm.concurso.trim(),
      p_meta: rotaForm.meta.trim(),
      p_horas: Number(rotaForm.horas) || 0,
      p_motivo: rotaForm.motivo.trim() || 'Proposta manual pelo painel',
    })
    setSalvandoRota(false)
    if (error) return flash('⚠️ Erro ao propor rota: ' + error.message)
    setPropondo(false)
    setRotaForm({ mentoria_id: '', concurso: '', meta: '', horas: '10', motivo: '' })
    flash('✅ Rota proposta — aparece na aba 🤖 Propostas para aprovação.')
    abrir(sel)
  }

  const Bolinha = ({ id }: { id: string }) => {
    const cor = indices[id]?.cor ?? 'cinza'
    const meta = COR_INDICE[cor] ?? COR_INDICE.cinza
    return <span title={`${meta.label}${indices[id] ? ` · score ${indices[id].score}` : ''}`}
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 md:p-6 pb-3 shrink-0">
        <h1 className="font-display font-bold text-2xl">Alunos</h1>
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, e-mail ou telefone (busca no banco)…"
          className={inp + ' mt-3 max-w-xl'} />
      </div>

      {msg && <div className="mx-4 md:mx-6 mb-2 rise border border-win/40 bg-win/10 text-win text-sm rounded-xl px-4 py-3">{msg}</div>}

      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6">
        <div className="border border-line rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel text-left text-[10px] font-mono text-dim uppercase tracking-widest">
                <th className="px-4 py-2.5"> </th>
                <th className="px-2 py-2.5">Nome</th>
                <th className="px-2 py-2.5 hidden md:table-cell">Telefone</th>
                <th className="px-2 py-2.5 hidden lg:table-cell">E-mail</th>
                <th className="px-2 py-2.5">Rota ativa</th>
                <th className="px-2 py-2.5 hidden md:table-cell">Matrícula</th>
              </tr>
            </thead>
            <tbody>
              {alunos.map(a => (
                <tr key={a.id} onClick={() => abrir(a)}
                  className="border-t border-line/50 hover:bg-panel2/50 cursor-pointer transition-colors">
                  <td className="px-4 py-2.5"><Bolinha id={a.id} /></td>
                  <td className="px-2 py-2.5">
                    <span className="font-medium">{a.nome || '—'}</span>
                    {a.status === 'cancelado' && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border border-danger/40 text-danger bg-danger/10">cancelado</span>}
                    {a.opted_out && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border border-line text-dim">opt-out</span>}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-xs text-dim hidden md:table-cell">{fmtFone(a.phone)}</td>
                  <td className="px-2 py-2.5 font-mono text-xs text-dim hidden lg:table-cell truncate max-w-48">{a.email || '—'}</td>
                  <td className="px-2 py-2.5 text-xs">
                    {rotasAtivas[a.id]
                      ? <span className="text-win">🎯 {rotasAtivas[a.id].concurso || 'sem concurso'}</span>
                      : <span className="text-dim">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-dim hidden md:table-cell">
                    {(mats[a.id] ?? []).slice(0, 2).map(m => (
                      <div key={m.id} className="truncate max-w-56">
                        {m.mentorias?.nome ?? '—'}
                        <span className={m.status === 'ativa' ? 'text-win' : 'text-danger'}> · {m.status}</span>
                      </div>
                    ))}
                    {!(mats[a.id]?.length) && '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {carregando && <div className="p-6 text-center text-dim text-sm font-mono">carregando…</div>}
          {!carregando && alunos.length === 0 && <div className="p-6 text-center text-dim text-sm">Nenhum aluno encontrado.</div>}
        </div>
        <div className="text-[11px] text-dim/60 mt-2">Mostrando até 200 alunos — use a busca para achar qualquer um.</div>
      </div>

      {/* Drawer do aluno */}
      {sel && (
        <>
          <div className="fixed inset-0 z-40 bg-ink/60" onClick={() => setSel(null)} />
          <div className="fixed inset-y-0 right-0 z-50 w-[34rem] max-w-[95vw] bg-panel border-l border-line shadow-2xl overflow-y-auto p-5 space-y-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Bolinha id={sel.id} />
                  <h2 className="font-display font-bold text-xl truncate">{sel.nome || 'Sem nome'}</h2>
                </div>
                <div className="font-mono text-xs text-dim mt-1">{fmtFone(sel.phone)} · {sel.email || 'sem e-mail'}</div>
              </div>
              <button onClick={() => setSel(null)} className="ml-auto text-dim hover:text-cream text-xl leading-none">✕</button>
            </div>

            {msg && <div className="rise border border-win/40 bg-win/10 text-win text-xs rounded-lg px-3 py-2">{msg}</div>}

            {/* Ficha */}
            {sel.ficha && Object.keys(sel.ficha).length > 0 && (
              <section>
                <div className="text-[10px] font-mono text-dim uppercase tracking-widest mb-2">Ficha</div>
                <div className="border border-line bg-panel2/40 rounded-xl p-3 space-y-1">
                  {Object.entries(sel.ficha).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="text-dim font-mono shrink-0">{k}:</span>
                      <span className="text-cream break-words">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Matrículas */}
            <section>
              <div className="text-[10px] font-mono text-dim uppercase tracking-widest mb-2">Matrículas</div>
              <div className="space-y-1.5">
                {selMats.map(m => (
                  <div key={m.id} className="border border-line bg-panel2/40 rounded-lg px-3 py-2 text-xs flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{m.mentorias?.nome ?? 'Mentoria'}</span>
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] ${m.status === 'ativa' ? 'text-win border-win/40 bg-win/10' : 'text-danger border-danger/40 bg-danger/10'}`}>{m.status}</span>
                    <span className="ml-auto text-dim font-mono text-[10px]">
                      {m.primeira_compra ? fmtData(m.primeira_compra) : ''}{m.total_pago != null ? ` · R$ ${Number(m.total_pago).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                    </span>
                  </div>
                ))}
                {selMats.length === 0 && <div className="text-xs text-dim">Nenhuma matrícula.</div>}
              </div>
            </section>

            {/* Rotas */}
            <section>
              <div className="flex items-center mb-2">
                <div className="text-[10px] font-mono text-dim uppercase tracking-widest">Rotas</div>
                <button onClick={() => setPropondo(!propondo)}
                  className="ml-auto text-xs font-semibold bg-gold/15 text-gold border border-gold/40 rounded-lg px-3 py-1.5 hover:bg-gold/25 transition">
                  {propondo ? '✕ Cancelar' : '🎯 Propor rota'}
                </button>
              </div>
              {propondo && (
                <form onSubmit={proporRota} className="border border-gold/25 bg-gold/5 rounded-xl p-3 space-y-2 mb-3">
                  <label className="block text-xs text-dim">Mentoria
                    <select value={rotaForm.mentoria_id} onChange={e => setRotaForm({ ...rotaForm, mentoria_id: e.target.value })}
                      className={inp + ' mt-1'}>
                      <option value="">A definir</option>
                      {mentorias.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs text-dim">Concurso
                    <input required value={rotaForm.concurso} onChange={e => setRotaForm({ ...rotaForm, concurso: e.target.value })}
                      placeholder="ex.: PRF" className={inp + ' mt-1'} />
                  </label>
                  <label className="block text-xs text-dim">Meta de 90 dias
                    <input value={rotaForm.meta} onChange={e => setRotaForm({ ...rotaForm, meta: e.target.value })}
                      placeholder="ex.: fechar as 5 disciplinas básicas" className={inp + ' mt-1'} />
                  </label>
                  <div className="flex gap-2">
                    <label className="block text-xs text-dim w-28">Horas/semana
                      <input type="number" min="0" step="0.5" value={rotaForm.horas}
                        onChange={e => setRotaForm({ ...rotaForm, horas: e.target.value })} className={inp + ' mt-1'} />
                    </label>
                    <label className="block text-xs text-dim flex-1">Motivo
                      <input value={rotaForm.motivo} onChange={e => setRotaForm({ ...rotaForm, motivo: e.target.value })}
                        placeholder="por que essa rota" className={inp + ' mt-1'} />
                    </label>
                  </div>
                  <button disabled={salvandoRota}
                    className="w-full bg-gold text-ink font-semibold rounded-lg py-2 text-sm hover:brightness-110 transition disabled:opacity-40">
                    {salvandoRota ? 'Propondo…' : 'Propor rota →'}
                  </button>
                </form>
              )}
              <div className="space-y-1.5">
                {selRotas.map(r => (
                  <div key={r.id} className="border border-line bg-panel2/40 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">🎯 {r.concurso || 'sem concurso'}</span>
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] ${STATUS_ROTA[r.status] ?? 'text-dim border-line'}`}>{r.status}</span>
                      <span className="ml-auto text-dim font-mono text-[10px]">{r.origem === 'ia' ? '🤖 IA' : '👤 humano'}</span>
                    </div>
                    {r.meta_90_dias && <div className="text-dim mt-1">Meta 90d: <span className="text-cream">{r.meta_90_dias}</span></div>}
                    {r.horas_semana != null && <div className="text-dim">Horas/semana: <span className="text-cream">{r.horas_semana}</span></div>}
                  </div>
                ))}
                {selRotas.length === 0 && <div className="text-xs text-dim">Nenhuma rota.</div>}
              </div>
            </section>

            {/* Check-ins */}
            <section>
              <div className="text-[10px] font-mono text-dim uppercase tracking-widest mb-2">Últimos check-ins</div>
              <div className="space-y-1.5">
                {selCheckins.map(c => (
                  <div key={c.id} className="border border-line bg-panel2/40 rounded-lg px-3 py-2 text-xs flex flex-wrap items-center gap-2">
                    <span className="font-mono">{fmtData(c.semana)}</span>
                    <span className="text-dim">
                      {c.horas_cumpridas ?? '—'}h / {c.horas_planejadas ?? '—'}h
                    </span>
                    {c.nota_moral != null && <span className="text-dim">moral <b className={c.nota_moral >= 7 ? 'text-win' : c.nota_moral >= 4 ? 'text-gold' : 'text-danger'}>{c.nota_moral}</b></span>}
                    {c.dificuldades && <span className="text-dim w-full">😓 {c.dificuldades}</span>}
                  </div>
                ))}
                {selCheckins.length === 0 && <div className="text-xs text-dim">Nenhum check-in.</div>}
              </div>
            </section>

            {/* Interações + registrar contato */}
            <section>
              <div className="text-[10px] font-mono text-dim uppercase tracking-widest mb-2">Interações</div>
              <form onSubmit={registrarContato} className="border border-teal/25 bg-teal/5 rounded-xl p-3 space-y-2 mb-3">
                <div className="text-xs text-teal font-mono uppercase tracking-widest">Registrar contato</div>
                <div className="flex gap-2">
                  <select value={contato.tipo} onChange={e => setContato({ ...contato, tipo: e.target.value })}
                    className={inp + ' w-36'}>
                    <option value="ligacao">Ligação</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">E-mail</option>
                    <option value="presencial">Presencial</option>
                    <option value="nota">Nota interna</option>
                  </select>
                  <input value={contato.descricao} onChange={e => setContato({ ...contato, descricao: e.target.value })}
                    placeholder="o que foi conversado…" className={inp + ' flex-1'} />
                  <button disabled={salvandoContato || !contato.descricao.trim()}
                    className="bg-teal/15 text-teal border border-teal/40 font-semibold rounded-lg px-4 text-sm hover:bg-teal/25 transition disabled:opacity-40 shrink-0">
                    {salvandoContato ? '…' : 'Salvar'}
                  </button>
                </div>
              </form>
              <div className="space-y-1.5">
                {selInteracoes.map(i => (
                  <div key={i.id} className="border border-line bg-panel2/40 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded border border-line text-dim text-[10px]">{i.tipo}</span>
                      <span className="ml-auto font-mono text-[10px] text-dim/70">{i.autor} · {fmtHora(i.created_at)}</span>
                    </div>
                    {i.descricao && <div className="mt-1 text-cream leading-relaxed">{i.descricao}</div>}
                  </div>
                ))}
                {selInteracoes.length === 0 && <div className="text-xs text-dim">Nenhuma interação registrada.</div>}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
