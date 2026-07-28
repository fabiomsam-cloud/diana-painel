import { useEffect, useRef, useState } from 'react'
import { supabase, STATUS_CONV, fmtHora, fmtFone } from '../lib/supabase'

type Conv = {
  id: string; status: string; agente_slug: string | null
  last_message_at: string | null; last_user_message_at: string | null; contexto: any
  alunos: { id: string; nome: string | null; phone: string | null } | null
}
type Msg = {
  id: string; from_type: string; type: string | null; content: string | null
  transcript: string | null; status: string | null; created_at: string; metadata: any
}

const FROM_STYLE: Record<string, string> = {
  user: 'self-start bg-panel2 border-line',
  ia: 'self-end bg-teal/10 border-teal/25',
  human: 'self-end bg-gold/10 border-gold/30',
  system: 'self-center bg-panel border-line text-dim text-xs',
}

export default function Inbox({ convInicial, aoConsumir }: { convInicial?: string | null; aoConsumir?: () => void } = {}) {
  const [convs, setConvs] = useState<Conv[]>([])
  const [sel, setSel] = useState<Conv | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [filtro, setFiltro] = useState<'' | 'ia' | 'humano'>('')
  const [busca, setBusca] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)
  const buscaRef = useRef('')
  buscaRef.current = busca

  const SEL = 'id,status,agente_slug,last_message_at,last_user_message_at,contexto,alunos(id,nome,phone)'

  const carregarConvs = async () => {
    const q = buscaRef.current.trim()
    if (q) {
      // busca NO BANCO pelo aluno (nome/telefone)
      const digits = q.replace(/\D/g, '')
      const ors = [`nome.ilike.%${q}%`]
      if (digits.length >= 4) ors.push(`phone.ilike.%${digits}%`, `phone_norm.ilike.%${digits}%`)
      const { data: als } = await supabase.from('alunos').select('id').or(ors.join(',')).limit(100)
      const ids = ((als as any) ?? []).map((a: any) => a.id)
      if (!ids.length) { setConvs([]); return }
      const { data } = await supabase.from('conversas').select(SEL)
        .in('aluno_id', ids)
        .order('last_message_at', { ascending: false, nullsFirst: false }).limit(100)
      setConvs((data as any) ?? [])
      return
    }
    const { data } = await supabase.from('conversas').select(SEL)
      .order('last_message_at', { ascending: false, nullsFirst: false }).limit(200)
    setConvs((data as any) ?? [])
  }

  // vindo das Escalações: abre direto a conversa do aluno (mesmo mecanismo da Anne)
  useEffect(() => {
    if (!convInicial) return
    supabase.from('conversas').select(SEL)
      .eq('id', convInicial).single()
      .then(({ data }) => { if (data) setSel(data as any) })
    aoConsumir?.()
  }, [convInicial])

  useEffect(() => {
    carregarConvs()
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregarConvs() }, 20000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setTimeout(carregarConvs, 350)
    return () => clearTimeout(t)
  }, [busca])

  const carregarMsgs = async (convId: string) => {
    const { data } = await supabase.from('mensagens')
      .select('id,from_type,type,content,transcript,status,created_at,metadata')
      .eq('conversa_id', convId)
      .order('created_at', { ascending: true })
      .limit(300)
    setMsgs((data as any) ?? [])
  }

  // polling da thread aberta a cada 4s — pausa com a aba oculta, preserva o rascunho
  useEffect(() => {
    if (!sel) return
    carregarMsgs(sel.id)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') carregarMsgs(sel.id)
    }, 4000)
    return () => clearInterval(t)
  }, [sel?.id])

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  const assumir = async () => {
    if (!sel) return
    const { error } = await supabase.from('conversas').update({ status: 'humano' }).eq('id', sel.id)
    if (error) return setErro(error.message)
    setSel({ ...sel, status: 'humano' })
    carregarConvs()
  }

  const devolver = async () => {
    if (!sel) return
    const { error } = await supabase.from('conversas').update({ status: 'ia' }).eq('id', sel.id)
    if (error) return setErro(error.message)
    setSel({ ...sel, status: 'ia' })
    carregarConvs()
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sel || !texto.trim() || enviando) return
    setEnviando(true); setErro('')
    const t = texto.trim()
    const { error: e1 } = await supabase.from('mensagens').insert({
      conversa_id: sel.id, from_type: 'human', type: 'text', content: t,
    })
    if (e1) { setEnviando(false); return setErro('Erro ao salvar a mensagem: ' + e1.message) }
    const { error: e2 } = await supabase.from('fila_envio').insert({
      conversa_id: sel.id, partes: [t],
    })
    setEnviando(false)
    if (e2) return setErro('Mensagem salva, mas o envio falhou: ' + e2.message)
    setTexto('')
    carregarMsgs(sel.id)
  }

  const lista = convs.filter(c => !filtro || c.status === filtro)

  return (
    <div className="h-full flex">
      {/* Lista de conversas — no mobile some quando uma conversa está aberta */}
      <div className={`${sel ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 shrink-0 border-r border-line flex-col`}>
        <div className="p-3 border-b border-line space-y-2">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou telefone…"
            className="w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold/60 placeholder:text-dim/50" />
          <div className="flex gap-1.5">
            {([['', 'Todas'], ['ia', '🤖 Diana'], ['humano', '👤 Humano']] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setFiltro(v)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition
                  ${filtro === v ? 'border-gold/60 bg-gold/10 text-cream' : 'border-line text-dim hover:text-cream'}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {lista.map(c => (
            <button key={c.id} onClick={() => setSel(c)}
              className={`w-full text-left px-4 py-3 border-b border-line/50 hover:bg-panel2/50 transition-colors
                ${sel?.id === c.id ? 'bg-panel2' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{c.alunos?.nome || fmtFone(c.alunos?.phone)}</span>
                <span className="font-mono text-[10px] text-dim shrink-0">{fmtHora(c.last_message_at)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_CONV[c.status]?.cls ?? 'text-dim border-line'}`}>
                  {STATUS_CONV[c.status]?.label ?? c.status}
                </span>
                {c.agente_slug && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-line text-dim truncate">{c.agente_slug}</span>
                )}
              </div>
            </button>
          ))}
          {lista.length === 0 && <div className="p-6 text-center text-dim text-sm">Nenhuma conversa.</div>}
        </div>
      </div>

      {/* Thread */}
      <div className={`${sel ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0 flex-col`}>
        {!sel ? (
          <div className="flex-1 grid place-items-center text-dim">
            <div className="text-center">
              <div className="text-4xl mb-3">💬</div>
              <div className="text-sm">Selecione uma conversa</div>
            </div>
          </div>
        ) : (
          <>
            <div className="px-3 md:px-5 py-3 border-b border-line flex items-center gap-2 md:gap-3">
              <button onClick={() => setSel(null)} className="lg:hidden text-dim hover:text-cream text-lg px-1 shrink-0">←</button>
              <div className="min-w-0">
                <div className="font-display font-semibold truncate">{sel.alunos?.nome || 'Sem nome'}</div>
                <div className="font-mono text-[11px] text-dim">{fmtFone(sel.alunos?.phone)}</div>
              </div>
              <span className={`text-[11px] px-2 py-1 rounded-lg border shrink-0 ${STATUS_CONV[sel.status]?.cls ?? 'text-dim border-line'}`}>
                {STATUS_CONV[sel.status]?.label ?? sel.status}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {sel.status === 'humano' ? (
                  <button onClick={devolver}
                    className="text-xs font-semibold bg-teal/15 text-teal border border-teal/40 rounded-lg px-3 py-1.5 hover:bg-teal/25 transition">
                    ↩ Devolver à Diana
                  </button>
                ) : (
                  <button onClick={assumir}
                    className="text-xs font-semibold bg-gold/15 text-gold border border-gold/40 rounded-lg px-3 py-1.5 hover:bg-gold/25 transition">
                    ✋ Assumir conversa
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
              {msgs.map(m => (
                <div key={m.id} className={`max-w-[78%] border rounded-2xl px-3.5 py-2 ${FROM_STYLE[m.from_type] ?? FROM_STYLE.system}`}>
                  {m.type === 'audio' && <div className="text-[10px] font-mono text-dim mb-1">🎙 áudio transcrito</div>}
                  <div className="text-sm whitespace-pre-wrap break-words">{m.transcript || m.content}</div>
                  <div className="text-[10px] font-mono text-dim/70 mt-1 text-right">
                    {m.from_type === 'ia' ? '💎 ' : m.from_type === 'human' ? '👤 ' : ''}{fmtHora(m.created_at)}
                  </div>
                </div>
              ))}
              <div ref={fimRef} />
            </div>

            <form onSubmit={enviar} className="p-4 border-t border-line">
              {erro && <div className="text-danger text-xs mb-2">⚠️ {erro}</div>}
              <div className="flex gap-2">
                <input value={texto} onChange={e => setTexto(e.target.value)}
                  placeholder={sel.status === 'humano' ? 'Responder como humano…' : 'Assuma a conversa para responder (Diana está atendendo)'}
                  disabled={sel.status !== 'humano'}
                  className="flex-1 bg-panel border border-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gold/60 disabled:opacity-40 placeholder:text-dim/50" />
                <button disabled={sel.status !== 'humano' || !texto.trim() || enviando}
                  className="bg-gold text-ink font-semibold rounded-xl px-5 text-sm disabled:opacity-30 hover:brightness-110 transition">
                  {enviando ? '…' : 'Enviar'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
