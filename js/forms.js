// Modais e blocos de interface compartilhados entre as telas.
import { S, can, empCurto, sortLotes } from './state.js';
import { esc, brl, num, modal, toast, fval, parseMoney, moneyIn, todayISO, addMonths, dateBR, dateTimeBR, badge, loteLabel, loteShort, confirmDlg, round2, STATUS, norm } from './util.js';
import * as ops from './ops.js';

// ---------------------------------------------------------------- Lote: detalhes
/** Valores exibidos de um lote: da venda (se vendido) ou da condição de venda cadastrada no lote. */
export function valoresLote(l) {
  const v = l.vendaId && S.vendas[l.vendaId]?.status !== 'cancelada' ? S.vendas[l.vendaId] : null;
  const src = v || l;
  return {
    venda: v, valorTotal: src.valorTotal ?? null, entrada: src.entrada ?? null,
    numParcelas: src.numParcelas ?? null, valorParcela: src.valorParcela ?? null,
    compradorId: v?.compradorId || l.reserva?.compradorId || null
  };
}

export function loteDetalheHTML(id) {
  const l = S.lotes[id]; if (!l) return '<p class="muted">Lote não encontrado.</p>';
  const vv = valoresLote(l);
  const comp = vv.compradorId ? S.compradores[vv.compradorId] : null;
  const r = vv.venda ? ops.resumoVenda(l.vendaId) : null;
  return `
    <div class="small muted">${esc(empCurto(l.emp))}</div>
    <h3>${loteLabel(l)}</h3>
    <div>${badge(l.status)}</div>
    <dl class="kv">
      <dt>Área</dt><dd>${l.area ? num(l.area) + ' m²' : '—'}</dd>
      <dt>Valor total</dt><dd class="money">${brl(vv.valorTotal)}</dd>
      <dt>Entrada</dt><dd class="money">${brl(vv.entrada)}</dd>
      <dt>Parcelas</dt><dd>${vv.numParcelas ?? '—'}</dd>
      <dt>Valor da parcela</dt><dd class="money">${brl(vv.valorParcela)}</dd>
      <dt>${vv.venda ? 'Comprador' : l.status === 'reservado' ? 'Reservado para' : 'Comprador'}</dt><dd>${comp ? esc(comp.nome) : '—'}</dd>
      ${r ? `<dt>Recebido</dt><dd class="money">${brl(r.recebido)}</dd>
      <dt>Saldo devedor</dt><dd class="money">${brl(r.saldo)}</dd>
      <dt>Parcelas pagas</dt><dd>${r.parcelasPagas}/${r.parcelasTotal}${r.atrasadas.length ? ` <span class="badge b-atraso">${r.atrasadas.length} em atraso</span>` : ''}</dd>` : ''}
      ${l.status === 'reservado' && l.reserva?.validade ? `<dt>Reserva até</dt><dd>${dateBR(l.reserva.validade)}</dd>` : ''}
      ${l.motivoBloqueio ? `<dt>Motivo do bloqueio</dt><dd>${esc(l.motivoBloqueio)}</dd>` : ''}
      ${l.obs ? `<dt>Observações</dt><dd style="font-weight:400">${esc(l.obs)}</dd>` : ''}
    </dl>`;
}

export function loteAcoesHTML(id) {
  const l = S.lotes[id]; if (!l) return '';
  const b = [];
  if (l.vendaId && S.vendas[l.vendaId]) b.push(`<button class="btn primary" data-act="venda">Ver financeiro</button>`);
  if (can.edit()) {
    if (l.status !== 'vendido' && l.status !== 'bloqueado') b.push(`<button class="btn primary" data-act="vender">Registrar venda</button>`);
    if (l.status !== 'vendido') b.push(`<button class="btn" data-act="status">Alterar status</button>`);
    b.push(`<button class="btn" data-act="editar">Editar lote</button>`);
  }
  b.push(`<button class="btn" data-act="hist">Histórico</button>`);
  return `<div class="row">${b.join('')}</div>`;
}

