// Preços das tabelas (data/precos.json) e status efetivo de cada lote.
import { S } from './state.js';
import { round2 } from './util.js';

let idx = {};

/** Monta o índice id do lote -> condição de venda. */
export function carregarPrecos(tab) {
  idx = {};
  const N = tab.parcelas, pct = tab.entradaPct;
  for (const emp of ['E1', 'E2']) {
    const t = tab[emp]; if (!t) continue;
    for (const [q, d] of Object.entries(t.quadras)) {
      const cond = {};
      for (const n of d.lotes) cond[n] = { parcela: d.parcela, entrada: null };
      for (const x of d.excecoes || []) for (const n of x.lotes) cond[n] = { parcela: x.parcela, entrada: x.entrada ?? null };
      for (const [n, c] of Object.entries(cond)) {
        const total = round2(N * c.parcela + (c.entrada || 0));
        idx[`${emp}-${q}-${String(n).padStart(2, '0')}`] = {
          parcela: c.parcela, numParcelas: N, total,
          entrada: c.entrada ?? round2(total * pct / 100),
          entradaPct: c.entrada == null ? pct : null,
          atualizada: t.atualizada
        };
      }
    }
  }
}

export const precoDe = id => idx[id] || null;

/** Status padrão vem da tabela; o administrador pode sobrescrever (statusEm marca a alteração manual). */
export const statusTabela = id => (idx[id] ? 'disponivel' : 'bloqueado');
export function statusDe(id) {
  const l = S.lotes[id];
  return l?.statusEm ? l.status : statusTabela(id);
}
