import { S, empCurto, localStorageSet } from '../state.js';
import { esc, STATUS, loteShort, badge } from '../util.js';
import { loteDetalheHTML, loteAcoesHTML, bindLoteAcoes, buscarLotes } from '../forms.js';
import { empSeg } from './painel.js';

let el, svg, vp, box, emp, sel = null, hits = new Set();
let view = { s: 1, tx: 0, ty: 0 }, fitS = 1;
const visiveis = new Set(Object.keys(STATUS));
const SVGNS = 'http://www.w3.org/2000/svg';

function mount(e, params = {}) {
  el = e;
  if (params.lote && S.geoIndex[params.lote]) S.emp = S.geoIndex[params.lote].emp;
  if (S.emp === 'all' || !S.geo.empreendimentos.some(x => x.id === S.emp)) S.emp = 'E1';
  emp = S.geo.empreendimentos.find(x => x.id === S.emp);
  el.innerHTML = `<div class="map-page">
    <div class="map-toolbar">
      ${empSeg(emp.id, false)}
      <input class="input search" id="mBusca" type="search" placeholder="Buscar lote (ex.: A-12), quadra ou comprador" autocomplete="off">
    </div>
    <div class="map-box" id="mBox">
      <svg id="mSvg" aria-label="Mapa do ${esc(emp.nome)}"><g id="mVp"></g></svg>
      <div class="map-zoom">
        <button type="button" data-z="in" aria-label="Aproximar">+</button>
        <button type="button" data-z="out" aria-label="Afastar">−</button>
        <button type="button" data-z="fit" aria-label="Enquadrar" title="Enquadrar">⤢</button>
      </div>
      <div class="map-legend" id="mLeg"></div>
      <div class="results hidden" id="mRes"></div>
      <div class="lot-panel hidden" id="mPanel"></div>
    </div>
    <div class="small muted" id="mNota"></div>
  </div>`;
  svg = el.querySelector('#mSvg'); vp = el.querySelector('#mVp'); box = el.querySelector('#mBox');
  el.querySelector('[data-seg]').onclick = ev => {
    const b = ev.target.closest('button'); if (!b || b.dataset.v === emp.id) return;
    S.emp = b.dataset.v; localStorageSet('emp', S.emp); sel = null; hits.clear(); mount(el);
  };
  draw();
  bindPanZoom();
  bindSearch();
  legend();
  fit();
  if (params.lote) select(params.lote, true);
  requestAnimationFrame(() => { if (!svg) return; if (params.lote) centerOn(params.lote, true); else fit(); });
  window.addEventListener('resize', onResize);
}

function onResize() { if (svg?.isConnected) applyView(); }

function draw() {
  const { w, h, img } = emp.mapa;
  vp.innerHTML = '';
  const im = document.createElementNS(SVGNS, 'image');
  im.setAttribute('href', img); im.setAttribute('width', w); im.setAttribute('height', h);
  im.setAttribute('preserveAspectRatio', 'none');
  vp.appendChild(im);
  const g = document.createElementNS(SVGNS, 'g'); g.id = 'mLots'; vp.appendChild(g);
  for (const l of emp.lotes) {
    const p = document.createElementNS(SVGNS, 'polygon');
    p.setAttribute('points', l.poly.map(pt => pt.join(',')).join(' '));
    p.dataset.id = l.id;
    const t = document.createElementNS(SVGNS, 'title'); p.appendChild(t);
    g.appendChild(p);
  }
  paint();
}

function paint() {
  if (!vp) return;
  let semGeo = 0;
  for (const p of vp.querySelectorAll('polygon')) {
    const id = p.dataset.id; const l = S.lotes[id];
    const st = l?.status || 'bloqueado';
    p.setAttribute('class', `lot ${st}${id === sel ? ' sel' : ''}${hits.has(id) ? ' hit' : ''}${!visiveis.has(st) || (hits.size && !hits.has(id)) ? ' dim' : ''}`);
    p.style.display = l ? '' : 'none';
    p.firstChild.textContent = l ? `${loteShort(l)} · ${STATUS[st]?.label}` : '';
  }
  for (const [id, l] of Object.entries(S.lotes)) if (l.emp === emp.id && !S.geoIndex[id]) semGeo++;
  el.querySelector('#mNota').textContent = semGeo ? `${semGeo} lote(s) cadastrado(s) manualmente não têm posição na planta; veja-os na tela Lotes.` : `Mapa: ${emp.planta}. Toque em um lote para ver os detalhes.`;
}

function legend() {
  const leg = el.querySelector('#mLeg');
  const cont = {};
  for (const l of Object.values(S.lotes)) if (l.emp === emp.id) cont[l.status] = (cont[l.status] || 0) + 1;
  leg.innerHTML = Object.entries(STATUS).map(([k, s]) => `<label><input type="checkbox" data-st="${k}" ${visiveis.has(k) ? 'checked' : ''}><i style="background:${s.color}"></i>${s.label} (${cont[k] || 0})</label>`).join('');
  leg.onchange = e => { const k = e.target.dataset.st; if (e.target.checked) visiveis.add(k); else visiveis.delete(k); paint(); };
}

