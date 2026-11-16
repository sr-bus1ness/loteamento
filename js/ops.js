// Operações de negócio. Cada operação grava de forma atômica (update multi-caminho)
// e registra uma entrada no histórico.
import * as store from './store.js';
import { round2, addMonths, todayISO } from './util.js';
import { S } from './state.js';

const hist = (paths, tipo, desc, extra = {}) => {
  const k = store.newKey('historico');
  paths[`historico/${k}`] = { ts: Date.now(), uid: S.user?.uid || null, usuario: S.me?.nome || S.user?.email || '', tipo, desc, ...extra };
};
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// ---------------------------------------------------------------- Seed
export async function seedLotes(geo) {
  const paths = {};
  let n = 0;
  for (const emp of geo.empreendimentos) {
    paths[`empreendimentos/${emp.id}`] = { nome: emp.nome, planta: emp.planta };
    for (const l of emp.lotes) {
      if (S.lotes[l.id]) continue;
      paths[`lotes/${l.id}`] = { emp: emp.id, quadra: l.q, numero: l.n, area: l.area, status: 'disponivel', origem: 'planta', criadoEm: Date.now() };
      n++;
    }
  }
  if (!S.config?.empresa) paths['config/empresa'] = { nome: geo.proprietario, cidade: geo.municipio };
  hist(paths, 'sistema', `Importação inicial das plantas: ${n} lotes cadastrados.`);
  await store.update(paths);
  return n;
}

// ---------------------------------------------------------------- Lotes
export async function salvarLote(id, dados, isNew) {
  const paths = {};
  if (isNew) {
    paths[`lotes/${id}`] = clean({ ...dados, status: dados.status || 'disponivel', origem: 'manual', criadoEm: Date.now() });
    hist(paths, 'lote', `Lote ${dados.quadra}-${dados.numero} cadastrado.`, { loteId: id });
  } else {
    const antes = S.lotes[id] || {};
    const mud = [];
    for (const [k, v] of Object.entries(dados)) {
      paths[`lotes/${id}/${k}`] = v ?? null;
      if ((antes[k] ?? null) !== (v ?? null)) mud.push(k);
    }
    if (!mud.length) return;
    hist(paths, 'lote', `Lote ${antes.quadra}-${antes.numero} editado (${mud.join(', ')}).`, { loteId: id });
  }
  await store.update(paths);
}

export async function excluirLote(id) {
  const l = S.lotes[id];
  if (Object.values(S.vendas).some(v => v.loteId === id && v.status !== 'cancelada')) throw new Error('Lote possui venda ativa. Cancele a venda antes.');
  const paths = { [`lotes/${id}`]: null };
  hist(paths, 'lote', `Lote ${l.quadra}-${l.numero} excluído.`, { loteId: id });
  await store.update(paths);
}

export async function alterarStatus(id, status, extra = {}) {
  const l = S.lotes[id];
  if (l.vendaId && S.vendas[l.vendaId]?.status !== 'cancelada' && status !== 'vendido')
    throw new Error('Este lote tem uma venda ativa. Para liberá-lo, cancele a venda na área Financeira.');
  const paths = { [`lotes/${id}/status`]: status, [`lotes/${id}/statusEm`]: Date.now() };
  if (status === 'reservado') {
    paths[`lotes/${id}/reserva`] = clean({ compradorId: extra.compradorId || null, validade: extra.validade || null, obs: extra.obs || null, em: Date.now() });
  } else paths[`lotes/${id}/reserva`] = null;
  if (status === 'bloqueado') paths[`lotes/${id}/motivoBloqueio`] = extra.obs || null;
  else paths[`lotes/${id}/motivoBloqueio`] = null;
  hist(paths, 'status', `Lote ${l.quadra}-${l.numero}: ${l.status} → ${status}${extra.obs ? ` (${extra.obs})` : ''}.`, { loteId: id });
  await store.update(paths);
}

export async function definirPrecos(ids, calc) {
  const paths = {};
  for (const id of ids) {
    const l = S.lotes[id];
    const p = calc(l);
    paths[`lotes/${id}/valorTotal`] = p.valorTotal;
    paths[`lotes/${id}/entrada`] = p.entrada;
    paths[`lotes/${id}/numParcelas`] = p.numParcelas;
    paths[`lotes/${id}/valorParcela`] = p.valorParcela;
  }
  hist(paths, 'preco', `Condições de venda definidas para ${ids.length} lote(s).`);
  await store.update(paths);
}

