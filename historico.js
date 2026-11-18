import { S } from '../state.js';
import { esc, dateTimeBR, norm } from '../util.js';

let el, tipo = '', busca = '', limite = 200;
const TIPOS = { '': 'Todos', status: 'Status dos lotes', usuario: 'Usuários', sistema: 'Sistema' };

function mount(e) {
  el = e;
  el.innerHTML = `<div class="list-actions">
    <input class="input" type="search" id="hBusca" placeholder="Buscar no histórico (lote, comprador, usuário…)" style="flex:1;min-width:200px" value="${esc(busca)}">
    <select class="input" id="hTipo" style="width:auto">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${k === tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
  </div><div class="card" id="hOut"></div>`;
  let t; el.querySelector('#hBusca').oninput = ev => { clearTimeout(t); t = setTimeout(() => { busca = ev.target.value; refresh(); }, 200); };
  el.querySelector('#hTipo').onchange = ev => { tipo = ev.target.value; refresh(); };
  refresh();
}

function refresh() {
  if (!el) return;
  const q = norm(busca);
  const evs = Object.values(S.historico).filter(h => (!tipo || h.tipo === tipo) && (!q || norm(h.desc).includes(q) || norm(h.usuario).includes(q))).sort((a, b) => b.ts - a.ts);
  const out = el.querySelector('#hOut');
  out.innerHTML = evs.length ? `<ul class="timeline">${evs.slice(0, limite).map(h => `<li><span class="when">${dateTimeBR(h.ts)}</span><span>${esc(h.desc)}<br><span class="small muted">${esc(TIPOS[h.tipo] || h.tipo)} · ${esc(h.usuario || '')}</span></span></li>`).join('')}</ul>
    ${evs.length > limite ? `<div style="text-align:center;margin-top:10px"><button class="btn" id="hMais">Mostrar mais (${evs.length - limite})</button></div>` : ''}` : '<div class="empty">Nenhum registro.</div>';
  out.querySelector('#hMais')?.addEventListener('click', () => { limite += 300; refresh(); });
}

export default { mount, refresh, unmount() { el = null; } };
