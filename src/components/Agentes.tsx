import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Agente = {
  id: string; slug: string; nome: string; ativo: boolean; modelo: string | null
  system_prompt: string | null; dados: any; mentoria_id: string | null
}
type Mentoria = { id: string; nome: string }

export default function Agentes() {
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [mentorias, setMentorias] = useState<Mentoria[]>([])
  const [sel, setSel] = useState<Agente | null>(null)
  const [modo, setModo] = useState<'lista' | 'agente' | 'novo'>('lista')
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 6000) }

  const carregar = async () => {
    const { data } = await supabase.from('agentes')
      .select('id,slug,nome,ativo,modelo,system_prompt,dados,mentoria_id').order('slug')
    setAgentes((data as any) ?? [])
    const { data: m } = await supabase.from('mentorias').select('id,nome').order('nome')
    setMentorias((m as any) ?? [])
  }
  useEffect(() => { carregar() }, [])

  const abrirAgente = (a: Agente) => {
    setSel(a); setModo('agente')
    setForm({
      nome: a.nome, modelo: a.modelo ?? '',
      mentoria_id: a.mentoria_id ?? '',
      suporte_whatsapp: a.dados?.suporte_whatsapp ?? '',
      imagem_horarios_url: a.dados?.imagem_horarios_url ?? '',
      system_prompt: a.system_prompt ?? '',
    })
  }

  // checkbox "ativo" com update imediato no banco
  const toggleAtivo = async (ativo: boolean) => {
    if (!sel) return
    const { error } = await supabase.from('agentes').update({ ativo }).eq('id', sel.id)
    if (error) return flash('⚠️ ' + error.message)
    setSel({ ...sel, ativo })
    flash(ativo ? `✅ Agente ${sel.slug} ATIVADO — já vale na próxima mensagem.` : `Agente ${sel.slug} desativado.`)
    carregar()
  }

  const salvarAgente = async () => {
    if (!sel) return
    setSalvando(true)
    // merge do jsonb: nunca descartar chaves desconhecidas do dados
    const dados = {
      ...(sel.dados ?? {}),
      suporte_whatsapp: form.suporte_whatsapp,
      imagem_horarios_url: form.imagem_horarios_url,
    }
    const { error } = await supabase.from('agentes').update({
      nome: form.nome, modelo: form.modelo || null,
      mentoria_id: form.mentoria_id || null,
      system_prompt: form.system_prompt,
      dados,
    }).eq('id', sel.id)
    setSalvando(false)
    if (error) return flash('⚠️ Erro: ' + error.message)
    flash('✅ Salvo! A alteração já vale na próxima mensagem.')
    setSel({ ...sel, nome: form.nome, modelo: form.modelo || null, mentoria_id: form.mentoria_id || null, system_prompt: form.system_prompt, dados })
    carregar()
  }

  const criarAgente = async () => {
    const slug = (form.slug || '').trim()
    if (!slug || !(form.nome || '').trim()) return flash('Preencha nome e slug.')
    setSalvando(true)
    const { error } = await supabase.from('agentes').insert({
      slug, nome: form.nome.trim(), ativo: false, modelo: form.modelo || 'gpt-5',
      system_prompt: '', dados: {},
    })
    setSalvando(false)
    if (error) return flash('⚠️ Erro: ' + error.message)
    flash('Agente criado INATIVO. Preencha o prompt, teste, e só então ative.')
    setModo('lista'); carregar()
  }

  const inp = 'w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold/60 placeholder:text-dim/40'
  const lbl = 'block text-xs text-dim'

  /* ---------- LISTA ---------- */
  if (modo === 'lista') return (
    <div className="h-full overflow-y-auto p-6 max-w-4xl">
      {msg && <div className="rise border border-win/40 bg-win/10 text-win text-sm rounded-xl px-4 py-3 mb-4">{msg}</div>}
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-display font-bold text-2xl">Agentes</h1>
        <button onClick={() => { setForm({ modelo: 'gpt-5' }); setModo('novo') }}
          className="bg-gold text-ink font-semibold rounded-lg px-4 py-2 text-sm hover:brightness-110 transition">＋ Novo agente</button>
      </div>
      <p className="text-xs text-dim mb-5">Cada agente é um cérebro da Diana. Edite o prompt e os dados de contato — a mudança vale na mensagem seguinte.</p>
      <div className="space-y-2">
        {agentes.map(a => (
          <button key={a.id} onClick={() => abrirAgente(a)}
            className="w-full text-left border border-line bg-panel/50 rounded-xl p-4 hover:border-gold/40 transition flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.ativo ? 'bg-win' : 'bg-dim'}`} />
            <div className="min-w-0">
              <div className="font-semibold">{a.nome}</div>
              <div className="font-mono text-[11px] text-dim">{a.slug}{a.modelo ? ` · ${a.modelo}` : ''}</div>
            </div>
            <span className="ml-auto text-dim text-sm">editar →</span>
          </button>
        ))}
        {agentes.length === 0 && <div className="text-sm text-dim py-6 text-center">Nenhum agente cadastrado.</div>}
      </div>
    </div>
  )

  /* ---------- NOVO AGENTE ---------- */
  if (modo === 'novo') return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl space-y-4">
      {msg && <div className="rise border border-win/40 bg-win/10 text-win text-sm rounded-xl px-4 py-3">{msg}</div>}
      <button onClick={() => setModo('lista')} className="text-sm text-dim hover:text-cream">← Voltar</button>
      <h1 className="font-display font-bold text-2xl">Novo agente</h1>
      <p className="text-xs text-dim">O agente nasce <b>inativo</b>: preencha o prompt, teste com um número da equipe e só então ative.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className={lbl}>Nome do agente
          <input className={inp + ' mt-1'} placeholder="Diana Acompanhamento" value={form.nome ?? ''}
            onChange={e => setForm({ ...form, nome: e.target.value, slug: (form.slugTocado ? form.slug : e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')) })} />
        </label>
        <label className={lbl}>Slug (identificador único)
          <input className={inp + ' mt-1 font-mono'} placeholder="acompanhamento" value={form.slug ?? ''}
            onChange={e => setForm({ ...form, slug: e.target.value, slugTocado: true })} />
        </label>
      </div>
      <button onClick={criarAgente} disabled={salvando}
        className="bg-gold text-ink font-semibold rounded-lg px-6 py-2.5 text-sm hover:brightness-110 transition disabled:opacity-50">
        {salvando ? 'Criando…' : 'Criar agente (inativo)'}
      </button>
    </div>
  )

  /* ---------- AGENTE (edição) ---------- */
  if (!sel) return null
  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl space-y-5">
      {msg && <div className="rise border border-win/40 bg-win/10 text-win text-sm rounded-xl px-4 py-3">{msg}</div>}
      <button onClick={() => { setModo('lista'); setSel(null); carregar() }} className="text-sm text-dim hover:text-cream">← Voltar</button>

      <div className="flex items-center gap-3">
        <h1 className="font-display font-bold text-2xl">{sel.nome}</h1>
        <span className="font-mono text-[11px] text-dim">{sel.slug}</span>
        <label className="ml-auto text-xs text-dim flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={sel.ativo} onChange={e => toggleAtivo(e.target.checked)}
            className="accent-[#f5b942]" /> ativo
        </label>
      </div>

      <section className="border border-line bg-panel/50 rounded-xl p-4 space-y-3">
        <h2 className="font-display font-semibold">Geral</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className={lbl}>Nome <input className={inp + ' mt-1'} value={form.nome ?? ''} onChange={e => setForm({ ...form, nome: e.target.value })} /></label>
          <label className={lbl}>Modelo IA <input className={inp + ' mt-1 font-mono'} placeholder="gpt-5" value={form.modelo ?? ''} onChange={e => setForm({ ...form, modelo: e.target.value })} /></label>
          <label className={lbl + ' col-span-2'}>Mentoria
            <select className={inp + ' mt-1'} value={form.mentoria_id ?? ''} onChange={e => setForm({ ...form, mentoria_id: e.target.value })}>
              <option value="">— nenhuma —</option>
              {mentorias.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </label>
          <label className={lbl}>Suporte WhatsApp
            <input className={inp + ' mt-1 font-mono'} placeholder="5592999999999" value={form.suporte_whatsapp ?? ''}
              onChange={e => setForm({ ...form, suporte_whatsapp: e.target.value })} />
          </label>
          <label className={lbl}>URL da imagem da grade de horários
            <input className={inp + ' mt-1 font-mono'} placeholder="https://…/grade.png" value={form.imagem_horarios_url ?? ''}
              onChange={e => setForm({ ...form, imagem_horarios_url: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="border border-line bg-panel/50 rounded-xl p-4 space-y-3">
        <h2 className="font-display font-semibold">Prompt do agente <span className="text-[11px] text-dim font-body font-normal">— o cérebro da Diana; a alteração vale na próxima mensagem</span></h2>
        <textarea value={form.system_prompt ?? ''} onChange={e => setForm({ ...form, system_prompt: e.target.value })}
          className={inp + ' font-mono text-xs leading-relaxed min-h-[28rem]'} />
        <button onClick={salvarAgente} disabled={salvando}
          className="bg-gold text-ink font-semibold rounded-lg px-6 py-2.5 text-sm hover:brightness-110 transition disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </section>
    </div>
  )
}