// ---------------------------------------------------------------- Compradores
export async function salvarComprador(id, dados) {
  const isNew = !id;
  id = id || store.newKey('compradores');
  const paths = {};
  if (isNew) paths[`compradores/${id}`] = clean({ ...dados, criadoEm: Date.now() });
  else for (const [k, v] of Object.entries(dados)) paths[`compradores/${id}/${k}`] = v || null;
  hist(paths, 'comprador', `Comprador ${dados.nome} ${isNew ? 'cadastrado' : 'atualizado'}.`, { compradorId: id });
  await store.update(paths);
  return id;
}

export async function excluirComprador(id) {
  if (Object.values(S.vendas).some(v => v.compradorId === id)) throw new Error('Comprador possui vendas registradas e não pode ser excluído.');
  if (Object.values(S.lotes).some(l => l.reserva?.compradorId === id)) throw new Error('Comprador possui lote reservado.');
  const paths = { [`compradores/${id}`]: null };
  hist(paths, 'comprador', `Comprador ${S.compradores[id]?.nome} excluído.`, { compradorId: id });
  await store.update(paths);
}

// ---------------------------------------------------------------- Vendas
/** Gera o plano: parcela 0 = entrada; 1..n = mensais. */
export function gerarPlano({ valorTotal, entrada, numParcelas, valorParcela, dataVenda, primeiroVenc }) {
  const plano = {};
  if (entrada > 0) plano[0] = { n: 0, tipo: 'entrada', venc: dataVenda, valor: round2(entrada) };
  const saldo = round2(valorTotal - (entrada || 0));
  if (numParcelas > 0) {
    const vp = valorParcela ? round2(valorParcela) : round2(saldo / numParcelas);
    for (let i = 1; i <= numParcelas; i++) {
      let v = vp;
      if (!valorParcela && i === numParcelas) v = round2(saldo - vp * (numParcelas - 1)); // ajuste de centavos
      plano[i] = { n: i, tipo: 'parcela', venc: addMonths(primeiroVenc, i - 1), valor: v };
    }
  }
  return plano;
}

export async function registrarVenda(d) {
  const l = S.lotes[d.loteId];
  if (!l) throw new Error('Lote não encontrado.');
  if (l.status === 'vendido') throw new Error('Lote já está vendido.');
  if (l.status === 'bloqueado') throw new Error('Lote bloqueado. Altere o status antes de vender.');
  const vid = store.newKey('vendas');
  const plano = gerarPlano(d);
  const paths = {};
  paths[`vendas/${vid}`] = clean({
    loteId: d.loteId, compradorId: d.compradorId, data: d.dataVenda, valorTotal: round2(d.valorTotal),
    entrada: round2(d.entrada || 0), numParcelas: d.numParcelas, valorParcela: d.valorParcela ? round2(d.valorParcela) : (plano[1]?.valor ?? 0),
    primeiroVenc: d.primeiroVenc, obs: d.obs || null, status: 'ativa', criadoEm: Date.now(), criadoPor: S.user?.uid || null
  });
  if (d.entradaPaga && plano[0]) {
    const pid = store.newKey('pagamentos');
    paths[`pagamentos/${pid}`] = { vendaId: vid, parcela: 0, valor: plano[0].valor, data: d.dataVenda, forma: d.formaEntrada || 'Não informado', obs: 'Entrada paga no ato da venda', em: Date.now(), por: S.user?.uid || null };
    Object.assign(plano[0], { pago: true, pagoEm: d.dataVenda, valorPago: plano[0].valor, pagamentoId: pid });
  }
  if (!Object.values(plano).some(p => !p.pago)) paths[`vendas/${vid}`].status = 'quitada';
  paths[`parcelas/${vid}`] = plano;
  paths[`lotes/${d.loteId}/status`] = 'vendido';
  paths[`lotes/${d.loteId}/statusEm`] = Date.now();
  paths[`lotes/${d.loteId}/vendaId`] = vid;
  paths[`lotes/${d.loteId}/compradorId`] = d.compradorId;
  paths[`lotes/${d.loteId}/reserva`] = null;
  const c = S.compradores[d.compradorId];
  hist(paths, 'venda', `Venda do lote ${l.quadra}-${l.numero} para ${c?.nome || '—'}: total ${d.valorTotal.toFixed(2)}, entrada ${(d.entrada || 0).toFixed(2)}, ${d.numParcelas}x.`, { loteId: d.loteId, vendaId: vid, compradorId: d.compradorId });
  await store.update(paths);
  return vid;
}

function addPagamento(paths, vid, n, valor, data, forma, obs) {
  const pid = store.newKey('pagamentos');
  paths[`pagamentos/${pid}`] = clean({ vendaId: vid, parcela: n, valor: round2(valor), data, forma, obs: obs || null, em: Date.now(), por: S.user?.uid || null });
  paths[`parcelas/${vid}/${n}/pago`] = true;
  paths[`parcelas/${vid}/${n}/pagoEm`] = data;
  paths[`parcelas/${vid}/${n}/valorPago`] = round2(valor);
  paths[`parcelas/${vid}/${n}/pagamentoId`] = pid;
  return pid;
}