export function bindLoteAcoes(root, id) {
  root.querySelectorAll('[data-act]').forEach(btn => btn.onclick = () => {
    const a = btn.dataset.act;
    if (a === 'venda') detalheVenda(S.lotes[id].vendaId);
    if (a === 'vender') formVenda(id);
    if (a === 'status') formStatus(id);
    if (a === 'editar') formLote(id);
    if (a === 'hist') historicoLote(id);
  });
}

// ---------------------------------------------------------------- Lote: formulário
export async function formLote(id) {
  const isNew = !id;
  const l = id ? S.lotes[id] : { emp: S.emp === 'all' ? 'E1' : S.emp, status: 'disponivel' };
  const emps = S.geo.empreendimentos.map(e => `<option value="${e.id}" ${l.emp === e.id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('');
  const body = `
    ${!isNew && l.origem === 'planta' ? '<div class="notice info">Quadra, número e área vêm da planta oficial. Altere somente se houver retificação.</div>' : ''}
    <div class="form-grid">
      <div class="field"><label>Empreendimento</label><select class="input" name="emp" ${isNew ? '' : 'disabled'}>${emps}</select></div>
      <div class="field"><label>Quadra</label><input class="input" name="quadra" value="${esc(l.quadra || '')}" required maxlength="4" style="text-transform:uppercase"></div>
      <div class="field"><label>Número do lote</label><input class="input" name="numero" type="number" min="1" value="${l.numero ?? ''}" required></div>
      <div class="field"><label>Área (m²)</label><input class="input" name="area" inputmode="decimal" value="${l.area != null ? moneyIn(l.area) : ''}"></div>
    </div>
    <h4 style="margin:6px 0 10px">Condição de venda (tabela)</h4>
    <div class="form-grid">
      <div class="field"><label>Valor total (R$)</label><input class="input" name="valorTotal" inputmode="decimal" value="${moneyIn(l.valorTotal)}"></div>
      <div class="field"><label>Entrada (R$)</label><input class="input" name="entrada" inputmode="decimal" value="${moneyIn(l.entrada)}"></div>
      <div class="field"><label>Nº de parcelas</label><input class="input" name="numParcelas" type="number" min="0" value="${l.numParcelas ?? ''}"></div>
      <div class="field"><label>Valor da parcela (R$)</label><input class="input" name="valorParcela" inputmode="decimal" value="${moneyIn(l.valorParcela)}" placeholder="calculado se vazio"></div>
    </div>
    ${isNew ? `<div class="field"><label>Status</label><select class="input" name="status">${Object.entries(STATUS).filter(([k]) => k !== 'vendido').map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label>Observações</label><textarea class="input" name="obs" rows="2">${esc(l.obs || '')}</textarea></div>`;
  const actions = [];
  if (!isNew && can.admin()) actions.push({ label: 'Excluir', cls: 'danger', onClick: async (f, close) => {
    if (!await confirmDlg('Excluir lote', `Excluir definitivamente o lote ${loteShort(l)}? Esta ação fica registrada no histórico.`, 'Excluir', true)) return false;
    await ops.excluirLote(id); toast('Lote excluído.');
  } });
  actions.push({ label: 'Cancelar', value: null }, { label: 'Salvar', cls: 'primary', submit: true, onClick: async f => {
    const quadra = fval(f, 'quadra').toUpperCase(), numero = parseInt(fval(f, 'numero'));
    if (!quadra || !numero) { toast('Informe quadra e número.', true); return false; }
    const emp = isNew ? fval(f, 'emp') : l.emp;
    const newId = `${emp}-${quadra}-${String(numero).padStart(2, '0')}`;
    if ((isNew || newId !== id) && S.lotes[newId]) { toast('Já existe um lote com esta quadra e número.', true); return false; }
    if (!isNew && newId !== id) { toast('Para mudar quadra/número, exclua e cadastre novamente.', true); return false; }
    const vt = parseMoney(fval(f, 'valorTotal')), en = parseMoney(fval(f, 'entrada')), np = parseInt(fval(f, 'numParcelas')) || null;
    let vp = parseMoney(fval(f, 'valorParcela'));
    if (!vp && vt && np) vp = round2((vt - (en || 0)) / np);
    const dados = { quadra, numero, area: parseMoney(fval(f, 'area')), valorTotal: vt, entrada: en, numParcelas: np, valorParcela: vp, obs: fval(f, 'obs') || null };
    if (isNew) { dados.emp = emp; dados.status = fval(f, 'status'); }
    await ops.salvarLote(isNew ? newId : id, dados, isNew);
    toast('Lote salvo.');
  } });
  return modal({ title: isNew ? 'Novo lote' : `Editar ${loteLabel(l)}`, body, actions });
}

// ---------------------------------------------------------------- Status
export async function formStatus(id) {
  const l = S.lotes[id];
  const opts = Object.entries(STATUS).filter(([k]) => k !== 'vendido').map(([k, s]) => `<label class="row" style="margin-bottom:8px;cursor:pointer"><input type="radio" name="st" value="${k}" ${l.status === k ? 'checked' : ''}> ${badge(k)}</label>`).join('');
  const body = `<p class="muted small">Para marcar como <b>Vendido</b>, use “Registrar venda”.</p>${opts}
    <div id="resBox" class="${l.status === 'reservado' ? '' : 'hidden'}">
      ${compradorPickerHTML('resComp', l.reserva?.compradorId)}
      <div class="field"><label>Reserva válida até</label><input class="input" type="date" name="validade" value="${l.reserva?.validade || addMonths(todayISO(), 0)}"></div>
    </div>
    <div class="field"><label>Observação / motivo</label><input class="input" name="obs" value="${esc(l.motivoBloqueio || l.reserva?.obs || '')}"></div>`;
  return modal({
    title: `Status · ${loteShort(l)}`, body,
    onOpen: f => { f.querySelectorAll('[name=st]').forEach(r => r.onchange = () => f.querySelector('#resBox').classList.toggle('hidden', f.querySelector('[name=st]:checked').value !== 'reservado')); bindCompradorPicker(f, 'resComp'); },
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', submit: true, onClick: async f => {
      const st = f.querySelector('[name=st]:checked')?.value;
      await ops.alterarStatus(id, st, { compradorId: f.elements.resComp?.value || null, validade: fval(f, 'validade') || null, obs: fval(f, 'obs') || null });
      toast('Status atualizado.');
    } }]
  });
}

