import { createClient } from '@supabase/supabase-js'

// Chave publishable (pública por design). A segurança do painel vem do
// Supabase Auth + RLS fn_is_operator() no banco.
export const SUPABASE_URL = 'https://nbyiabyrgjukaqeowhlr.supabase.co'
export const ANON_KEY = 'COLE_A_CHAVE_AQUI'

// Enquanto a chave for o placeholder, o App mostra a tela de configuração.
export const keyConfigurada = ANON_KEY !== 'COLE_A_CHAVE_AQUI' && ANON_KEY.length > 20

export const supabase = createClient(SUPABASE_URL, ANON_KEY)

export const STATUS_CONV: Record<string, { label: string; cls: string }> = {
  ia: { label: 'Diana atendendo', cls: 'text-teal border-teal/40 bg-teal/10' },
  humano: { label: 'Com humano', cls: 'text-gold border-gold/40 bg-gold/10' },
  pausada: { label: 'Pausada', cls: 'text-dim border-line bg-panel2' },
  opted_out: { label: 'Opt-out', cls: 'text-danger border-danger/40 bg-danger/10' },
}

export const COR_INDICE: Record<string, { dot: string; label: string }> = {
  verde: { dot: 'bg-win', label: 'Em dia' },
  amarelo: { dot: 'bg-gold', label: 'Atenção' },
  vermelho: { dot: 'bg-danger', label: 'Crítico' },
  cinza: { dot: 'bg-dim', label: 'Sem dados' },
}

export const STATUS_ROTA: Record<string, string> = {
  proposta: 'text-gold border-gold/40 bg-gold/10',
  ativa: 'text-win border-win/40 bg-win/10',
  concluida: 'text-teal border-teal/40 bg-teal/10',
  rejeitada: 'text-danger border-danger/40 bg-danger/10',
  encerrada: 'text-dim border-line bg-panel2',
}

export function fmtHora(ts?: string | null) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function fmtData(d?: string | null) {
  if (!d) return ''
  const dt = d.length === 10 ? new Date(d + 'T12:00:00') : new Date(d)
  return dt.toLocaleDateString('pt-BR')
}

export function fmtFone(p?: string | null) {
  const d = String(p || '').replace(/\D/g, '')
  if (d.length >= 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}`
  return p || ''
}