export async function registrarPagamento(vid, n, valor, data, forma, obs) {
  const v = S.vendas[vid]; const l = S.lotes[v.loteId];
  const paths = {};
  addPagamento(paths, vid, n, valor, data, forma, obs);
  const parcelas = S.parcelas[vid] || {};
  const restantes = Object.values(parcelas).filter(p => p && !p.pago && p.n !== +n);
  if (!restantes.length) paths[`vendas/${vid}/status`] = 'quitada';
  hist(paths, 'pagamento', `Pagamento ${+n === 0 ? 'da entrada' : `da parcela ${n}`} do lote ${l?.quadra}-${l?.numero}: ${(+valor).toFixed(2)} (${forma}).`, { loteId: v.loteId, vendaId: vid, compradorId: v.compradorId });
  await store.update(paths);
}

export async function estornarPagamento(vid, n) {
  const p = S.parcelas[vid]?.[n]; const v = S.vendas[vid]; const l = S.lotes[v.loteId];
  const paths = {
    [`parcelas/${vid}/${n}/pago`]: false, [`parcelas/${vid}/${n}/pagoEm`]: null,
    [`parcelas/${vid}/${n}/valorPago`]: null, [`parcelas/${vid}/${n}/pagamentoId`]: null
  };
  if (p?.pagamentoId) paths[`pagamentos/${p.pagamentoId}/estornado`] = Date.now();
  if (v.status === 'quitada') paths[`vendas/${vid}/status`] = 'ativa';
  hist(paths, 'pagamento', `Estorno ${+n === 0 ? 'da entrada' : `da parcela ${n}`} do lote ${l?.quadra}-${l?.numero}.`, { loteId: v.loteId, vendaId: vid });
  await store.update(paths);
}

export async function editarParcela(vid, n, venc, valor) {
  const v = S.vendas[vid]; const l = S.lotes[v.loteId];
  const paths = { [`parcelas/${vid}/${n}/venc`]: venc, [`parcelas/${vid}/${n}/valor`]: round2(valor) };
  hist(paths, 'parcela', `Parcela ${n} do lote ${l?.quadra}-${l?.numero} alterada: venc. ${venc}, valor ${(+valor).toFixed(2)}.`, { vendaId: vid, loteId: v.loteId });
  await store.update(paths);
}

export async function cancelarVenda(vid, motivo) {
  const v = S.vendas[vid]; const l = S.lotes[v.loteId];
  const paths = {
    [`vendas/${vid}/status`]: 'cancelada', [`vendas/${vid}/canceladaEm`]: Date.now(), [`vendas/${vid}/motivoCancelamento`]: motivo || null
  };
  if (l && l.vendaId === vid) {
    paths[`lotes/${v.loteId}/status`] = 'disponivel';
    paths[`lotes/${v.loteId}/vendaId`] = null;
    paths[`lotes/${v.loteId}/compradorId`] = null;
    paths[`lotes/${v.loteId}/statusEm`] = Date.now();
  }
  hist(paths, 'venda', `Venda do lote ${l?.quadra}-${l?.numero} cancelada${motivo ? `: ${motivo}` : ''}.`, { loteId: v.loteId, vendaId: vid, compradorId: v.compradorId });
  await store.update(paths);
}

// ---------------------------------------------------------------- Cálculos
export function resumoVenda(vid) {
  const v = S.vendas[vid]; const ps = Object.values(S.parcelas[vid] || {}).filter(Boolean);
  const hoje = todayISO();
  const pagas = ps.filter(p => p.pago);
  const pend = ps.filter(p => !p.pago);
  const atrasadas = pend.filter(p => p.venc < hoje);
  const recebido = round2(pagas.reduce((s, p) => s + (p.valorPago ?? p.valor), 0));
  const entradaRecebida = round2(pagas.filter(p => p.n === 0).reduce((s, p) => s + (p.valorPago ?? p.valor), 0));
  const saldo = round2((v?.valorTotal || 0) - recebido);
  const prox = pend.sort((a, b) => a.venc.localeCompare(b.venc))[0];
  return {
    recebido, entradaRecebida, saldo, prox,
    parcelasTotal: ps.filter(p => p.n > 0).length, parcelasPagas: pagas.filter(p => p.n > 0).length,
    atrasadas, valorAtrasado: round2(atrasadas.reduce((s, p) => s + p.valor, 0))
  };
}