// ---------------------------------------------------------------- Comprador (seleção e cadastro)
export function compradorPickerHTML(name, selected) {
  const cs = Object.entries(S.compradores).sort((a, b) => (a[1].nome || '').localeCompare(b[1].nome || ''));
  return `<div class="field"><label>Comprador</label>
    <div class="row" style="flex-wrap:nowrap">
      <select class="input" name="${name}"><option value="">— selecione —</option>${cs.map(([id, c]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(c.nome)}${c.cpf ? ' · ' + esc(c.cpf) : ''}</option>`).join('')}</select>
      <button type="button" class="btn" data-novo="${name}" title="Cadastrar comprador">+ Novo</button>
    </div></div>`;
}
export function bindCompradorPicker(form, name) {
  const b = form.querySelector(`[data-novo="${name}"]`); if (!b) return;
  b.onclick = async () => {
    const id = await formComprador();
    if (id) {
      const sel = form.elements[name];
      const c = S.compradores[id] || { nome: 'Novo comprador' };
      sel.insertAdjacentHTML('beforeend', `<option value="${id}">${esc(c.nome)}</option>`);
      sel.value = id;
    }
  };
}

export async function formComprador(id) {
  const c = id ? S.compradores[id] : {};
  const body = `<div class="form-grid">
      <div class="field" style="grid-column:1/-1"><label>Nome completo *</label><input class="input" name="nome" value="${esc(c.nome || '')}" required></div>
      <div class="field"><label>CPF / CNPJ</label><input class="input" name="cpf" value="${esc(c.cpf || '')}" inputmode="numeric"></div>
      <div class="field"><label>RG</label><input class="input" name="rg" value="${esc(c.rg || '')}"></div>
      <div class="field"><label>Telefone</label><input class="input" name="telefone" type="tel" value="${esc(c.telefone || '')}"></div>
      <div class="field"><label>E-mail</label><input class="input" name="email" type="email" value="${esc(c.email || '')}"></div>
      <div class="field" style="grid-column:1/-1"><label>Endereço</label><input class="input" name="endereco" value="${esc(c.endereco || '')}"></div>
      <div class="field" style="grid-column:1/-1"><label>Observações</label><textarea class="input" name="obs" rows="2">${esc(c.obs || '')}</textarea></div>
    </div>`;
  let savedId = null;
  await modal({ title: id ? 'Editar comprador' : 'Novo comprador', body, actions: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', submit: true, onClick: async f => {
    const nome = fval(f, 'nome'); if (!nome) { toast('Informe o nome.', true); return false; }
    const d = { nome, cpf: fval(f, 'cpf'), rg: fval(f, 'rg'), telefone: fval(f, 'telefone'), email: fval(f, 'email'), endereco: fval(f, 'endereco'), obs: fval(f, 'obs') };
    if (!id) for (const k of Object.keys(d)) if (!d[k]) delete d[k];
    savedId = await ops.salvarComprador(id, d);
    toast('Comprador salvo.');
  } }] });
  return savedId;
}

// ---------------------------------------------------------------- Venda
export async function formVenda(loteId) {
  const lotes = sortLotes(Object.entries(S.lotes).map(([id, l]) => ({ id, ...l })).filter(l => l.status !== 'vendido' && l.status !== 'bloqueado'));
  const l0 = loteId ? S.lotes[loteId] : null;
  const body = `
    <div class="field"><label>Lote</label><select class="input" name="loteId" ${loteId ? 'disabled' : ''}>
      ${loteId ? `<option value="${loteId}">${esc(empCurto(l0.emp))} · ${loteLabel(l0)}</option>` : '<option value="">— selecione —</option>' + lotes.map(l => `<option value="${l.id}">${esc(empCurto(l.emp))} · ${loteShort(l)}</option>`).join('')}
    </select></div>
    ${compradorPickerHTML('compradorId', l0?.reserva?.compradorId)}
    <div class="form-grid">
      <div class="field"><label>Data da venda</label><input class="input" type="date" name="dataVenda" value="${todayISO()}" required></div>
      <div class="field"><label>Valor total (R$) *</label><input class="input" name="valorTotal" inputmode="decimal" required></div>
      <div class="field"><label>Entrada (R$)</label><input class="input" name="entrada" inputmode="decimal"></div>
      <div class="field"><label>Nº de parcelas</label><input class="input" name="numParcelas" type="number" min="0" value="0"></div>
      <div class="field"><label>Valor da parcela (R$)</label><input class="input" name="valorParcela" inputmode="decimal" placeholder="automático"></div>
      <div class="field"><label>1º vencimento</label><input class="input" type="date" name="primeiroVenc" value="${addMonths(todayISO(), 1)}"></div>
    </div>
    <label class="row" style="margin-bottom:10px"><input type="checkbox" name="entradaPaga" checked> Entrada recebida no ato</label>
    <div class="field"><label>Forma de pagamento da entrada</label><select class="input" name="formaEntrada">${FORMAS.map(f => `<option>${f}</option>`).join('')}</select></div>
    <div class="field"><label>Observações</label><textarea class="input" name="obs" rows="2"></textarea></div>
    <div id="vResumo" class="notice info small"></div>`;
  const fill = (f, l) => {
    if (!l) return;
    if (l.valorTotal != null) f.elements.valorTotal.value = moneyIn(l.valorTotal);
    if (l.entrada != null) f.elements.entrada.value = moneyIn(l.entrada);
    if (l.numParcelas != null) f.elements.numParcelas.value = l.numParcelas;
    if (l.valorParcela != null) f.elements.valorParcela.value = moneyIn(l.valorParcela);
  };
  const ler = f => ({
    loteId: loteId || f.elements.loteId.value, compradorId: f.elements.compradorId.value,
    dataVenda: f.elements.dataVenda.value, valorTotal: parseMoney(f.elements.valorTotal.value),
    entrada: parseMoney(f.elements.entrada.value) || 0, numParcelas: parseInt(f.elements.numParcelas.value) || 0,
    valorParcela: parseMoney(f.elements.valorParcela.value), primeiroVenc: f.elements.primeiroVenc.value,
    entradaPaga: f.elements.entradaPaga.checked, formaEntrada: f.elements.formaEntrada.value, obs: f.elements.obs.value.trim()
  });
  const resumo = f => {
    const d = ler(f); const el = f.querySelector('#vResumo');
    if (!d.valorTotal) { el.textContent = 'Informe o valor total para ver o resumo.'; return; }
    const saldo = round2(d.valorTotal - d.entrada);
    const vp = d.valorParcela || (d.numParcelas ? round2(saldo / d.numParcelas) : 0);
    const totalPlano = round2(d.entrada + (d.valorParcela ? vp * d.numParcelas : saldo));
    el.innerHTML = `Saldo a parcelar: <b>${brl(saldo)}</b>${d.numParcelas ? ` em <b>${d.numParcelas}x de ${brl(vp)}</b>` : ''}.
      ${d.valorParcela && Math.abs(totalPlano - d.valorTotal) > 0.01 ? `<br>Atenção: entrada + parcelas somam ${brl(totalPlano)} (diferença de ${brl(totalPlano - d.valorTotal)} em relação ao valor total, ex.: juros).` : ''}`;
  };
  return modal({
    title: 'Registrar venda', body, wide: true,
    onOpen: f => {
      fill(f, l0); resumo(f); bindCompradorPicker(f, 'compradorId');
      f.addEventListener('input', () => resumo(f));
      if (!loteId) f.elements.loteId.onchange = () => { fill(f, S.lotes[f.elements.loteId.value]); resumo(f); };
    },
    actions: [{ label: 'Cancelar' }, { label: 'Confirmar venda', cls: 'primary', submit: true, onClick: async f => {
      const d = ler(f);
      if (!d.loteId) { toast('Selecione o lote.', true); return false; }
      if (!d.compradorId) { toast('Selecione ou cadastre o comprador.', true); return false; }
      if (!d.valorTotal || d.valorTotal <= 0) { toast('Informe o valor total.', true); return false; }
      if (d.entrada > d.valorTotal) { toast('A entrada não pode ser maior que o valor total.', true); return false; }
      if (d.numParcelas > 0 && !d.primeiroVenc) { toast('Informe o 1º vencimento.', true); return false; }
      if (d.numParcelas === 0 && round2(d.valorTotal - d.entrada) > 0) { toast('Sem parcelas, a entrada deve ser igual ao valor total (venda à vista).', true); return false; }
      const vid = await ops.registrarVenda(d);
      toast('Venda registrada.');
      setTimeout(() => detalheVenda(vid), 50);
    } }]
  });
}

export const FORMAS = ['PIX', 'Dinheiro', 'Transferência', 'Boleto', 'Cartão', 'Cheque', 'Outro'];

// ---------------------------------------------------------------- Detalhe da venda / parcelas
export async function detalheVenda(vid) {
  const render = () => {
    const v = S.vendas[vid]; if (!v) return '<p>Venda não encontrada.</p>';
    const l = S.lotes[v.loteId] || {}; const c = S.compradores[v.compradorId] || {};
    const r = ops.resumoVenda(vid); const hoje = todayISO();
    const ps = Object.values(S.parcelas[vid] || {}).filter(Boolean).sort((a, b) => a.n - b.n);
    const st = v.status === 'cancelada' ? '<span class="badge b-neutral">Cancelada</span>' : v.status === 'quitada' ? '<span class="badge b-ok">Quitada</span>' : r.atrasadas.length ? '<span class="badge b-atraso">Em atraso</span>' : '<span class="badge b-ok">Em dia</span>';
    return `
      <div class="row" style="margin-bottom:8px"><b>${esc(empCurto(l.emp))} · ${loteLabel(l)}</b> ${st}</div>
      <div class="small muted">Comprador: <b>${esc(c.nome || '—')}</b>${c.cpf ? ' · ' + esc(c.cpf) : ''}${c.telefone ? ' · ' + esc(c.telefone) : ''} · Venda em ${dateBR(v.data)}</div>
      <div class="grid kpis" style="margin:14px 0">
        <div class="card kpi"><div class="label">Valor total</div><div class="value money" style="font-size:1.2rem">${brl(v.valorTotal)}</div></div>
        <div class="card kpi"><div class="label">Entrada</div><div class="value money" style="font-size:1.2rem">${brl(v.entrada)}</div><div class="sub">${r.entradaRecebida ? 'recebida' : v.entrada ? 'pendente' : ''}</div></div>
        <div class="card kpi"><div class="label">Recebido</div><div class="value money" style="font-size:1.2rem">${brl(r.recebido)}</div></div>
        <div class="card kpi"><div class="label">Saldo devedor</div><div class="value money" style="font-size:1.2rem">${brl(r.saldo)}</div><div class="sub">${r.parcelasPagas}/${r.parcelasTotal} parcelas pagas</div></div>
      </div>
      ${v.obs ? `<p class="small"><b>Obs.:</b> ${esc(v.obs)}</p>` : ''}
      ${v.status === 'cancelada' ? `<div class="notice">Venda cancelada em ${dateTimeBR(v.canceladaEm)}${v.motivoCancelamento ? ': ' + esc(v.motivoCancelamento) : ''}.</div>` : ''}
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th>Pagamento</th><th></th></tr></thead>
        <tbody>${ps.map(p => {
          const atras = !p.pago && p.venc < hoje;
          return `<tr>
            <td>${p.n === 0 ? 'Entrada' : `${p.n}/${r.parcelasTotal}`}</td>
            <td>${dateBR(p.venc)}</td>
            <td class="num money">${brl(p.valor)}</td>
            <td>${p.pago ? '<span class="badge b-ok">Paga</span>' : atras ? '<span class="badge b-atraso">Atrasada</span>' : '<span class="badge b-neutral">A vencer</span>'}</td>
            <td class="small">${p.pago ? `${dateBR(p.pagoEm)} · ${brl(p.valorPago)}${p.pagamentoId && S.pagamentos[p.pagamentoId]?.forma ? ' · ' + esc(S.pagamentos[p.pagamentoId].forma) : ''}` : ''}</td>
            <td class="num" style="white-space:nowrap">${v.status !== 'cancelada' && can.edit() ? (p.pago
              ? (can.admin() ? `<button type="button" class="btn sm" data-estorno="${p.n}">Estornar</button>` : '')
              : `<button type="button" class="btn sm primary" data-pagar="${p.n}">Receber</button> <button type="button" class="btn sm" data-editp="${p.n}" title="Alterar vencimento/valor">✎</button>`) : ''}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" class="empty">Sem parcelas.</td></tr>'}</tbody>
      </table></div>`;
  };
  const bind = (f) => {
    const body = f.querySelector('.body');
    body.querySelectorAll('[data-pagar]').forEach(b => b.onclick = async () => { await formPagamento(vid, +b.dataset.pagar); body.innerHTML = render(); bind(f); });
    body.querySelectorAll('[data-estorno]').forEach(b => b.onclick = async () => {
      if (!await confirmDlg('Estornar pagamento', 'Desfazer o recebimento desta parcela? O pagamento ficará marcado como estornado no histórico.', 'Estornar', true)) return;
      await ops.estornarPagamento(vid, +b.dataset.estorno); toast('Pagamento estornado.'); body.innerHTML = render(); bind(f);
    });
    body.querySelectorAll('[data-editp]').forEach(b => b.onclick = async () => { await formParcela(vid, +b.dataset.editp); body.innerHTML = render(); bind(f); });
  };
  const v = S.vendas[vid];
  const actions = [];
  if (v && v.status !== 'cancelada' && can.admin()) actions.push({ label: 'Cancelar venda', cls: 'danger', onClick: async () => {
    const motivo = await modal({ title: 'Cancelar venda', body: `<p>O lote voltará a ficar <b>Disponível</b>. Os pagamentos já registrados permanecem no histórico.</p><div class="field"><label>Motivo</label><input class="input" name="motivo"></div>`,
      actions: [{ label: 'Voltar', value: null }, { label: 'Cancelar venda', cls: 'danger', submit: true, onClick: async f => { await ops.cancelarVenda(vid, fval(f, 'motivo')); toast('Venda cancelada.'); } }] });
    return motivo === null ? false : undefined;
  } });
  actions.push({ label: 'Imprimir', onClick: () => { imprimirExtrato(vid); return false; } }, { label: 'Fechar', cls: 'primary' });
  return modal({ title: 'Venda e parcelas', body: render(), wide: true, actions, onOpen: bind });
}

export async function formPagamento(vid, n) {
  const p = S.parcelas[vid][n];
  const body = `<p>${n === 0 ? 'Entrada' : `Parcela ${n}`} · vencimento ${dateBR(p.venc)} · valor ${brl(p.valor)}</p>
    <div class="form-grid">
      <div class="field"><label>Data do pagamento</label><input class="input" type="date" name="data" value="${todayISO()}" required></div>
      <div class="field"><label>Valor pago (R$)</label><input class="input" name="valor" inputmode="decimal" value="${moneyIn(p.valor)}" required></div>
      <div class="field"><label>Forma</label><select class="input" name="forma">${FORMAS.map(x => `<option>${x}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Observação</label><input class="input" name="obs"></div>`;
  return modal({ title: 'Registrar recebimento', body, actions: [{ label: 'Cancelar' }, { label: 'Confirmar recebimento', cls: 'primary', submit: true, onClick: async f => {
    const valor = parseMoney(fval(f, 'valor')); if (!valor || valor <= 0) { toast('Valor inválido.', true); return false; }
    await ops.registrarPagamento(vid, n, valor, fval(f, 'data'), fval(f, 'forma'), fval(f, 'obs'));
    toast('Recebimento registrado.');
  } }] });
}

async function formParcela(vid, n) {
  const p = S.parcelas[vid][n];
  return modal({ title: `Alterar ${n === 0 ? 'entrada' : 'parcela ' + n}`, body: `<div class="form-grid">
      <div class="field"><label>Vencimento</label><input class="input" type="date" name="venc" value="${p.venc}"></div>
      <div class="field"><label>Valor (R$)</label><input class="input" name="valor" inputmode="decimal" value="${moneyIn(p.valor)}"></div></div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', submit: true, onClick: async f => {
      const valor = parseMoney(fval(f, 'valor')); if (!valor) { toast('Valor inválido.', true); return false; }
      await ops.editarParcela(vid, n, fval(f, 'venc'), valor); toast('Parcela alterada.');
    } }] });
}

