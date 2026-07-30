import { useEffect, useRef, useState } from 'react'
import { supabase, STATUS_CONV, COR_INDICE, fmtHora, fmtData, fmtFone } from '../lib/supabase'

// Porte fiel do Inbox da Anne Vendedora (anne/painel) adaptado ao schema da
// Diana: conversations→conversas, contacts→alunos, messages→mensagens,
// send_queue→fila_envio. Sem KB/follow-up (a Diana não tem esses motores).

type Conv = {
  id: string; status: string; agente_slug: string | null
  last_message_at: string | null; last_user_message_at: string | null; contexto: any
  alunos: {
    id: string; nome: string | null; phone: string | null; email: string | null
    ficha: any; situacao: string | null; opted_out: boolean; status: string | null
  } | null
}
type Msg = {
  id: string; from_type: string; type: string | null; content: string | null
  transcript: string | null; status: string | null; created_at: string; metadata: any
}
type Template = { name: string; body: string; category: string }
type AlunoExtra = {
  mentoria: string | null; indice: { score: number | null; cor: string | null } | null
  diag_ok: boolean; checkin: { semana: string; horas_cumpridas: number | null; nota_moral: number | null } | null
}

const TEMPLATES_URL = 'https://workflows.manager03.scvpgti.com.br/webhook/diana/meta/templates'
const SEND_TPL_URL = 'https://workflows.manager03.scvpgti.com.br/webhook/diana/meta/send-template'
const JANELA_MS = 24 * 60 * 60 * 1000

// janela de 24h da Meta: aberta enquanto a ÚLTIMA mensagem do aluno tem < 24h
function janela(c: Conv | null, agora: number) {
  const ts = c?.last_user_message_at ? new Date(c.last_user_message_at).getTime() : 0
  const resta = ts + JANELA_MS - agora
  if (!ts || resta <= 0) return { aberta: false, label: 'Janela fechada' }
  const h = Math.floor(resta / 3600000), m = Math.floor((resta % 3600000) / 60000)
  return { aberta: true, label: `${h}h ${String(m).padStart(2, '0')}min` }
}

const FROM_STYLE: Record<string, string> = {
  user: 'self-start bg-panel2 border-line',
  ia: 'self-end bg-teal/10 border-teal/25',
  human: 'self-end bg-gold/10 border-gold/30',
  system: 'self-center bg-panel border-line text-dim text-xs',
}

const SEL = 'id,status,agente_slug,last_message_at,last_user_message_at,contexto,' +
  'alunos(id,nome,phone,email,ficha,situacao,opted_out,status)'

const FICHA_LABELS: Record<string, string> = {
  trabalha: 'Trabalha', profissao: 'Profissão', horas_semana: 'Horas/semana',
  formacao: 'Formação', concurso_interesse: 'Concurso de interesse', notas: 'Notas',
}

