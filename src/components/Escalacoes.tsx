import { useEffect, useState } from 'react'
import { supabase, fmtHora, fmtFone } from '../lib/supabase'

type Esc = {
  id: string; motivo: string | null; status: string
  claimed_by: string | null; created_at: string; resolvida_em: string | null
  conversas: { id: string; status: string; alunos: { nome: string | null; phone: string | null } | null } | null
}

// GOTCHA: o workflow de alerta grava claimed_by='__avisado__' quando ninguém
// atende em 10min (dedup do aviso no grupo). Isso NÃO é atendimento humano —
// a UI trata como "aberta" e mostra só um chip discreto "equipe avisada".
const AVISADO = '__avisado__'
const atendidaPorHumano = (e: Esc) => e.status === 'atendida' && e.claimed_by !== AVISADO

export default function Escalacoes({ irParaInbox }: { irParaInbox: (convId?: string) => void }) {
  const [escs, setEscs] = useState<Esc[]>([])
  const [resolvidas, setResolvidas] = useState<Esc[]>([])
  const [verResolvidas, setVerResolvidas] = useState(false)

  const SEL = 'id,motivo,status,claimed_by,created_at,resolvida_em,conversas(id,status,alunos(nome,phone))'

  const carregar = async () => {
    const [pend, res] = await Promise.all([
      supabase.from('escalacoes').select(SEL)
        .neq('status', 'resolvida')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('escalacoes').select(SEL)
        .eq('status', 'resolvida')
        .order('resolvida_em', { ascending: false, nullsFirst: false })
        .limit(10),
    ])
    setEscs((pend.data as any) ?? [])
    setResolvidas((res.data as any) ?? [])
  }

  useEffect(() => {
    carregar()
    // realtime (mesmo mecanismo da Anne) + polling leve de reserva
    const ch = supabase.channel('escs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escalacoes' }, carregar)
      .subscribe()
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar() }, 60000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [])

  // Atender = assumir a escalação + conversa em modo humano + abrir a conversa no Inbox
  const claim = async (e: Esc) => {
    const { data: u } = await supabase.auth.getUser()
    await supabase.from('escalacoes').update({
      status: 'atendida', claimed_by: u.user?.email ?? 'operador',
    }).eq('id', e.id)
    if (e.conversas) {
      await supabase.from('conversas').update({ status: 'humano' }).eq('id', e.conversas.id)
      irParaInbox(e.conversas.id)
    }
  }

  const resolver = async (e: Esc, devolverIa: boolean) => {
    await supabase.from('escalacoes').update({
      status: 'resolvida', resolvida_em: new Date().toISOString(),
    }).eq('id', e.id)
    if (devolverIa && e.conversas) await supabase.from('conversas').update({ status: 'ia' }).eq('id', e.conversas.id)
    carregar()
  }

  const minutosAberta = (e: Esc) => Math.round((Date.now() - new Date(e.created_at).getTime()) / 60000)

  const card = (e: Esc) => {
    const aberta = e.status !== 'resolvida' && !atendidaPorHumano(e)
    return (
      <div key={e.id} className={`rise border rounded-xl p-4
        ${aberta ? 'border-danger/40 bg-danger/5' :
          atendidaPorHumano(e) ? 'border-gold/40 bg-gold/5' : 'border-line bg-panel/50'}`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">
                {e.conversas?.alunos?.nome || fmtFone(e.conversas?.alunos?.phone)}
              </span>
              <span className="font-mono text-[10px] text-dim">{fmtFone(e.conversas?.alunos?.phone)}</span>
              {aberta && (
                <span className="text-[10px] font-mono text-danger">aberta há {minutosAberta(e)} min</span>
              )}
              {aberta && e.claimed_by === AVISADO && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-line text-dim">📣 equipe avisada</span>
              )}
              {atendidaPorHumano(e) && (
                <span className="text-[10px] font-mono text-gold">com {e.claimed_by}</span>
              )}
              {e.status === 'resolvida' && (
                <span className="text-[10px] font-mono text-win">resolvida {fmtHora(e.resolvida_em)}</span>
              )}
            </div>
            {e.motivo && (
              <div className="text-sm mt-2 bg-panel2 border border-line rounded-lg px-3 py-2">{e.motivo}</div>
            )}
            <div className="font-mono text-[10px] text-dim/60 mt-2">{fmtHora(e.created_at)}</div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {aberta && (
              <button onClick={() => claim(e)}
                className="text-xs font-semibold bg-gold/15 text-gold border border-gold/40 rounded-lg px-3 py-1.5 hover:bg-gold/25 transition">
                Atender
              </button>
            )}
            {e.status !== 'resolvida' && (
              <>
                <button onClick={() => irParaInbox(e.conversas?.id)}
                  className="text-xs text-dim border border-line rounded-lg px-3 py-1.5 hover:text-cream transition">
                  Abrir no Inbox
                </button>
                <button onClick={() => resolver(e, true)} title="Resolve a escalação e devolve a conversa para a Diana"
                  className="text-xs font-semibold bg-teal/15 text-teal border border-teal/40 rounded-lg px-3 py-1.5 hover:bg-teal/25 transition">
                  Resolver + IA ↩
                </button>
                <button onClick={() => resolver(e, false)} title="Marca como resolvida e some desta tela; a conversa fica como está"
                  className="text-xs font-semibold bg-win/10 text-win border border-win/40 rounded-lg px-3 py-1.5 hover:bg-win/20 transition">
                  ✓ Encerrar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl">Escalações</h1>
      </div>

      <div className="space-y-3 max-w-3xl">
        {escs.map(card)}
        {escs.length === 0 && (
          <div className="text-center py-16 text-dim">
            <div className="text-4xl mb-3">✅</div>
            <div className="text-sm">Nenhuma escalação pendente — a Diana está dando conta.</div>
          </div>
        )}
      </div>

      {resolvidas.length > 0 && (
        <div className="space-y-3 max-w-3xl mt-6 pb-6">
          <button onClick={() => setVerResolvidas(!verResolvidas)}
            className="text-xs text-dim border border-line rounded-lg px-3 py-1.5 hover:text-cream transition">
            {verResolvidas ? '▾' : '▸'} ✅ Resolvidas recentes ({resolvidas.length})
          </button>
          {verResolvidas && resolvidas.map(card)}
        </div>
      )}
    </div>
  )
}