function imprimirExtrato(vid) {
  const v = S.vendas[vid]; const l = S.lotes[v.loteId] || {}; const c = S.compradores[v.compradorId] || {};
  const r = ops.resumoVenda(vid);
  const ps = Object.values(S.parcelas[vid] || {}).filter(Boolean).sort((a, b) => a.n - b.n);
  const emp = S.config?.empresa?.nome || S.geo.proprietario;
  const w = window.open('', '_blank');
  if (!w) { toast('Permita pop-ups para imprimir.', true); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Extrato ${loteShort(l)}</title>
    <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}.r{text-align:right}h1{font-size:18px;margin:0}h2{font-size:15px}</style>
    <h1>${esc(emp)}</h1><div>Extrato financeiro · emitido em ${new Date().toLocaleString('pt-BR')}</div>
    <h2>${esc(empCurto(l.emp))} · ${loteLabel(l)} · ${l.area ? num(l.area) + ' m²' : ''}</h2>
    <p>Comprador: <b>${esc(c.nome || '')}</b> ${c.cpf ? '· CPF/CNPJ ' + esc(c.cpf) : ''}<br>Data da venda: ${dateBR(v.data)} · Valor total: <b>${brl(v.valorTotal)}</b> · Entrada: ${brl(v.entrada)} · ${v.numParcelas}x de ${brl(v.valorParcela)}<br>
    Recebido: <b>${brl(r.recebido)}</b> · Saldo devedor: <b>${brl(r.saldo)}</b></p>
    <table><tr><th>Parcela</th><th>Vencimento</th><th class="r">Valor</th><th>Pago em</th><th class="r">Valor pago</th></tr>
    ${ps.map(p => `<tr><td>${p.n === 0 ? 'Entrada' : p.n}</td><td>${dateBR(p.venc)}</td><td class="r">${brl(p.valor)}</td><td>${p.pago ? dateBR(p.pagoEm) : (p.venc < todayISO() ? 'EM ATRASO' : '')}</td><td class="r">${p.pago ? brl(p.valorPago) : ''}</td></tr>`).join('')}</table>
    <script>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
}