// ---------------------------------------------------------------- Pan & zoom
function applyView() { vp.setAttribute('transform', `translate(${view.tx},${view.ty}) scale(${view.s})`); }
function fit() {
  const r = svg.getBoundingClientRect(); const { w, h } = emp.mapa;
  fitS = Math.min(r.width / w, r.height / h) || 0.3;
  view = { s: fitS, tx: (r.width - w * fitS) / 2, ty: (r.height - h * fitS) / 2 };
  applyView();
}
function zoomAt(f, cx, cy) {
  const s = Math.min(Math.max(view.s * f, fitS * 0.6), fitS * 14);
  f = s / view.s;
  view.tx = cx - (cx - view.tx) * f; view.ty = cy - (cy - view.ty) * f; view.s = s;
  applyView();
}
function centerOn(id, zoom) {
  const l = S.geoIndex[id]; if (!l) return;
  const xs = l.poly.map(p => p[0]), ys = l.poly.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const r = svg.getBoundingClientRect();
  if (zoom) view.s = Math.max(view.s, fitS * 4);
  const panelW = window.innerWidth > 860 && !el.querySelector('#mPanel').classList.contains('hidden') ? 340 : 0;
  const visH = window.innerWidth <= 860 && sel ? r.height * 0.38 : r.height;
  view.tx = (r.width - panelW) / 2 - cx * view.s; view.ty = visH / 2 - cy * view.s;
  applyView();
}

function bindPanZoom() {
  const pts = new Map();
  let start = null, moved = false, downTarget = null, pinch = null;
  const local = e => { const r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  svg.addEventListener('pointerdown', e => {
    try { svg.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético ou não suportado */ }
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) { start = { ...local(e), tx: view.tx, ty: view.ty }; moved = false; downTarget = e.target.closest('polygon')?.dataset.id || null; }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      moved = true;
    }
  });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, local(e));
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      view.tx += mx - pinch.mx; view.ty += my - pinch.my;
      zoomAt(d / pinch.d, mx, my);
      pinch = { d, mx, my };
    } else if (pts.size === 1 && start) {
      const p = local(e);
      if (Math.hypot(p.x - start.x, p.y - start.y) > 6) moved = true;
      if (moved) { svg.classList.add('dragging'); view.tx = start.tx + p.x - start.x; view.ty = start.ty + p.y - start.y; applyView(); }
    }
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) { const p = [...pts.values()][0]; start = { ...p, tx: view.tx, ty: view.ty }; }
    if (pts.size === 0) {
      svg.classList.remove('dragging');
      if (!moved && e.type === 'pointerup') { if (downTarget) select(downTarget); else closePanel(); }
      start = null;
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
  el.querySelector('.map-zoom').onclick = e => {
    const z = e.target.closest('button')?.dataset.z; if (!z) return;
    const r = svg.getBoundingClientRect();
    if (z === 'fit') fit(); else zoomAt(z === 'in' ? 1.5 : 1 / 1.5, r.width / 2, r.height / 2);
  };
}

// ---------------------------------------------------------------- Seleção
function select(id, center) {
  sel = id;
  const panel = el.querySelector('#mPanel');
  panel.classList.remove('hidden');
  renderPanel();
  paint();
  if (center) centerOn(id, true);
}
function renderPanel() {
  const panel = el.querySelector('#mPanel');
  if (!sel || panel.classList.contains('hidden')) return;
  panel.innerHTML = `<button class="close" type="button" aria-label="Fechar">✕</button>${loteDetalheHTML(sel)}${loteAcoesHTML(sel)}`;
  panel.querySelector('.close').onclick = closePanel;
  bindLoteAcoes(panel, sel);
}
function closePanel() { sel = null; el.querySelector('#mPanel').classList.add('hidden'); paint(); }

// ---------------------------------------------------------------- Busca
function bindSearch() {
  const inp = el.querySelector('#mBusca'), res = el.querySelector('#mRes');
  const run = () => {
    const q = inp.value.trim();
    hits.clear();
    if (!q) { res.classList.add('hidden'); paint(); return; }
    const lista = Object.entries(S.lotes).filter(([id, l]) => l.emp === emp.id && S.geoIndex[id]).map(([id, l]) => ({ id, ...l }));
    const r = buscarLotes(q, lista).sort((a, b) => a.quadra.localeCompare(b.quadra) || a.numero - b.numero);
    r.forEach(l => hits.add(l.id));
    res.classList.remove('hidden');
    res.innerHTML = r.length ? r.slice(0, 80).map(l => `<div data-id="${l.id}"><span>${loteShort(l)}</span>${badge(l.status)}</div>`).join('') + (r.length > 80 ? `<div class="muted">+${r.length - 80}…</div>` : '') : '<div class="muted">Nenhum lote encontrado.</div>';
    paint();
    if (r.length === 1) select(r[0].id, true);
  };
  let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(run, 200); };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); run(); const f = res.querySelector('[data-id]'); if (f) select(f.dataset.id, true); } };
  res.onclick = e => { const d = e.target.closest('[data-id]'); if (d) { select(d.dataset.id, true); if (window.innerWidth <= 860) res.classList.add('hidden'); } };
}

export default {
  mount,
  refresh() { paint(); legend(); renderPanel(); },
  unmount() { window.removeEventListener('resize', onResize); svg = vp = null; }
};
