import { useEffect, useState } from 'react'
import { supabase, fmtFone } from '../lib/supabase'

// Caso "fora da base com segundo número": aluno real cujo WhatsApp difere do
// telefone da Hubla. Este modal busca o cadastro ATIVO e chama a RPC
// fn_vincular_visitante, que faz tudo no banco (migra/funde a conversa,
// registra o telefone alternativo, resolve a escalação 📵, apaga o stub
// visitante e registra a interação). Compartilhado por Escalações e Inbox.

type AlunoAtivo = {
  id: string; nome: string | null; phone: string | null
  email: string | null; situacao: string | null
}

export type ResultadoVinculo = {
  ok?: boolean; conversa_id?: string | null
  telefone?: string | null; msgs_fundidas?: number | null
}

export default function VincularAluno({ visitanteId, visitanteNome, visitantePhone, aoFechar, aoVincular }: {
  visitanteId: string
  visitanteNome?: string | null
  visitantePhone?: string | null
  aoFechar: () => void
  aoVincular: (r: ResultadoVinculo) => void
}) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<AlunoAtivo[]>([])
  const [buscando, setBuscando] = useState(false)
  const [alvo, setAlvo] = useState<AlunoAtivo | null>(null)
  const [vinculando, setVinculando] = useState(false)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState<ResultadoVinculo | null>(null)

  // busca de alunos ativos no banco, com debounce
  useEffect(() => {
    const q = busca.trim()
    if (q.length < 2) { setResultados([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      // caracteres reservados da sintaxe or() do PostgREST viram espaço
      const safe = q.replace(/[,()%]/g, ' ').trim()
      const { data } = await supabase.from('alunos')
        .select('id,nome,phone,email,situacao')
        .eq('status', 'ativo')
        .or(`nome.ilike.*${safe}*,email.ilike.*${safe}*,phone.ilike.*${safe}*`)
        .limit(10)
      setResultados((data as any) ?? [])
      setBuscando(false)
    }, 350)
    return () => clearTimeout(t)
  }, [busca])

  const confirmar = async () => {
    if (!alvo || vinculando) return
    setVinculando(true); setErro('')
    const { data: u } = await supabase.auth.getUser()
    const { data, error } = await supabase.rpc('fn_vincular_visitante', {
      p_visitante: visitanteId, p_aluno: alvo.id, p_por: u.user?.email ?? 'operador',
    })
    setVinculando(false)
    if (error) { setErro(error.message); return }
    const r = (data as ResultadoVinculo) ?? {}
    setFeito(r)
    aoVincular(r) // pai recarrega os dados; o modal fica no flash de sucesso
  }

  const fone = fmtFone(visitantePhone) || 'este número'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/60" onClick={aoFechar} />
      <div className="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
        <div className="rise pointer-events-auto w-full max-w-md bg-panel border border-line rounded-xl shadow-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <h2 className="font-display font-bold text-lg leading-tight">🔗 Vincular a aluno</h2>
              <div className="text-xs text-dim mt-1">
                <span className="font-mono text-cream/90">{fone}</span>
                {visitanteNome && <> · {visitanteNome}</>}
                {' '}<span className="text-gold">— fora da base</span>
              </div>
            </div>
            <button onClick={aoFechar} className="ml-auto text-dim hover:text-cream text-xl leading-none">✕</button>
          </div>

          {erro && (
            <div className="rise text-xs rounded-lg border border-danger/40 bg-danger/10 text-danger px-3 py-2">
              ⚠️ Não deu para vincular: {erro}
            </div>
          )}

          {feito ? (
            <div className="space-y-4">
              <div className="rise text-sm rounded-xl border border-win/40 bg-win/10 text-win px-4 py-3 leading-relaxed">
                ✅ WhatsApp <b className="font-mono">{fmtFone(feito.telefone) || fone}</b> vinculado
                a <b>{alvo?.nome || 'aluno'}</b>.
                {(feito.msgs_fundidas ?? 0) > 0 && <> {feito.msgs_fundidas} mensagens fundidas na conversa dele.</>}
                {' '}A Diana assume a partir de agora.
              </div>
              <button onClick={aoFechar}
                className="w-full bg-gold text-ink font-semibold rounded-xl px-5 py-2.5 text-sm hover:brightness-110 transition">
                Fechar
              </button>
            </div>
          ) : alvo ? (
            <div className="space-y-4">
              <div className="text-sm leading-relaxed border border-gold/40 bg-gold/5 rounded-xl px-4 py-3">
                Vincular o WhatsApp <b className="font-mono">{fone}</b> ao aluno{' '}
                <b>{alvo.nome || fmtFone(alvo.phone)}</b>?
                <div className="text-xs text-dim mt-1.5">
                  A conversa passa para o cadastro dele e a Diana assume.
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setAlvo(null); setErro('') }} disabled={vinculando}
                  className="text-xs text-dim border border-line rounded-xl px-4 py-2.5 hover:text-cream transition disabled:opacity-40">
                  ← Voltar
                </button>
                <button onClick={confirmar} disabled={vinculando}
                  className="flex-1 bg-gold text-ink font-semibold rounded-xl px-5 py-2.5 text-sm disabled:opacity-40 hover:brightness-110 transition">
                  {vinculando ? 'Vinculando…' : '🔗 Vincular'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input autoFocus value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar aluno ativo por nome, e-mail ou telefone…"
                className="w-full bg-panel2 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold/60 placeholder:text-dim/50" />
              <div className="max-h-72 overflow-y-auto space-y-1">
                {resultados.map(a => (
                  <button key={a.id} onClick={() => { setAlvo(a); setErro('') }}
                    className="w-full text-left border border-line bg-panel2/40 rounded-lg px-3 py-2.5 hover:bg-panel2 hover:border-gold/40 transition">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${a.situacao === 'inadimplente' ? 'bg-danger' : 'bg-win'}`}
                        title={a.situacao || 'situação desconhecida'} />
                      <span className="font-medium text-sm truncate">{a.nome || 'Sem nome'}</span>
                      <span className="ml-auto font-mono text-[10px] text-dim shrink-0">{fmtFone(a.phone)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-dim">
                      {a.email && <span className="font-mono truncate">{a.email}</span>}
                      {a.situacao && (
                        <span className={`ml-auto shrink-0 ${a.situacao === 'inadimplente' ? 'text-danger' : 'text-win'}`}>
                          {a.situacao}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
                {buscando && <div className="text-center text-dim text-xs font-mono py-3">buscando…</div>}
                {!buscando && busca.trim().length >= 2 && resultados.length === 0 && (
                  <div className="text-center text-dim text-xs py-3">Nenhum aluno ativo encontrado.</div>
                )}
                {busca.trim().length < 2 && (
                  <div className="text-center text-dim/60 text-xs py-3">
                    Digite pelo menos 2 caracteres para buscar no cadastro.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