// ---------------------------------------------------------------- Histórico do lote
export function historicoLote(id) {
  const l = S.lotes[id];
  const evs = Object.values(S.historico).filter(h => h.loteId === id).sort((a, b) => b.ts - a.ts);
  return modal({ title: `Histórico · ${loteShort(l)}`, body: evs.length ? `<ul class="timeline">${evs.map(h => `<li><span class="when">${dateTimeBR(h.ts)}</span><span>${esc(h.desc)}<br><span class="small muted">${esc(h.usuario || '')}</span></span></li>`).join('')}</ul>` : '<p class="muted">Nenhum registro para este lote.</p>', actions: [{ label: 'Fechar', cls: 'primary' }] });
}

// ---------------------------------------------------------------- Busca de lotes (texto livre)
/** "A12", "a-12", "12", "quadra b", nome do comprador */
export function buscarLotes(q, lista) {
  q = norm(q).trim(); if (!q) return lista;
  const m = q.match(/^(?:q(?:uadra)?\s*)?([a-z]{1,2})\s*[-\s/]?\s*(\d{1,3})$/);
  if (m) return lista.filter(l => norm(l.quadra) === m[1] && +l.numero === +m[2]);
  const mq = q.match(/^(?:q(?:uadra)?\s*)?([a-z])$/);
  if (mq) return lista.filter(l => norm(l.quadra) === mq[1]);
  if (/^\d{1,3}$/.test(q)) return lista.filter(l => +l.numero === +q);
  return lista.filter(l => {
    const vv = valoresLote(l); const c = vv.compradorId ? S.compradores[vv.compradorId] : null;
    return c && (norm(c.nome).includes(q) || norm(c.cpf).includes(q));
  });
}
