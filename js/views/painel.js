import { S, lotesDoEmp, empCurto } from '../state.js';
import { esc, brl, num, pct, STATUS, todayISO, dateBR, loteShort } from '../util.js';
import { resumoVenda } from '../ops.js';

let el, filtro = 'all';

export function empSeg(cur, withAll = true) {
  const opts = [...(withAll ? [['all', 'Todos']] : []), ...S.geo.empreendimentos.map(e => [e.id, empCurto(e.id)])];
  return `<div class="seg" data-seg>${opts.map(([k, t]) => `<button type="button" data-v="${k}" class="${cur === k ? 'active' : ''}">${esc(t)}</button>`).join('')}</div>`;
}

export function calcular(emp) {
  const lotes = lotesDoEmp(emp);
  const cont = { disponivel: 0, vendido: 0, reservado: 0, bloqueado: 0 };
  let area = 0;
  for (const l of lotes) { cont[l.status] = (cont[l.status] || 0) + 1; area += l.area || 0; }
  const ids = new Set(lotes.map(l => l.id));
  const vendas = Object.entries(S.vendas).filter(([, v]) => v.status !== 'cancelada' && ids.has(v.loteId));
  let vendido = 0, recebido = 0, atrasado = 0, nAtras = 0, aReceber30 = 0;
  const hoje = todayISO(); const em30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const atrasadas = [];
  for (const [vid, v] of vendas) {
    const r = resumoVenda(vid);
    vendido += v.valorTotal || 0; recebido += r.recebido;
    atrasado += r.valorAtrasado; nAtras += r.atrasadas.length;
    if (r.atrasadas.length) atrasadas.push({ vid, v, r });
    for (const p of Object.values(S.parcelas[vid] || {})) if (p && !p.pago && p.venc >= hoje && p.venc <= em30) aReceber30 += p.valor;
  }
  return { lotes, total: lotes.length, cont, area, vendido, recebido, pendente: vendido - recebido, atrasado, nAtras, aReceber30, atrasadas, nVendas: vendas.length };
}

function render() {
  const c = calcular(filtro);
  const empresa = S.config?.empresa || {};
  const nome = empresa.nome || S.geo.proprietario;
  const st = Object.keys(STATUS);
  const porQuadra = {};
  for (const l of c.lotes) {
    const k = (filtro === 'all' ? empCurto(l.emp).replace('Esperança', 'Esp.') + ' · ' : '') + l.quadra;
    (porQuadra[k] ||= { total: 0, disponivel: 0, vendido: 0, reservado: 0, bloqueado: 0 });
    porQuadra[k].total++; porQuadra[k][l.status]++;
  }
  el.innerHTML = `
    <div class="card row" style="margin-bottom:14px;gap:14px">
      <div class="brand-mark" style="width:56px;height:56px;font-size:1.4rem">${empresa.logo ? `<img src="${esc(empresa.logo)}" alt="">` : esc(nome[0])}</div>
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:1.1rem">${esc(nome)}</div>
        <div class="muted small">${empresa.cnpj ? 'CNPJ ' + esc(empresa.cnpj) + ' · ' : ''}${esc(empresa.cidade || S.geo.municipio)} · Loteamentos Esperança I e II</div>
      </div>
      ${empSeg(filtro)}
    </div>
    ${!c.total ? '<div class="notice">Nenhum lote carregado ainda. Se você é administrador, os lotes das plantas são importados automaticamente no primeiro acesso.</div>' : ''}
    <div class="grid kpis">
      <div class="card kpi"><div class="label">Total de lotes</div><div class="value">${c.total}</div><div class="sub">${num(c.area)} m² comercializáveis</div></div>
      ${st.map(k => `<div class="card kpi st" style="--c:${STATUS[k].color}"><div class="label">${STATUS[k].label}s</div><div class="value">${c.cont[k] || 0}</div><div class="sub">${pct(c.cont[k] || 0, c.total)} do total</div></div>`).join('')}
    </div>
    <div class="card" style="margin-top:14px">
      <h3>Situação dos lotes</h3>
      <div class="stbar">${st.map(k => `<span style="width:${c.total ? (c.cont[k] || 0) / c.total * 100 : 0}%;background:${STATUS[k].color}" title="${STATUS[k].label}"></span>`).join('')}</div>
      <div class="legend">${st.map(k => `<span><i style="background:${STATUS[k].color}"></i>${STATUS[k].label}: ${c.cont[k] || 0} (${pct(c.cont[k] || 0, c.total)})</span>`).join('')}</div>
    </div>
    <div class="grid kpis" style="margin-top:14px">
      <div class="card kpi"><div class="label">Total vendido</div><div class="value money">${brl(c.vendido)}</div><div class="sub">${c.nVendas} venda(s) ativa(s)</div></div>
      <div class="card kpi"><div class="label">Total recebido</div><div class="value money" style="color:var(--primary)">${brl(c.recebido)}</div><div class="sub">${pct(c.recebido, c.vendido)} do vendido</div></div>
      <div class="card kpi"><div class="label">Pendente de recebimento</div><div class="value money">${brl(c.pendente)}</div><div class="sub">${brl(c.aReceber30)} vencem em 30 dias</div></div>
      <div class="card kpi"><div class="label">Em atraso</div><div class="value money" style="color:var(--danger)">${brl(c.atrasado)}</div><div class="sub">${c.nAtras} parcela(s) vencida(s)</div></div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card">
        <h3>Lotes por quadra</h3>
        <div class="table-wrap" style="max-height:360px;overflow:auto"><table class="t">
          <thead><tr><th>Quadra</th><th class="num">Lotes</th><th class="num">Disp.</th><th class="num">Vend.</th><th class="num">Res.</th><th class="num">Bloq.</th></tr></thead>
          <tbody>${Object.entries(porQuadra).map(([k, q]) => `<tr><td>${esc(k)}</td><td class="num">${q.total}</td><td class="num">${q.disponivel}</td><td class="num">${q.vendido}</td><td class="num">${q.reservado}</td><td class="num">${q.bloqueado}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <h3>Compradores com parcelas em atraso</h3>
        ${c.atrasadas.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Lote</th><th>Comprador</th><th class="num">Atrasado</th><th>Desde</th></tr></thead><tbody>
          ${c.atrasadas.sort((a, b) => b.r.valorAtrasado - a.r.valorAtrasado).slice(0, 10).map(({ v, r }) => { const l = S.lotes[v.loteId]; return `<tr class="click" onclick="location.hash='#/financeiro?venda=${encodeURIComponent(Object.keys(S.vendas).find(k => S.vendas[k] === v))}'"><td>${esc(empCurto(l?.emp))} ${loteShort(l)}</td><td>${esc(S.compradores[v.compradorId]?.nome || '—')}</td><td class="num money">${brl(r.valorAtrasado)}</td><td>${dateBR(r.atrasadas.map(p => p.venc).sort()[0])}</td></tr>`; }).join('')}
        </tbody></table></div>` : '<div class="empty">Nenhuma parcela em atraso.</div>'}
      </div>
    </div>
    <p class="small muted" style="margin-top:14px">Fonte da estrutura: ${esc(S.geo.fonte)}</p>`;
  el.querySelector('[data-seg]').onclick = e => { const b = e.target.closest('button'); if (!b) return; filtro = b.dataset.v; render(); };
}

export default {
  mount(e) { el = e; render(); },
  refresh() { render(); }
};
