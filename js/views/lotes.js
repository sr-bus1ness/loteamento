import { S, can, lotesDoEmp, sortLotes, empCurto, localStorageSet } from '../state.js';
import { esc, brl, num, STATUS, badge, loteShort, modal, toast, fval, parseMoney, round2, download, confirmDlg } from '../util.js';
import { valoresLote, loteDetalheHTML, loteAcoesHTML, bindLoteAcoes, formLote, buscarLotes } from '../forms.js';
import { definirPrecos } from '../ops.js';
import { empSeg } from './painel.js';

let el, modo = 'quadras', fStatus = '', fQuadra = '', busca = '';

function filtrados() {
  let l = lotesDoEmp(S.emp);
  if (fStatus) l = l.filter(x => x.status === fStatus);
  if (fQuadra) l = l.filter(x => x.quadra === fQuadra);
  if (busca) l = buscarLotes(busca, l);
  return sortLotes(l);
}

function mount(e) {
  el = e;
  el.innerHTML = `
    <div class="list-actions">
      ${empSeg(S.emp)}
      <div class="seg" id="lModo"><button type="button" data-m="quadras">Por quadra</button><button type="button" data-m="tabela">Tabela</button></div>
      <span class="spacer"></span>
      ${can.edit() ? '<button class="btn" id="lPreco">Definir preços</button><button class="btn primary" id="lNovo">+ Novo lote</button>' : ''}
    </div>
    <div class="list-actions">
      <input class="input" id="lBusca" type="search" placeholder="Buscar: A-12, 12, quadra B, comprador…" style="flex:1;min-width:180px" value="${esc(busca)}">
      <select class="input" id="lStatus" style="width:auto"><option value="">Todos os status</option>${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${fStatus === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      <select class="input" id="lQuadra" style="width:auto"></select>
      <button class="btn" id="lCsv" title="Exportar CSV">Exportar CSV</button>
    </div>
    <div id="lOut"></div>`;
  el.querySelector('[data-seg]').onclick = ev => { const b = ev.target.closest('button'); if (!b) return; S.emp = b.dataset.v; if (S.emp !== 'all') localStorageSet('emp', S.emp); fQuadra = ''; mount(el); };
  el.querySelector('#lModo').onclick = ev => { const b = ev.target.closest('button'); if (!b) return; modo = b.dataset.m; refresh(); };
  let t; el.querySelector('#lBusca').oninput = ev => { clearTimeout(t); t = setTimeout(() => { busca = ev.target.value; refresh(); }, 200); };
  el.querySelector('#lStatus').onchange = ev => { fStatus = ev.target.value; refresh(); };
  el.querySelector('#lQuadra').onchange = ev => { fQuadra = ev.target.value; refresh(); };
  el.querySelector('#lCsv').onclick = exportCsv;
  el.querySelector('#lNovo')?.addEventListener('click', () => formLote(null));
  el.querySelector('#lPreco')?.addEventListener('click', formPrecos);
  refresh();
}

function refresh() {
  if (!el) return;
  el.querySelectorAll('#lModo button').forEach(b => b.classList.toggle('active', b.dataset.m === modo));
  const qs = [...new Set(lotesDoEmp(S.emp).map(l => l.quadra))].sort();
  el.querySelector('#lQuadra').innerHTML = `<option value="">Todas as quadras</option>${qs.map(q => `<option ${q === fQuadra ? 'selected' : ''}>${esc(q)}</option>`).join('')}`;
  const ls = filtrados();
  const out = el.querySelector('#lOut');
  if (!ls.length) { out.innerHTML = '<div class="card empty">Nenhum lote encontrado com estes filtros.</div>'; return; }
  if (modo === 'quadras') {
    const grupos = {};
    for (const l of ls) (grupos[`${l.emp}|${l.quadra}`] ||= []).push(l);
    out.innerHTML = `<div class="grid">${Object.entries(grupos).map(([k, g]) => {
      const [e, q] = k.split('|');
      const area = g.reduce((s, l) => s + (l.area || 0), 0);
      return `<div class="card"><div class="row" style="margin-bottom:10px"><b>${S.emp === 'all' ? esc(empCurto(e)) + ' · ' : ''}Quadra ${esc(q)}</b><span class="muted small">${g.length} lote(s) · ${num(area)} m²</span></div>
        <div class="qgrid">${g.map(l => `<button type="button" class="qcell ${l.status}" data-id="${l.id}" title="${loteShort(l)} · ${STATUS[l.status]?.label}">${String(l.numero).padStart(2, '0')}</button>`).join('')}</div></div>`;
    }).join('')}</div>
    <div class="legend">${Object.entries(STATUS).map(([k, s]) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>`;
  } else {
    out.innerHTML = `<div class="table-wrap"><table class="t">
      <thead><tr>${S.emp === 'all' ? '<th>Loteamento</th>' : ''}<th>Quadra</th><th>Lote</th><th class="num">Área m²</th><th>Status</th><th class="num">Valor total</th><th class="num">Entrada</th><th class="num">Parcelas</th><th class="num">Valor parcela</th><th>Comprador</th></tr></thead>
      <tbody>${ls.map(l => { const v = valoresLote(l); const c = v.compradorId ? S.compradores[v.compradorId] : null; return `<tr class="click" data-id="${l.id}">
        ${S.emp === 'all' ? `<td>${esc(empCurto(l.emp))}</td>` : ''}<td>${esc(l.quadra)}</td><td>${String(l.numero).padStart(2, '0')}</td><td class="num">${num(l.area)}</td><td>${badge(l.status)}</td>
        <td class="num money">${brl(v.valorTotal)}</td><td class="num money">${brl(v.entrada)}</td><td class="num">${v.numParcelas ?? '—'}</td><td class="num money">${brl(v.valorParcela)}</td><td>${esc(c?.nome || '')}</td></tr>`; }).join('')}</tbody>
    </table></div><p class="small muted">${ls.length} lote(s)</p>`;
  }
  out.onclick = ev => { const d = ev.target.closest('[data-id]'); if (d) abrir(d.dataset.id); };
}

