// Operações gravadas no banco. Cada operação grava de forma atômica (update multi-caminho)
// e registra uma entrada no histórico.
import * as store from './store.js';
import { S } from './state.js';
import { STATUS } from './util.js';
import { statusDe, statusTabela } from './precos.js';

const hist = (paths, tipo, desc, extra = {}) => {
  const k = store.newKey('historico');
  paths[`historico/${k}`] = { ts: Date.now(), uid: S.user?.uid || null, usuario: S.me?.nome || S.user?.email || '', tipo, desc, ...extra };
};

// ---------------------------------------------------------------- Seed
export async function seedLotes(geo) {
  const paths = {};
  let n = 0;
  for (const emp of geo.empreendimentos) {
    paths[`empreendimentos/${emp.id}`] = { nome: emp.nome, planta: emp.planta };
    for (const l of emp.lotes) {
      if (S.lotes[l.id]) continue;
      paths[`lotes/${l.id}`] = { emp: emp.id, quadra: l.q, numero: l.n, area: l.area, status: statusTabela(l.id), origem: 'planta', criadoEm: Date.now() };
      n++;
    }
  }
  if (!S.config?.empresa) paths['config/empresa'] = { nome: geo.proprietario, cidade: geo.municipio };
  hist(paths, 'sistema', `Importação inicial das plantas: ${n} lotes cadastrados.`);
  await store.update(paths);
  return n;
}

// ---------------------------------------------------------------- Status
/** status: disponivel | reservado | vendido | bloqueado, ou 'tabela' para voltar ao que diz a tabela de preços. */
export async function alterarStatus(id, status) {
  const g = S.geoIndex[id];
  const antes = statusDe(id);
  const paths = {};
  const base = `lotes/${id}`;
  paths[`${base}/emp`] = g.emp; paths[`${base}/quadra`] = g.q; paths[`${base}/numero`] = g.n;
  if (status === 'tabela') {
    paths[`${base}/status`] = statusTabela(id);
    paths[`${base}/statusEm`] = null;
  } else {
    paths[`${base}/status`] = status;
    paths[`${base}/statusEm`] = Date.now();
  }
  const depois = status === 'tabela' ? statusTabela(id) : status;
  const lbl = s => STATUS[s]?.label || s;
  hist(paths, 'status', `Lote ${g.q}-${String(g.n).padStart(2, '0')} (${g.emp === 'E1' ? 'Esperança I' : 'Esperança II'}): ${lbl(antes)} → ${lbl(depois)}${status === 'tabela' ? ' (conforme tabela)' : ''}.`, { loteId: id });
  await store.update(paths);
}
