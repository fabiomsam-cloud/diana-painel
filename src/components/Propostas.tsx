import { useEffect, useState } from 'react'
import { supabase, fmtHora, fmtFone } from '../lib/supabase'

type Proposta = {
  id: string; aluno_id: string; mentoria_id: string | null; concurso: string | null
  meta_90_dias: string | null; horas_semana: number | null; motivo: string | null
  origem: string | null; created_at: string
  alunos: { nome: string | null; phone: string | null } | null
  mentorias: { nome: string } | null
}
type Mentoria = { id: string; nome: string }

const inp = 'w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold/60 placeholder:text-dim/40'

export default function Propostas() {
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [mentorias, setMentorias] = useState<Mentoria[]>([])
  const [agindo, setAgindo] = useState<string | null>(null)
  const [ajustando, setAjustando] = useState<string | null>(null)
  const [form, setForm] = useState({ mentoria_id: '', concurso: '', meta: '', horas: '10', motivo: '' })
  const [msg, setMsg] = useState('')

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 7000) }

  const carregar = async () => {
    const [{ data }, { data: ms }] = await Promise.all([
      supabase.from('rotas')
        .select('id,aluno_id,mentoria_id,concurso,meta_90_dias,horas_semana,motivo,origem,created_at,alunos(nome,phone),mentorias(nome)')
        .eq('status', 'proposta').order('created_at', { ascending: true }),
      supabase.from('mentorias').select('id,nome').order('nome'),
    ])
    setPropostas((data as any) ?? [])
    setMentorias((ms as any) ?? [])
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
    </div>
  )
}