function abrir(id) {
  modal({
    title: 'Lote', body: `${loteDetalheHTML(id)}${loteAcoesHTML(id)}<p style="margin-top:12px"><a href="#/mapa?lote=${encodeURIComponent(id)}" data-mapa>${S.geoIndex[id] ? 'Ver no mapa →' : ''}</a></p>`,
    onOpen: (f, close) => { bindLoteAcoes(f, id); f.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => close(null))); f.querySelector('[data-mapa]').onclick = () => close(null); }
  });
}

async function formPrecos() {
  const ls = filtrados().filter(l => l.status !== 'vendido');
  if (!ls.length) return toast('Nenhum lote não vendido nos filtros atuais.', true);
  const body = `<div class="notice info">Será aplicado aos <b>${ls.length} lote(s) não vendidos</b> que aparecem com os filtros atuais (${S.emp === 'all' ? 'todos os loteamentos' : esc(empCurto(S.emp))}${fQuadra ? ', quadra ' + esc(fQuadra) : ''}${fStatus ? ', ' + STATUS[fStatus].label.toLowerCase() : ''}). Vendas já registradas não são alteradas.</div>
    <div class="field"><label>Base de cálculo</label><select class="input" name="base"><option value="fixo">Valor fixo por lote</option><option value="m2">Valor por m² (usa a área da planta)</option></select></div>
    <div class="form-grid">
      <div class="field"><label id="lbBase">Valor do lote (R$)</label><input class="input" name="valor" inputmode="decimal" required></div>
      <div class="field"><label>Entrada (%)</label><input class="input" name="entPct" inputmode="decimal" placeholder="ou valor fixo ao lado"></div>
      <div class="field"><label>Entrada fixa (R$)</label><input class="input" name="entFixa" inputmode="decimal"></div>
      <div class="field"><label>Nº de parcelas</label><input class="input" name="np" type="number" min="0" required></div>
    </div>
    <div id="pPrev" class="small muted"></div>`;
  const calc = f => {
    const base = fval(f, 'base'), valor = parseMoney(fval(f, 'valor')), ep = parseMoney(fval(f, 'entPct')), ef = parseMoney(fval(f, 'entFixa')), np = parseInt(fval(f, 'np')) || 0;
    return l => {
      const vt = round2(base === 'm2' ? valor * (l.area || 0) : valor);
      const en = round2(ef != null ? ef : ep != null ? vt * ep / 100 : 0);
      return { valorTotal: vt, entrada: en, numParcelas: np, valorParcela: np ? round2((vt - en) / np) : 0 };
    };
  };
  await modal({ title: 'Definir condições de venda', body,
    onOpen: f => {
      const prev = () => {
        f.querySelector('#lbBase').textContent = fval(f, 'base') === 'm2' ? 'Valor por m² (R$)' : 'Valor do lote (R$)';
        if (!parseMoney(fval(f, 'valor'))) { f.querySelector('#pPrev').textContent = ''; return; }
        const p = calc(f)(ls[0]);
        f.querySelector('#pPrev').innerHTML = `Exemplo (${loteShort(ls[0])}, ${num(ls[0].area)} m²): total ${brl(p.valorTotal)}, entrada ${brl(p.entrada)}, ${p.numParcelas}x de ${brl(p.valorParcela)}.`;
      };
      f.addEventListener('input', prev); f.addEventListener('change', prev);
    },
    actions: [{ label: 'Cancelar' }, { label: 'Aplicar', cls: 'primary', submit: true, onClick: async f => {
      if (!parseMoney(fval(f, 'valor'))) { toast('Informe o valor.', true); return false; }
      if (!await confirmDlg('Confirmar', `Aplicar as condições a ${ls.length} lote(s)?`)) return false;
      await definirPrecos(ls.map(l => l.id), calc(f));
      toast('Condições de venda aplicadas.');
    } }] });
}

function exportCsv() {
  const ls = filtrados();
  const head = ['loteamento', 'quadra', 'lote', 'area_m2', 'status', 'valor_total', 'entrada', 'parcelas', 'valor_parcela', 'comprador', 'cpf'];
  const rows = ls.map(l => { const v = valoresLote(l); const c = v.compradorId ? S.compradores[v.compradorId] : {}; return [empCurto(l.emp), l.quadra, l.numero, l.area, STATUS[l.status]?.label, v.valorTotal, v.entrada, v.numParcelas, v.valorParcela, c?.nome, c?.cpf]; });
  const csv = [head, ...rows].map(r => r.map(x => x == null ? '' : typeof x === 'number' ? String(x).replace('.', ',') : `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  download(`lotes-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}

export default { mount, refresh, unmount() { el = null; } };
