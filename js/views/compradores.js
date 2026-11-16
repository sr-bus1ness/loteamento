import { S, can, empCurto } from '../state.js';
import { esc, brl, modal, toast, norm, dateBR, loteShort, confirmDlg } from '../util.js';
import { formComprador, detalheVenda } from '../forms.js';
import { resumoVenda, excluirComprador } from '../ops.js';

let el, busca = '';

function dadosComprador(id) {
  const vendas = Object.entries(S.vendas).filter(([, v]) => v.compradorId === id);
  let total = 0, recebido = 0, atrasado = 0;
  for (const [vid, v] of vendas) if (v.status !== 'cancelada') { const r = resumoVenda(vid); total += v.valorTotal; recebido += r.recebido; atrasado += r.valorAtrasado; }
  return { vendas, total, recebido, saldo: total - recebido, atrasado };
}

function mount(e) {
  el = e;
  el.innerHTML = `<div class="list-actions">
      <input class="input" id="cBusca" type="search" placeholder="Buscar por nome, CPF, telefone ou e-mail" style="flex:1;min-width:200px" value="${esc(busca)}">
      ${can.edit() ? '<button class="btn primary" id="cNovo">+ Novo comprador</button>' : ''}
    </div><div id="cOut"></div>`;
  let t; el.querySelector('#cBusca').oninput = ev => { clearTimeout(t); t = setTimeout(() => { busca = ev.target.value; refresh(); }, 200); };
  el.querySelector('#cNovo')?.addEventListener('click', () => formComprador());
  refresh();
}

function refresh() {
  if (!el) return;
  const q = norm(busca);
  const cs = Object.entries(S.compradores).filter(([, c]) => !q || [c.nome, c.cpf, c.telefone, c.email].some(x => norm(x).includes(q)))
    .sort((a, b) => (a[1].nome || '').localeCompare(b[1].nome || ''));
  const out = el.querySelector('#cOut');
  if (!cs.length) { out.innerHTML = `<div class="card empty">${Object.keys(S.compradores).length ? 'Nenhum comprador encontrado.' : 'Nenhum comprador cadastrado ainda. Cadastre aqui ou ao registrar uma venda.'}</div>`; return; }
  out.innerHTML = `<div class="table-wrap"><table class="t">
    <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Telefone</th><th>Lotes</th><th class="num">Total comprado</th><th class="num">Saldo devedor</th><th></th></tr></thead>
    <tbody>${cs.map(([id, c]) => {
      const d = dadosComprador(id);
      const lotes = d.vendas.filter(([, v]) => v.status !== 'cancelada').map(([, v]) => S.lotes[v.loteId]).filter(Boolean);
      return `<tr class="click" data-id="${id}"><td><b>${esc(c.nome)}</b></td><td>${esc(c.cpf || '')}</td><td>${esc(c.telefone || '')}</td>
        <td class="small">${lotes.map(l => esc(empCurto(l.emp).replace('Esperança ', 'E.')) + ' ' + loteShort(l)).join(', ') || '—'}</td>
        <td class="num money">${brl(d.total)}</td><td class="num money">${brl(d.saldo)}</td>
        <td>${d.atrasado ? '<span class="badge b-atraso">Em atraso</span>' : ''}</td></tr>`;
    }).join('')}</tbody></table></div><p class="small muted">${cs.length} comprador(es)</p>`;
  out.onclick = ev => { const r = ev.target.closest('[data-id]'); if (r) detalhe(r.dataset.id); };
}

export async function detalhe(id) {
  const c = S.compradores[id]; if (!c) return;
  const d = dadosComprador(id);
  const vids = new Set(d.vendas.map(([vid]) => vid));
  const pags = Object.values(S.pagamentos).filter(p => vids.has(p.vendaId)).sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.em - a.em);
  const body = `
    <dl class="kv" style="margin-top:0">
      ${[['CPF/CNPJ', c.cpf], ['RG', c.rg], ['Telefone', c.telefone], ['E-mail', c.email], ['Endereço', c.endereco], ['Observações', c.obs]].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd style="font-weight:500">${esc(v)}</dd>`).join('')}
    </dl>
    <div class="grid kpis" style="margin-bottom:14px">
      <div class="card kpi"><div class="label">Total comprado</div><div class="value money" style="font-size:1.15rem">${brl(d.total)}</div></div>
      <div class="card kpi"><div class="label">Pago</div><div class="value money" style="font-size:1.15rem">${brl(d.recebido)}</div></div>
      <div class="card kpi"><div class="label">Saldo devedor</div><div class="value money" style="font-size:1.15rem">${brl(d.saldo)}</div></div>
      <div class="card kpi"><div class="label">Em atraso</div><div class="value money" style="font-size:1.15rem;color:var(--danger)">${brl(d.atrasado)}</div></div>
    </div>
    <h4 style="margin:0 0 8px">Compras</h4>
    ${d.vendas.length ? `<div class="table-wrap" style="margin-bottom:14px"><table class="t"><thead><tr><th>Lote</th><th>Data</th><th class="num">Total</th><th>Situação</th></tr></thead><tbody>
      ${d.vendas.map(([vid, v]) => { const l = S.lotes[v.loteId]; const r = resumoVenda(vid); return `<tr class="click" data-v="${vid}"><td>${esc(empCurto(l?.emp))} ${loteShort(l)}</td><td>${dateBR(v.data)}</td><td class="num money">${brl(v.valorTotal)}</td>
        <td>${v.status === 'cancelada' ? '<span class="badge b-neutral">Cancelada</span>' : v.status === 'quitada' ? '<span class="badge b-ok">Quitada</span>' : r.atrasadas.length ? '<span class="badge b-atraso">Em atraso</span>' : '<span class="badge b-ok">Em dia</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="muted">Nenhuma compra registrada.</p>'}
    <h4 style="margin:0 0 8px">Histórico financeiro</h4>
    ${pags.length ? `<ul class="timeline">${pags.map(p => { const l = S.lotes[S.vendas[p.vendaId]?.loteId]; return `<li><span class="when">${dateBR(p.data)}</span><span>${p.estornado ? '<s>' : ''}${p.parcela === 0 ? 'Entrada' : 'Parcela ' + p.parcela} · ${loteShort(l)} · <b>${brl(p.valor)}</b> · ${esc(p.forma || '')}${p.estornado ? '</s> <span class="badge b-neutral">estornado</span>' : ''}</span></li>`; }).join('')}</ul>` : '<p class="muted">Nenhum pagamento registrado.</p>'}`;
  const actions = [];
  if (can.admin()) actions.push({ label: 'Excluir', cls: 'danger', onClick: async () => {
    if (!await confirmDlg('Excluir comprador', `Excluir ${esc(c.nome)}?`, 'Excluir', true)) return false;
    await excluirComprador(id); toast('Comprador excluído.');
  } });
  if (can.edit()) actions.push({ label: 'Editar', onClick: async () => { setTimeout(() => formComprador(id), 0); } });
  actions.push({ label: 'Fechar', cls: 'primary' });
  return modal({ title: c.nome, body, wide: true, actions, onOpen: (f, close) => f.querySelectorAll('[data-v]').forEach(r => r.onclick = () => { close(null); detalheVenda(r.dataset.v); }) });
}

export default { mount, refresh, unmount() { el = null; } };
