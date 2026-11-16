import { S, can, empCurto } from '../state.js';
import { esc, brl, dateBR, todayISO, loteShort, norm, download, addMonths } from '../util.js';
import { formVenda, detalheVenda, formPagamento } from '../forms.js';
import { resumoVenda } from '../ops.js';
import { calcular } from './painel.js';

let el, aba = 'vendas', busca = '', fSit = '', de = '', ate = '';

function mount(e, params = {}) {
  el = e;
  if (!de) { de = addMonths(todayISO(), -1).slice(0, 8) + '01'; ate = todayISO(); }
  el.innerHTML = `<div id="fKpi"></div>
    <div class="tabs" id="fTabs">
      <button type="button" data-a="vendas">Vendas</button>
      <button type="button" data-a="parcelas">Parcelas a receber</button>
      <button type="button" data-a="recebimentos">Recebimentos</button>
    </div>
    <div class="list-actions" id="fCtl"></div>
    <div id="fOut"></div>`;
  el.querySelector('#fTabs').onclick = ev => { const b = ev.target.closest('button'); if (!b) return; aba = b.dataset.a; fSit = ''; controls(); refresh(); };
  controls(); refresh();
  if (params.venda && S.vendas[params.venda]) setTimeout(() => detalheVenda(params.venda), 50);
}

function controls() {
  const c = el.querySelector('#fCtl');
  el.querySelectorAll('#fTabs button').forEach(b => b.classList.toggle('active', b.dataset.a === aba));
  const sits = { vendas: [['', 'Todas'], ['ativa', 'Ativas'], ['atraso', 'Em atraso'], ['quitada', 'Quitadas'], ['cancelada', 'Canceladas']], parcelas: [['', 'Todas pendentes'], ['atraso', 'Atrasadas'], ['30', 'Vencem em 30 dias'], ['mes', 'Vencem este mês']] };
  c.innerHTML = `<input class="input" type="search" id="fBusca" placeholder="Buscar comprador ou lote (ex.: A-12)" style="flex:1;min-width:180px" value="${esc(busca)}">
    ${sits[aba] ? `<select class="input" id="fSit" style="width:auto">${sits[aba].map(([k, t]) => `<option value="${k}" ${fSit === k ? 'selected' : ''}>${t}</option>`).join('')}</select>` : ''}
    ${aba === 'recebimentos' ? `<label class="small muted">De <input class="input" type="date" id="fDe" value="${de}" style="width:auto"></label><label class="small muted">até <input class="input" type="date" id="fAte" value="${ate}" style="width:auto"></label>` : ''}
    <button class="btn" id="fCsv">Exportar CSV</button>
    ${can.edit() && aba === 'vendas' ? '<button class="btn primary" id="fNova">+ Registrar venda</button>' : ''}`;
  let t; c.querySelector('#fBusca').oninput = ev => { clearTimeout(t); t = setTimeout(() => { busca = ev.target.value; refresh(); }, 200); };
  c.querySelector('#fSit')?.addEventListener('change', ev => { fSit = ev.target.value; refresh(); });
  c.querySelector('#fDe')?.addEventListener('change', ev => { de = ev.target.value; refresh(); });
  c.querySelector('#fAte')?.addEventListener('change', ev => { ate = ev.target.value; refresh(); });
  c.querySelector('#fNova')?.addEventListener('click', () => formVenda(null));
  c.querySelector('#fCsv').onclick = () => exportar();
}

const matchBusca = (v) => {
  if (!busca) return true;
  const q = norm(busca); const l = S.lotes[v.loteId]; const c = S.compradores[v.compradorId];
  const ql = q.replace(/\s|-/g, '');
  return norm(c?.nome).includes(q) || norm(c?.cpf).includes(q) || (l && norm(l.quadra + String(l.numero).padStart(2, '0')) === ql) || (l && norm(l.quadra + l.numero) === ql);
};

