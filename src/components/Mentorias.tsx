import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Mentoria = {
  id: string; slug: string; nome: string; concursos: string[] | null
  ativa: boolean; hubla_product_names: string[] | null
}

const inp = 'w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold/60 placeholder:text-dim/40'

export default function Mentorias() {
  const vazio = { id: '', slug: '', nome: '', concursos: '', ativa: true, hubla: '' }
  const [mentorias, setMentorias] = useState<Mentoria[]>([])
  const [form, setForm] = useState(vazio)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 7000) }

  const carregar = async () => {
    const { data } = await supabase.from('mentorias')
      .select('id,slug,nome,concursos,ativa,hubla_product_names').order('nome')
    setMentorias((data as any) ?? [])
  }
  useEffect(() => { carregar() }, [])

  const abrir = (m: Mentoria) => {
    setEditando(true)
    setForm({
      id: m.id, slug: m.slug, nome: m.nome,
      concursos: (m.concursos ?? []).join(', '),
      ativa: m.ativa,
      hubla: (m.hubla_product_names ?? []).join(', '),
    })
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim() || !form.slug.trim()) return flash('⚠️ Nome e slug são obrigatórios.')
    setSalvando(true)
    const payload = {
      slug: form.slug.trim(), nome: form.nome.trim(),
      concursos: form.concursos.split(',').map(s => s.trim()).filter(Boolean),
      ativa: form.ativa,
      hubla_product_names: form.hubla.split(',').map(s => s.trim()).filter(Boolean),
    }
    const { error } = form.id
      ? await supabase.from('mentorias').update(payload).eq('id', form.id)
      : await supabase.from('mentorias').insert(payload)
    setSalvando(false)
    if (error) return flash('⚠️ Erro ao salvar: ' + error.message)
    flash(form.id ? '✅ Mentoria atualizada.' : '✅ Mentoria criada.')
    setForm(vazio); setEditando(false)
    carregar()
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 max-w-4xl space-y-4">
      {msg && <div className="rise border border-win/40 bg-win/10 text-win text-sm rounded-xl px-4 py-3">{msg}</div>}

      <div className="flex items-center">
        <div>
          <h1 className="font-display font-bold text-2xl">Mentorias</h1>
          <p className="text-xs text-dim mt-1">Mentorias que o acompanhamento enxerga (roteamento Hubla usa hubla_product_names).</p>
        </div>
        <button onClick={() => { setForm(vazio); setEditando(true) }}
          className="ml-auto text-xs font-semibold bg-gold/15 text-gold border border-gold/40 rounded-lg px-3 py-1.5 hover:bg-gold/25 transition shrink-0">
          ＋ Nova mentoria
        </button>
      </div>

      {editando && (
        <form onSubmit={salvar} className="border border-gold/25 bg-gold/5 rounded-xl p-4 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="block text-xs text-dim">Nome
              <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className={inp + ' mt-1'} />
            </label>
            <label className="block text-xs text-dim">Slug
              <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })}
                placeholder="ex.: elite_prf" className={inp + ' mt-1 font-mono'} />
            </label>
          </div>
          <label className="block text-xs text-dim">Concursos (separados por vírgula)
            <input value={form.concursos} onChange={e => setForm({ ...form, concursos: e.target.value })}
              placeholder="PRF, PF" className={inp + ' mt-1'} />
          </label>
          <label className="block text-xs text-dim">Nomes de produto na Hubla (separados por vírgula)
            <input value={form.hubla} onChange={e => setForm({ ...form, hubla: e.target.value })}
              placeholder="Mentoria Elite PRF, Elite PRF 2.0" className={inp + ' mt-1'} />
          </label>
          <label className="flex items-center gap-2 text-xs text-dim cursor-pointer">
            <input type="checkbox" checked={form.ativa} onChange={e => setForm({ ...form, ativa: e.target.checked })} />
            Mentoria ativa
          </label>
          <div className="flex gap-2">
            <button disabled={salvando}
              className="bg-gold text-ink font-semibold rounded-lg px-5 py-2 text-sm hover:brightness-110 transition disabled:opacity-40">
              {salvando ? '…' : form.id ? '💾 Salvar alterações' : '＋ Criar mentoria'}
            </button>
            <button type="button" onClick={() => { setEditando(false); setForm(vazio) }}
              className="text-xs text-dim border border-line rounded-lg px-4 hover:text-cream transition">Cancelar</button>
          </div>
        </form>
      )}

      <div className="space-y-1.5">
        {mentorias.map(m => (
          <div key={m.id} className="border border-line bg-panel/50 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
            <span className={`inline-block w-2 h-2 rounded-full ${m.ativa ? 'bg-win' : 'bg-dim'}`} />
            <div className="min-w-0">
              <div className="font-medium text-sm">{m.nome}</div>
              <div className="font-mono text-[10px] text-dim">
                {m.slug}{(m.concursos?.length ?? 0) > 0 ? ` · 🎯 ${m.concursos!.join(', ')}` : ''}
              </div>
            </div>
            <button onClick={() => abrir(m)}
              className="ml-auto text-xs text-dim border border-line rounded-lg px-3 py-1.5 hover:text-cream transition">✎ Editar</button>
          </div>
        ))}
        {mentorias.length === 0 && <div className="text-sm text-dim py-4 text-center">Nenhuma mentoria cadastrada.</div>}
      </div>
    </div>
  )
}
