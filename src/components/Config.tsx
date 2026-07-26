import { useEffect, useState } from 'react'
import { supabase, fmtHora } from '../lib/supabase'

type Agente = {
  id: string; slug: string; nome: string; ativo: boolean; modelo: string | null
  system_prompt: string | null; dados: any; mentoria_id: string | null
}
type Mentoria = {
  id: string; slug: string; nome: string; concursos: string[] | null
  ativa: boolean; hubla_product_names: string[] | null
}
type ConfigRow = { key: string; value: any; updated_at: string | null }

const inp = 'w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-cream focus:outline-none focus:border-gold/60 placeholder:text-dim/40'
const SECOES = [
  { id: 'agentes', label: '🤖 Agentes' },
  { id: 'mentorias', label: '🎓 Mentorias' },
  { id: 'chaves', label: '🔧 Chaves' },
  { id: 'equipe', label: '👥 Equipe' },
] as const

export default function Config() {
  const [secao, setSecao] = useState<string>('agentes')
  const [msg, setMsg] = useState('')
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 7000) }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-5 max-w-4xl">
      <div>
        <h1 className="font-display font-bold text-2xl">Configuração</h1>
        <nav className="flex gap-1.5 mt-3 flex-wrap">
          {SECOES.map(s => (
            <button key={s.id} onClick={() => setSecao(s.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition
                ${secao === s.id ? 'border-gold/60 bg-gold/10 text-cream' : 'border-line text-dim hover:text-cream'}`}>
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {msg && <div className="rise border border-win/40 bg-win/10 text-win text-sm rounded-xl px-4 py-3">{msg}</div>}

      {secao === 'agentes' && <Agentes flash={flash} />}
      {secao === 'mentorias' && <Mentorias flash={flash} />}
      {secao === 'chaves' && <Chaves flash={flash} />}
      {secao === 'equipe' && <Equipe flash={flash} />}
    </div>
  )
}

/* ── 🤖 Agentes: system_prompt + dados jsonb ─────────────────────────── */
function Agentes({ flash }: { flash: (t: string) => void }) {
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [sel, setSel] = useState<Agente | null>(null)
  const [prompt, setPrompt] = useState('')
  const [dados, setDados] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    const { data } = await supabase.from('agentes')
      .select('id,slug,nome,ativo,modelo,system_prompt,dados,mentoria_id').order('slug')
    setAgentes((data as any) ?? [])
  }
  useEffect(() => { carregar() }, [])

  const abrir = (a: Agente) => {
    setSel(a)
    setPrompt(a.system_prompt ?? '')
    setDados(JSON.stringify(a.dados ?? {}, null, 2))
  }

  const salvar = async () => {
    if (!sel) return
    let dadosJson: any
    try { dadosJson = JSON.parse(dados || '{}') } catch { return flash('⚠️ O campo "dados" não é um JSON válido.') }
    setSalvando(true)
    const { error } = await supabase.from('agentes')
      .update({ system_prompt: prompt, dados: dadosJson }).eq('id', sel.id)
    setSalvando(false)
    if (error) return flash('⚠️ Erro ao salvar: ' + error.message)
    flash(`✅ Agente ${sel.slug} salvo — vale já na próxima mensagem.`)
    carregar()
  }

  const toggleAtivo = async (a: Agente) => {
    const { error } = await supabase.from('agentes').update({ ativo: !a.ativo }).eq('id', a.id)
    if (error) return flash('⚠️ ' + error.message)
    carregar()
  }

  return (
    <section className="space-y-3">
      <p className="text-xs text-dim">Edite o cérebro da Diana: prompt do sistema e dados (jsonb) de cada agente.</p>
      <div className="flex flex-wrap gap-2">
        {agentes.map(a => (
          <button key={a.id} onClick={() => abrir(a)}
            className={`text-xs px-3 py-2 rounded-lg border transition flex items-center gap-2
              ${sel?.id === a.id ? 'border-gold/60 bg-gold/10 text-cream' : 'border-line text-dim hover:text-cream'}`}>
            <span className={`inline-block w-2 h-2 rounded-full ${a.ativo ? 'bg-win' : 'bg-dim'}`} />
            {a.nome} <span className="font-mono text-[10px] opacity-60">{a.slug}</span>
          </button>
        ))}
        {agentes.length === 0 && <div className="text-sm text-dim">Nenhum agente cadastrado.</div>}
      </div>

      {sel && (
        <div className="border border-line bg-panel/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-display font-semibold">{sel.nome}</div>
            <span className="font-mono text-[11px] text-dim">{sel.slug}{sel.modelo ? ` · ${sel.modelo}` : ''}</span>
            <button onClick={() => toggleAtivo(sel)}
              className={`ml-auto text-xs px-3 py-1.5 rounded-lg border transition
                ${sel.ativo ? 'text-win border-win/40 bg-win/10' : 'text-dim border-line'}`}>
              {sel.ativo ? '● Ativo' : '○ Inativo'}
            </button>
          </div>
          <label className="block text-xs text-dim">System prompt
            <textarea rows={16} value={prompt} onChange={e => setPrompt(e.target.value)}
              className={inp + ' mt-1 font-mono text-xs leading-relaxed'} />
          </label>
          <label className="block text-xs text-dim">Dados (jsonb)
            <textarea rows={8} value={dados} onChange={e => setDados(e.target.value)}
              className={inp + ' mt-1 font-mono text-xs leading-relaxed'} />
          </label>
          <button onClick={salvar} disabled={salvando}
            className="bg-gold text-ink font-semibold rounded-lg px-5 py-2 text-sm hover:brightness-110 transition disabled:opacity-40">
            {salvando ? 'Salvando…' : '💾 Salvar agente'}
          </button>
        </div>
      )}
    </section>
  )
}

/* ── 🎓 Mentorias: CRUD simples ──────────────────────────────────────── */
function Mentorias({ flash }: { flash: (t: string) => void }) {
  const vazio = { id: '', slug: '', nome: '', concursos: '', ativa: true, hubla: '' }
  const [mentorias, setMentorias] = useState<Mentoria[]>([])
  const [form, setForm] = useState(vazio)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)

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
    <section className="space-y-3">
      <div className="flex items-center">
        <p className="text-xs text-dim">Mentorias que o acompanhamento enxerga (roteamento Hubla usa hubla_product_names).</p>
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
    </section>
  )
}

/* ── 🔧 Chaves da tabela config (value jsonb como texto) ─────────────── */
function Chaves({ flash }: { flash: (t: string) => void }) {
  const [rows, setRows] = useState<ConfigRow[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)

  const carregar = async () => {
    const { data } = await supabase.from('config').select('key,value,updated_at').order('key')
    const lista = (data as any as ConfigRow[]) ?? []
    setRows(lista)
    const e: Record<string, string> = {}
    for (const r of lista) e[r.key] = JSON.stringify(r.value, null, 2)
    setEdits(e)
  }
  useEffect(() => { carregar() }, [])

  const salvar = async (key: string) => {
    let value: any
    try { value = JSON.parse(edits[key]) } catch { return flash(`⚠️ O valor de "${key}" não é um JSON válido.`) }
    setSalvando(key)
    const { error } = await supabase.from('config').update({ value }).eq('key', key)
    setSalvando(null)
    if (error) return flash('⚠️ Erro ao salvar: ' + error.message)
    flash(`✅ Chave "${key}" salva.`)
    carregar()
  }

  return (
    <section className="space-y-3">
      <p className="text-xs text-dim">
        Chaves de operação (janela_envio, onda_diaria, suporte_whatsapp…). O valor é JSON — cuidado com aspas e vírgulas.
      </p>
      {rows.map(r => (
        <div key={r.key} className="border border-line bg-panel/50 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-gold">{r.key}</span>
            <span className="ml-auto font-mono text-[10px] text-dim/60">{r.updated_at ? fmtHora(r.updated_at) : ''}</span>
          </div>
          <textarea rows={Math.min(10, Math.max(2, (edits[r.key] ?? '').split('\n').length))}
            value={edits[r.key] ?? ''} onChange={e => setEdits({ ...edits, [r.key]: e.target.value })}
            className={inp + ' font-mono text-xs leading-relaxed'} />
          <button onClick={() => salvar(r.key)} disabled={salvando === r.key}
            className="text-xs font-semibold bg-teal/15 text-teal border border-teal/40 rounded-lg px-4 py-1.5 hover:bg-teal/25 transition disabled:opacity-40">
            {salvando === r.key ? '…' : '💾 Salvar'}
          </button>
        </div>
      ))}
      {rows.length === 0 && <div className="text-sm text-dim py-4 text-center">Nenhuma chave na tabela config.</div>}
    </section>
  )
}

/* ── 👥 Equipe: operator_emails + minha conta ────────────────────────── */
function Equipe({ flash }: { flash: (t: string) => void }) {
  const [emails, setEmails] = useState<string[]>([])
  const [meuEmail, setMeuEmail] = useState('')
  const [novo, setNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [trocando, setTrocando] = useState(false)

  const carregar = async () => {
    const { data } = await supabase.from('config').select('value').eq('key', 'operator_emails').single()
    setEmails(((data?.value as string[]) ?? []))
    const { data: u } = await supabase.auth.getUser()
    setMeuEmail(u.user?.email ?? '')
  }
  useEffect(() => { carregar() }, [])

  const salvarLista = async (nova: string[]) => {
    const { error } = await supabase.from('config').update({ value: nova }).eq('key', 'operator_emails')
    if (error) { flash('⚠️ Erro ao salvar: ' + error.message); return false }
    setEmails(nova)
    return true
  }

  const adicionar = async () => {
    const email = novo.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return flash('Digite um e-mail válido.')
    if (emails.includes(email)) return flash('Esse e-mail já está na equipe.')
    setSalvando(true)
    if (await salvarLista([...emails, email])) {
      // envia o link mágico de primeiro acesso — mesmo fluxo do login
      const { error } = await supabase.auth.signInWithOtp({
        email, options: { emailRedirectTo: window.location.href.split('#')[0], shouldCreateUser: true },
      })
      flash(error
        ? `${email} autorizado, mas o e-mail de acesso falhou (${error.message}). A pessoa pode pedir o link na tela de login.`
        : `✅ ${email} autorizado — link de acesso enviado por e-mail.`)
      setNovo('')
    }
    setSalvando(false)
  }

  const remover = async (email: string) => {
    if (email === meuEmail) return flash('Você não pode remover o seu próprio acesso.')
    if (!window.confirm(`Remover o acesso de ${email}?\n\nA pessoa perde a entrada no painel imediatamente.`)) return
    setSalvando(true)
    if (await salvarLista(emails.filter(e => e !== email))) flash(`Acesso de ${email} removido.`)
    setSalvando(false)
  }

  const trocarSenha = async () => {
    if (senha.length < 8) return flash('A senha precisa ter pelo menos 8 caracteres.')
    if (senha !== senha2) return flash('As senhas não conferem.')
    setTrocando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setTrocando(false)
    if (error) return flash('⚠️ Erro ao alterar a senha: ' + error.message)
    setSenha(''); setSenha2('')
    flash('✅ Senha alterada — já vale no próximo login.')
  }

  return (
    <section className="space-y-4 max-w-2xl">
      <p className="text-xs text-dim">
        Quem está aqui enxerga e opera o painel inteiro. A lista vive em <span className="font-mono text-[11px]">config.operator_emails</span>{' '}
        e o RLS <span className="font-mono text-[11px]">fn_is_operator()</span> obedece a ela.
      </p>

      <div className="border border-teal/25 bg-teal/5 rounded-xl p-4">
        <div className="text-xs text-teal mb-1 font-mono uppercase tracking-widest">Minha conta</div>
        <div className="text-sm font-mono mb-3">{meuEmail}</div>
        <div className="text-xs text-dim mb-2">Definir/alterar minha senha (passa a valer junto com o link mágico)</div>
        <div className="flex gap-2 flex-wrap">
          <input type="password" className={inp + ' flex-1 min-w-40'} placeholder="Nova senha (mín. 8)" value={senha}
            onChange={e => setSenha(e.target.value)} autoComplete="new-password" />
          <input type="password" className={inp + ' flex-1 min-w-40'} placeholder="Repetir a nova senha" value={senha2}
            onChange={e => setSenha2(e.target.value)} autoComplete="new-password"
            onKeyDown={e => e.key === 'Enter' && trocarSenha()} />
          <button onClick={trocarSenha} disabled={trocando || !senha || !senha2}
            className="bg-teal/15 text-teal border border-teal/40 font-semibold rounded-lg px-4 text-sm disabled:opacity-40 hover:bg-teal/25 transition">
            {trocando ? '…' : '🔑 Salvar senha'}
          </button>
        </div>
      </div>

      <div className="border border-line bg-panel/50 rounded-xl p-4">
        <div className="text-xs text-dim mb-2">Cadastrar novo operador</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input className={inp + ' flex-1'} placeholder="email@grupo.com" value={novo}
            onChange={e => setNovo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionar()} />
          <button onClick={adicionar} disabled={salvando || !novo.trim()}
            className="bg-gold text-ink font-semibold rounded-lg px-5 py-2 text-sm disabled:opacity-40 hover:brightness-110 transition shrink-0">
            {salvando ? '…' : '＋ Cadastrar e enviar link'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {emails.map(e => (
          <div key={e} className="border border-line bg-panel/50 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-sm font-mono truncate">{e}</span>
            {e === meuEmail && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-gold/40 text-gold bg-gold/10">você</span>
            )}
            {e !== meuEmail && (
              <button onClick={() => remover(e)} disabled={salvando}
                className="ml-auto text-xs text-danger/80 border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-danger/10 hover:text-danger transition disabled:opacity-40">
                Remover
              </button>
            )}
          </div>
        ))}
        {emails.length === 0 && <div className="text-center py-6 text-dim text-sm">Carregando…</div>}
      </div>
    </section>
  )
}