let linhas = [];  // para CSV
function refresh() {
  if (!el) return;
  const k = calcular('all');
  el.querySelector('#fKpi').innerHTML = `<div class="grid kpis" style="margin-bottom:14px">
    <div class="card kpi"><div class="label">Total vendido</div><div class="value money">${brl(k.vendido)}</div></div>
    <div class="card kpi"><div class="label">Recebido</div><div class="value money" style="color:var(--primary)">${brl(k.recebido)}</div></div>
    <div class="card kpi"><div class="label">Saldo a receber</div><div class="value money">${brl(k.pendente)}</div></div>
    <div class="card kpi"><div class="label">Em atraso</div><div class="value money" style="color:var(--danger)">${brl(k.atrasado)}</div><div class="sub">${k.nAtras} parcela(s)</div></div></div>`;
  const out = el.querySelector('#fOut');
  const hoje = todayISO();
  if (aba === 'vendas') {
    let vs = Object.entries(S.vendas).map(([vid, v]) => ({ vid, v, r: resumoVenda(vid) })).filter(x => matchBusca(x.v));
    if (fSit === 'atraso') vs = vs.filter(x => x.v.status === 'ativa' && x.r.atrasadas.length);
    else if (fSit) vs = vs.filter(x => x.v.status === fSit);
    vs.sort((a, b) => (b.v.data || '').localeCompare(a.v.data || ''));
    linhas = [['data', 'loteamento', 'lote', 'comprador', 'valor_total', 'entrada', 'parcelas', 'valor_parcela', 'recebido', 'saldo', 'parcelas_pagas', 'em_atraso', 'situacao'],
      ...vs.map(({ v, r }) => { const l = S.lotes[v.loteId]; return [v.data, empCurto(l?.emp), loteShort(l), S.compradores[v.compradorId]?.nome, v.valorTotal, v.entrada, v.numParcelas, v.valorParcela, r.recebido, r.saldo, r.parcelasPagas, r.valorAtrasado, v.status]; })];
    out.innerHTML = vs.length ? `<div class="table-wrap"><table class="t">
      <thead><tr><th>Data</th><th>Lote</th><th>Comprador</th><th class="num">Total</th><th class="num">Entrada</th><th class="num">Recebido</th><th class="num">Saldo devedor</th><th>Parcelas</th><th>Próx. venc.</th><th>Situação</th></tr></thead>
      <tbody>${vs.map(({ vid, v, r }) => { const l = S.lotes[v.loteId]; return `<tr class="click" data-v="${vid}">
        <td>${dateBR(v.data)}</td><td>${esc(empCurto(l?.emp))} ${loteShort(l)}</td><td>${esc(S.compradores[v.compradorId]?.nome || '—')}</td>
        <td class="num money">${brl(v.valorTotal)}</td><td class="num money">${brl(v.entrada)}</td><td class="num money">${brl(r.recebido)}</td><td class="num money">${brl(r.saldo)}</td>
        <td>${r.parcelasPagas}/${r.parcelasTotal}${v.valorParcela ? ` <span class="small muted">× ${brl(v.valorParcela)}</span>` : ''}</td>
        <td>${v.status === 'ativa' && r.prox ? dateBR(r.prox.venc) : '—'}</td>
        <td>${v.status === 'cancelada' ? '<span class="badge b-neutral">Cancelada</span>' : v.status === 'quitada' ? '<span class="badge b-ok">Quitada</span>' : r.atrasadas.length ? `<span class="badge b-atraso">${r.atrasadas.length} em atraso</span>` : '<span class="badge b-ok">Em dia</span>'}</td></tr>`; }).join('')}</tbody></table></div>`
      : `<div class="card empty">${Object.keys(S.vendas).length ? 'Nenhuma venda com estes filtros.' : 'Nenhuma venda registrada ainda. Use “Registrar venda” aqui ou a partir de um lote no mapa.'}</div>`;
    out.onclick = ev => { const r = ev.target.closest('[data-v]'); if (r) detalheVenda(r.dataset.v); };
  } else if (aba === 'parcelas') {
    const em30 = addMonths(hoje, 0) && new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const mes = hoje.slice(0, 7);
    let ps = [];
    for (const [vid, v] of Object.entries(S.vendas)) {
      if (v.status === 'cancelada' || !matchBusca(v)) continue;
      for (const p of Object.values(S.parcelas[vid] || {})) if (p && !p.pago) ps.push({ vid, v, p });
    }
    if (fSit === 'atraso') ps = ps.filter(x => x.p.venc < hoje);
    if (fSit === '30') ps = ps.filter(x => x.p.venc >= hoje && x.p.venc <= em30);
    if (fSit === 'mes') ps = ps.filter(x => x.p.venc.slice(0, 7) === mes);
    ps.sort((a, b) => a.p.venc.localeCompare(b.p.venc));
    const total = ps.reduce((s, x) => s + x.p.valor, 0);
    linhas = [['vencimento', 'loteamento', 'lote', 'comprador', 'telefone', 'parcela', 'valor', 'dias_atraso'],
      ...ps.map(({ v, p }) => { const l = S.lotes[v.loteId]; const c = S.compradores[v.compradorId]; return [p.venc, empCurto(l?.emp), loteShort(l), c?.nome, c?.telefone, p.n === 0 ? 'Entrada' : p.n, p.valor, p.venc < hoje ? Math.round((new Date(hoje) - new Date(p.venc)) / 864e5) : 0]; })];
    out.innerHTML = ps.length ? `<div class="table-wrap"><table class="t">
      <thead><tr><th>Vencimento</th><th>Lote</th><th>Comprador</th><th>Telefone</th><th>Parcela</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody>${ps.slice(0, 500).map(({ vid, v, p }) => { const l = S.lotes[v.loteId]; const c = S.compradores[v.compradorId]; const dias = p.venc < hoje ? Math.round((new Date(hoje) - new Date(p.venc)) / 864e5) : 0; return `<tr>
        <td>${dateBR(p.venc)}</td><td>${esc(empCurto(l?.emp))} ${loteShort(l)}</td><td class="click" data-v="${vid}" style="cursor:pointer;text-decoration:underline dotted">${esc(c?.nome || '—')}</td><td>${esc(c?.telefone || '')}</td>
        <td>${p.n === 0 ? 'Entrada' : `${p.n}/${v.numParcelas}`}</td><td class="num money">${brl(p.valor)}</td>
        <td>${dias ? `<span class="badge b-atraso">${dias} dia(s) de atraso</span>` : '<span class="badge b-neutral">A vencer</span>'}</td>
        <td class="num">${can.edit() ? `<button class="btn sm primary" data-pg="${vid}|${p.n}">Receber</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="small muted">${ps.length} parcela(s) · total ${brl(total)}${ps.length > 500 ? ' · exibindo as 500 primeiras' : ''}</p>`
      : '<div class="card empty">Nenhuma parcela pendente com estes filtros.</div>';
    out.onclick = ev => {
      const b = ev.target.closest('[data-pg]'); if (b) { const [vid, n] = b.dataset.pg.split('|'); formPagamento(vid, +n); return; }
      const r = ev.target.closest('[data-v]'); if (r) detalheVenda(r.dataset.v);
    };
  } else {
    let pg = Object.entries(S.pagamentos).map(([pid, p]) => ({ pid, p, v: S.vendas[p.vendaId] })).filter(x => x.v && matchBusca(x.v) && (!de || x.p.data >= de) && (!ate || x.p.data <= ate));
    pg.sort((a, b) => (b.p.data || '').localeCompare(a.p.data || '') || b.p.em - a.p.em);
    const validos = pg.filter(x => !x.p.estornado);
    const total = validos.reduce((s, x) => s + x.p.valor, 0);
    const porForma = {}; for (const x of validos) porForma[x.p.forma || '—'] = (porForma[x.p.forma || '—'] || 0) + x.p.valor;
    linhas = [['data', 'loteamento', 'lote', 'comprador', 'referente', 'valor', 'forma', 'estornado', 'obs'],
      ...pg.map(({ p, v }) => { const l = S.lotes[v.loteId]; return [p.data, empCurto(l?.emp), loteShort(l), S.compradores[v.compradorId]?.nome, p.parcela === 0 ? 'Entrada' : 'Parcela ' + p.parcela, p.valor, p.forma, p.estornado ? 'sim' : '', p.obs]; })];
    out.innerHTML = `<div class="card" style="margin-bottom:12px"><b>Total recebido no período: ${brl(total)}</b><div class="legend">${Object.entries(porForma).map(([f, v]) => `<span>${esc(f)}: ${brl(v)}</span>`).join('')}</div></div>
      ${pg.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Data</th><th>Lote</th><th>Comprador</th><th>Referente</th><th class="num">Valor</th><th>Forma</th><th>Obs.</th></tr></thead>
      <tbody>${pg.map(({ p, v }) => { const l = S.lotes[v.loteId]; return `<tr class="click" data-v="${p.vendaId}" ${p.estornado ? 'style="opacity:.55"' : ''}><td>${dateBR(p.data)}</td><td>${esc(empCurto(l?.emp))} ${loteShort(l)}</td><td>${esc(S.compradores[v.compradorId]?.nome || '—')}</td><td>${p.parcela === 0 ? 'Entrada' : 'Parcela ' + p.parcela}${p.estornado ? ' <span class="badge b-neutral">estornado</span>' : ''}</td><td class="num money">${brl(p.valor)}</td><td>${esc(p.forma || '')}</td><td class="small">${esc(p.obs || '')}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="card empty">Nenhum recebimento no período.</div>'}`;
    out.onclick = ev => { const r = ev.target.closest('[data-v]'); if (r) detalheVenda(r.dataset.v); };
  }
}

function exportar() {
  const csv = linhas.map(r => r.map(x => x == null ? '' : typeof x === 'number' ? String(x).replace('.', ',') : `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  download(`financeiro-${aba}-${todayISO()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}

export default { mount, refresh, unmount() { el = null; } };