export default function Inbox({ convInicial, aoConsumir }: { convInicial?: string | null; aoConsumir?: () => void } = {}) {
  const [convs, setConvs] = useState<Conv[]>([])
  const [sel, setSel] = useState<Conv | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [agentes, setAgentes] = useState<{ slug: string; nome: string }[]>([])
  const [extra, setExtra] = useState<AlunoExtra | null>(null)
  const [filtroAgente, setFiltroAgente] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroJanela, setFiltroJanela] = useState<'' | 'aberta' | 'fechada'>('')
  const [busca, setBusca] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [agora, setAgora] = useState(Date.now())
  const [tpls, setTpls] = useState<Template[]>([])
  const [selTplName, setSelTplName] = useState('')
  const [enviandoTpl, setEnviandoTpl] = useState(false)
  const [msgTpl, setMsgTpl] = useState('')
  const [infoAberto, setInfoAberto] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)

  const buscaRef = useRef('')
  buscaRef.current = busca

  const carregarConvs = async () => {
    const q = buscaRef.current.trim()
    if (q) {
      // busca NO BANCO pelo aluno (nome/telefone), não só nas 200 carregadas
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
    // sem busca: 200 recentes + TODAS as com humano (não podem sumir num dia de disparo)
    const [rec, fixas] = await Promise.all([
      supabase.from('conversas').select(SEL)
        .order('last_message_at', { ascending: false, nullsFirst: false }).limit(200),
      supabase.from('conversas').select(SEL).eq('status', 'humano')
        .order('last_message_at', { ascending: false, nullsFirst: false }).limit(200),
    ])
    const vistos = new Set<string>()
    const juntos = [...((rec.data as any) ?? []), ...((fixas.data as any) ?? [])]
      .filter((c: any) => { if (vistos.has(c.id)) return false; vistos.add(c.id); return true })
      .sort((a: any, b: any) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))
    setConvs(juntos as any)
  }

  // vindo das Escalações: abre direto a conversa do aluno
  useEffect(() => {
    if (!convInicial) return
    supabase.from('conversas').select(SEL)
      .eq('id', convInicial).single()
      .then(({ data }) => { if (data) setSel(data as any) })
    aoConsumir?.()
  }, [convInicial])

  useEffect(() => {
    carregarConvs()
    supabase.from('agentes').select('slug,nome').eq('ativo', true).order('slug')
      .then(({ data }) => setAgentes((data as any) ?? []))
    const ch = supabase.channel('inbox-convs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, carregarConvs)
      .subscribe()
    // relógio p/ contagem regressiva da janela 24h
    const t = setInterval(() => setAgora(Date.now()), 30000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [])

  // busca no banco com debounce
  useEffect(() => {
    const t = setTimeout(carregarConvs, 350)
    return () => clearTimeout(t)
  }, [busca])

  // templates aprovados: carrega quando abrir uma conversa com janela fechada
  useEffect(() => {
    if (!sel || tpls.length) return
    if (janela(sel, agora).aberta) return
    fetch(TEMPLATES_URL).then(r => r.json())
      .then(d => setTpls(d.templates ?? []))
      .catch(() => setTpls([]))
  }, [sel?.id])

  const carregarMsgs = async (convId: string) => {
    const { data } = await supabase.from('mensagens')
      .select('id,from_type,type,content,transcript,status,created_at,metadata')
      .eq('conversa_id', convId)
      .order('created_at', { ascending: true })
      .limit(300)
    setMsgs((data as any) ?? [])
  }

  // painel lateral: mentoria, índice, diagnóstico e último check-in do aluno
  const carregarExtra = async (alunoId: string) => {
    const [mat, ind, diag, chk] = await Promise.all([
      supabase.from('matriculas').select('mentorias(nome)').eq('aluno_id', alunoId)
        .eq('status', 'ativa').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('indice_aluno').select('score,cor').eq('aluno_id', alunoId).maybeSingle(),
      supabase.from('diagnosticos').select('concluido_em').eq('aluno_id', alunoId).maybeSingle(),
      supabase.from('checkins').select('semana,horas_cumpridas,nota_moral').eq('aluno_id', alunoId)
        .order('semana', { ascending: false }).limit(1).maybeSingle(),
    ])
    setExtra({
      mentoria: (mat.data as any)?.mentorias?.nome ?? null,
      indice: (ind.data as any) ?? null,
      diag_ok: !!(diag.data as any)?.concluido_em,
      checkin: (chk.data as any) ?? null,
    })
  }

  useEffect(() => {
    if (!sel) { setExtra(null); return }
    carregarMsgs(sel.id)
    if (sel.alunos?.id) carregarExtra(sel.alunos.id)
    const ch = supabase.channel(`thread-${sel.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `conversa_id=eq.${sel.id}` },
        payload => setMsgs(m => [...m, payload.new as Msg]))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sel?.id])

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  // mantém a conversa aberta em sincronia com o realtime (janela 24h, status)
  useEffect(() => {
    if (!sel) return
    const fresh = convs.find(c => c.id === sel.id)
    if (fresh && (fresh.last_user_message_at !== sel.last_user_message_at || fresh.status !== sel.status))
      setSel(fresh)
  }, [convs])

  const assumir = async () => {
    if (!sel) return
    const { error } = await supabase.from('conversas').update({ status: 'humano' }).eq('id', sel.id)
    if (error) return setErro(error.message)
    setSel({ ...sel, status: 'humano' })
  }

  const devolver = async () => {
    if (!sel) return
    const { error } = await supabase.from('conversas').update({ status: 'ia' }).eq('id', sel.id)
    if (error) return setErro(error.message)
    // escalações abertas desta conversa são resolvidas junto (mesma regra da Anne)
    await supabase.from('escalacoes').update({ status: 'resolvida', resolvida_em: new Date().toISOString() })
      .eq('conversa_id', sel.id).neq('status', 'resolvida')
    setSel({ ...sel, status: 'ia' })
  }

  const apagarConversa = async () => {
    if (!sel) return
    const nome = sel.alunos?.nome || fmtFone(sel.alunos?.phone)
    if (!window.confirm(
      `Apagar TODA a conversa com ${nome}?\n\n` +
      'Isso remove mensagens, fila de envio e escalações desta conversa. ' +
      'A ficha e o histórico do aluno (diagnóstico, check-ins) são preservados. Não dá para desfazer.')) return
    // cascade: mensagens, fila_envio, escalacoes
    await supabase.from('conversas').delete().eq('id', sel.id)
    setSel(null); setMsgs([]); carregarConvs()
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
  }

  const enviarTemplate = async () => {
    if (!sel || !selTplName || enviandoTpl) return
    setEnviandoTpl(true); setMsgTpl('')
    try {
      const r = await fetch(SEND_TPL_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversa_id: sel.id, template_name: selTplName }),
      })
      const d = await r.json()
      setMsgTpl(d.ok ? '✅ Template enviado — quando o aluno responder, a janela reabre por 24h.'
        : '⚠️ ' + (d.erro || 'Falha no envio.'))
      if (d.ok) setSelTplName('')
    } catch {
      setMsgTpl('⚠️ Falha de rede ao enviar o template.')
    }
    setEnviandoTpl(false)
  }

  const lista = convs.filter(c => {
    if (filtroAgente && c.agente_slug !== filtroAgente) return false
    if (filtroStatus && c.status !== filtroStatus) return false
    if (filtroJanela && (janela(c, agora).aberta ? 'aberta' : 'fechada') !== filtroJanela) return false
    return true
  })

  const ficha = sel?.alunos?.ficha ?? {}
  const jan = janela(sel, agora)
  // fora da base (30/07): visitante não tem Diana p/ devolver — fica sempre com o time
  const ehVisitante = sel?.alunos?.status === 'visitante'
  const primeiroNome = (sel?.alunos?.nome ?? '').trim().split(/\s+/)[0] || 'aluno(a)'
  const nomeAgente = (slug?: string | null) =>
    agentes.find(a => a.slug === slug)?.nome ?? slug ?? ''

  return (
    <div className="h-full flex">
      {/* Lista de conversas — no mobile some quando uma conversa está aberta */}
      <div className={`${sel ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 shrink-0 border-r border-line flex-col`}>
        <div className="p-3 border-b border-line space-y-2">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou telefone…"
            className="w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold/60 placeholder:text-dim/50" />
          <div className="flex gap-2">
            <select value={filtroAgente} onChange={e => setFiltroAgente(e.target.value)}
              className="flex-1 min-w-0 bg-panel border border-line rounded-lg px-2 py-1.5 text-xs text-dim focus:outline-none">
              <option value="">Todas mentorias</option>
              {agentes.map(a => <option key={a.slug} value={a.slug}>{a.nome}</option>)}
            </select>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
              className="flex-1 min-w-0 bg-panel border border-line rounded-lg px-2 py-1.5 text-xs text-dim focus:outline-none">
              <option value="">Todos status</option>
              {Object.entries(STATUS_CONV).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="flex gap-1.5 items-center">
            <span className="text-[10px] font-mono text-dim uppercase tracking-widest mr-1">Janela 24h</span>
            {([['', 'Todas'], ['aberta', '🟢 Aberta'], ['fechada', '🔴 Fechada']] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setFiltroJanela(v)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition
                  ${filtroJanela === v ? 'border-gold/60 bg-gold/10 text-cream' : 'border-line text-dim hover:text-cream'}`}>
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
                {c.alunos?.status === 'visitante' && (
                  <span className="text-[9px] px-1 py-0.5 rounded border border-gold/40 text-gold shrink-0">fora da base</span>
                )}
                <span className="font-mono text-[10px] text-dim shrink-0">{fmtHora(c.last_message_at)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_CONV[c.status]?.cls ?? 'text-dim border-line'}`}>
                  {STATUS_CONV[c.status]?.label ?? c.status}
                </span>
                {c.agente_slug && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-line text-dim truncate max-w-[130px]">
                    {nomeAgente(c.agente_slug)}
                  </span>
                )}
                <span title={janela(c, agora).aberta ? `Janela aberta · resta ${janela(c, agora).label}` : 'Janela de 24h fechada'}
                  className="text-[10px] ml-auto">{janela(c, agora).aberta ? '🟢' : '🔴'}</span>
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
              {ehVisitante && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-gold/40 text-gold bg-gold/5 shrink-0"
                  title="Não está na base de alunos — atendimento 100% humano; se comprar, vira aluno automaticamente">
                  fora da base
                </span>
              )}
              <span className={`text-[11px] font-mono px-2 py-1 rounded-lg border shrink-0 ${
                jan.aberta ? 'text-win border-win/40 bg-win/10' : 'text-danger border-danger/40 bg-danger/10'}`}
                title={jan.aberta ? 'Tempo restante da janela de 24h (conversa livre)' : 'Sem conversa livre — envie um template p/ reabrir'}>
                {jan.aberta ? `🕐 ${jan.label}` : '🔒 Janela fechada'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setInfoAberto(true)} title="Dados do aluno"
                  className="xl:hidden text-xs text-dim border border-line rounded-lg px-2.5 py-1.5 hover:text-cream transition">ℹ️</button>
                {sel.status === 'humano' ? (
                  !ehVisitante && (
                  <button onClick={devolver}
                    className="text-xs font-semibold bg-teal/15 text-teal border border-teal/40 rounded-lg px-3 py-1.5 hover:bg-teal/25 transition">
                    ↩ Devolver à Diana
                  </button>
                  )
                ) : (
                  <button onClick={assumir}
                    className="text-xs font-semibold bg-gold/15 text-gold border border-gold/40 rounded-lg px-3 py-1.5 hover:bg-gold/25 transition">
                    ✋ Assumir conversa
                  </button>
                )}
                <button onClick={apagarConversa} title="Apagar conversa (ficha do aluno é preservada)"
                  className="text-xs text-danger/80 border border-danger/30 rounded-lg px-2.5 py-1.5 hover:bg-danger/10 hover:text-danger transition">
                  🗑
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
              {erro && <div className="rise self-center text-xs rounded-lg border border-danger/40 bg-danger/10 text-danger px-3 py-2">⚠️ {erro}</div>}
              {msgTpl && (
                <div className="rise self-center text-xs rounded-lg border border-win/40 bg-win/10 text-win px-3 py-2">{msgTpl}</div>
              )}
              {msgs.map(m => (
                <div key={m.id} className={`rise max-w-[78%] border rounded-2xl px-3.5 py-2 ${FROM_STYLE[m.from_type] ?? FROM_STYLE.system}`}>
                  {m.type === 'audio' && <div className="text-[10px] font-mono text-dim mb-1">🎙 áudio transcrito</div>}
                  {m.type === 'template' && (
                    <div className="text-[10px] font-mono text-teal/80 mb-1">
                      📨 template{m.metadata?.janela_reaberta ? ' · reabertura de janela' : m.metadata?.broadcast ? ' · disparo' : ''}
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap break-words">{m.transcript || m.content}</div>
                  <div className="text-[10px] font-mono text-dim/70 mt-1 text-right">
                    {m.from_type === 'ia' ? '💎 ' : m.from_type === 'human' ? '👤 ' : ''}{fmtHora(m.created_at)}
                  </div>
                </div>
              ))}
              <div ref={fimRef} />
            </div>

            {jan.aberta ? (
              <form onSubmit={enviar} className="p-4 border-t border-line flex gap-2">
                <input value={texto} onChange={e => setTexto(e.target.value)}
                  placeholder={sel.status === 'humano' ? 'Responder como humano…' : 'Assuma a conversa para responder (Diana está atendendo)'}
                  disabled={sel.status !== 'humano'}
                  className="flex-1 bg-panel border border-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gold/60 disabled:opacity-40 placeholder:text-dim/50" />
                <button disabled={sel.status !== 'humano' || !texto.trim() || enviando}
                  className="bg-gold text-ink font-semibold rounded-xl px-5 text-sm disabled:opacity-30 hover:brightness-110 transition">
                  Enviar
                </button>
              </form>
            ) : (
              <div className="p-4 border-t border-line space-y-2">
                {sel.status !== 'humano' ? (
                  <div className="text-xs text-dim text-center py-1">
                    🔒 Janela de 24h fechada — <b className="text-cream">assuma a conversa</b> para reabrir com um template aprovado.
                  </div>
                ) : (
                  <>
                    <div className="text-[11px] text-dim">
                      🔒 Janela fechada (o aluno não manda mensagem há mais de 24h). A Meta só permite <b className="text-cream">template
                      aprovado</b> — escolha um abaixo para reabrir a conversa:
                    </div>
                    <div className="flex gap-2">
                      <select value={selTplName} onChange={e => setSelTplName(e.target.value)}
                        className="flex-1 bg-panel border border-line rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold/60">
                        <option value="">{tpls.length ? 'Escolha o template…' : 'Carregando templates…'}</option>
                        {tpls.map(t => <option key={t.name} value={t.name}>[{t.category}] {t.name}</option>)}
                      </select>
                      <button onClick={enviarTemplate} disabled={!selTplName || enviandoTpl}
                        className="bg-gold text-ink font-semibold rounded-xl px-5 text-sm disabled:opacity-30 hover:brightness-110 transition">
                        {enviandoTpl ? 'Enviando…' : '📨 Enviar template'}
                      </button>
                    </div>
                    {selTplName && (
                      <div className="text-[11px] text-dim border border-teal/25 bg-teal/5 rounded-lg px-3 py-2 whitespace-pre-wrap">
                        {(tpls.find(t => t.name === selTplName)?.body ?? '').split('{{1}}').join(primeiroNome)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Painel do aluno — fixo no desktop largo; slide-over nas telas menores */}
      {sel && infoAberto && (
        <div className="xl:hidden fixed inset-0 z-40 bg-ink/60" onClick={() => setInfoAberto(false)} />
      )}
      {sel && (
        <div className={`${infoAberto
            ? 'fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] bg-panel shadow-2xl'
            : 'hidden'} xl:static xl:block xl:w-72 xl:z-auto xl:shadow-none xl:bg-transparent shrink-0 border-l border-line overflow-y-auto p-4 space-y-4`}>
          <button onClick={() => setInfoAberto(false)}
            className="xl:hidden text-dim hover:text-cream text-lg float-right leading-none">✕</button>
          <div>
            <div className="text-[10px] font-mono text-dim uppercase tracking-widest mb-2">Aluno</div>
            <div className="font-display font-semibold text-lg">{sel.alunos?.nome || '—'}</div>
            <div className="font-mono text-xs text-dim mt-0.5">{fmtFone(sel.alunos?.phone)}</div>
            {sel.alunos?.email && <div className="font-mono text-[11px] text-dim mt-0.5 break-all">{sel.alunos.email}</div>}
          </div>
          {extra?.mentoria && (
            <div>
              <div className="text-[10px] font-mono text-dim uppercase tracking-widest mb-1">Mentoria</div>
              <div className="text-sm text-gold font-medium">{extra.mentoria}</div>
            </div>
          )}
          {extra?.indice?.cor && (
            <div className="border border-line bg-panel2/50 rounded-xl p-3">
              <div className="text-[10px] font-mono text-dim uppercase tracking-widest">Índice do aluno</div>
              <div className="text-sm mt-1 flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${COR_INDICE[extra.indice.cor]?.dot ?? 'bg-dim'}`} />
                <b>{COR_INDICE[extra.indice.cor]?.label ?? extra.indice.cor}</b>
                {extra.indice.score != null && <span className="font-mono text-xs text-dim">({extra.indice.score})</span>}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] font-mono text-dim uppercase tracking-widest mb-1">Diagnóstico</div>
            <div className={`text-sm font-medium ${extra?.diag_ok ? 'text-win' : 'text-gold'}`}>
              {extra?.diag_ok ? '✔ Concluído' : '⏳ Pendente'}
            </div>
          </div>
          {extra?.checkin && (
            <div className="border border-teal/25 bg-teal/5 rounded-xl p-3">
              <div className="text-[10px] font-mono text-teal uppercase tracking-widest">Último check-in</div>
              <div className="text-sm mt-1">
                Semana {fmtData(extra.checkin.semana)}
                {extra.checkin.horas_cumpridas != null && <> · <b>{extra.checkin.horas_cumpridas}h</b> estudadas</>}
                {extra.checkin.nota_moral != null && <> · moral <b>{extra.checkin.nota_moral}/10</b></>}
              </div>
            </div>
          )}
          {Object.keys(FICHA_LABELS).some(k => ficha[k] != null && ficha[k] !== '') && (
            <div>
              <div className="text-[10px] font-mono text-dim uppercase tracking-widest mb-2">Ficha (IA)</div>
              <div className="space-y-1.5">
                {Object.entries(FICHA_LABELS).map(([k, lbl]) => (
                  ficha[k] != null && ficha[k] !== '' && (
                    <div key={k} className="text-sm text-dim leading-relaxed">
                      <span className="text-[11px] font-mono text-dim/70">{lbl}:</span>{' '}
                      <span className="text-cream/90">{typeof ficha[k] === 'boolean' ? (ficha[k] ? 'sim' : 'não') : String(ficha[k])}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}
          {sel.alunos?.opted_out && (
            <div className="text-xs text-danger border border-danger/30 bg-danger/5 rounded-lg px-3 py-2">
              🚫 Aluno pediu PARE — não recebe mais mensagens.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
