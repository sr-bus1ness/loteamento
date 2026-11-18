// Mapa de consulta: visão geral com as quadras -> toque numa quadra para aproximar ->
// toque num lote para ver os dados -> toque fora fecha os dados -> toque fora de novo volta à visão geral.
// Gestos: arrastar, pinça (zoom) e girar com dois dedos.
import { S, can, empCurto, localStorageSet } from '../state.js';
import { esc, STATUS, brl, num, toast } from '../util.js';
import { precoDe, statusDe } from '../precos.js';
import { alterarStatus } from '../ops.js';

let el, svg, vp, box, emp, mp;
let quadra = null, lote = null;          // quadra em foco / lote aberto
// câmera: ponto da tela = (tx,ty) + s * R(r) * ponto do mapa   (r em radianos)
let view = { s: 1, r: 0, tx: 0, ty: 0 }, animId = 0;
let letras = [], nums = [];
const PAD = 14, TOPO = 64;

function mount(e) {
  el = e;
  if (!S.mapa[S.emp]) S.emp = 'E1';
  emp = S.geo.empreendimentos.find(x => x.id === S.emp);
  mp = S.mapa[emp.id];
  quadra = lote = null;
  view = { s: 1, r: 0, tx: 0, ty: 0 };
  el.innerHTML = `<div class="map-box overview" id="mBox">
    <svg id="mSvg" aria-label="Mapa do ${esc(emp.nome)}"><g id="mVp"></g></svg>
    <div class="map-top">
      <div class="seg" data-seg>${S.geo.empreendimentos.map(x => `<button type="button" data-v="${x.id}" class="${x.id === emp.id ? 'active' : ''}">${esc(empCurto(x.id))}</button>`).join('')}</div>
      <button type="button" class="map-back hidden" id="mBack">‹ Quadras</button>
      <span class="spacer"></span>
      <button type="button" class="map-north hidden" id="mNorth" aria-label="Voltar o mapa para a posição original" title="Desfazer rotação"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2 7 13h10z" fill="#e5484d"/><path d="M12 22 7 13h10z" fill="#cfd8d4"/></svg></button>
    </div>
    <div class="map-hint" id="mHint">Toque em uma quadra</div>
    <div class="map-legend" id="mLeg">${['disponivel', 'reservado', 'vendido', 'bloqueado'].map(k => `<span><i class="st-${k}"></i>${STATUS[k].label}</span>`).join('')}</div>
    <div class="lot-panel hidden" id="mPanel"></div>
  </div>`;
  svg = el.querySelector('#mSvg'); vp = el.querySelector('#mVp'); box = el.querySelector('#mBox');
  el.querySelector('[data-seg]').onclick = ev => {
    const b = ev.target.closest('button'); if (!b || b.dataset.v === emp.id) return;
    S.emp = b.dataset.v; localStorageSet('emp', S.emp); mount(el);
  };
  el.querySelector('#mBack').onclick = () => overview();
  el.querySelector('#mNorth').onclick = () => animateTo(rotated(0));
  draw();
  bindGestures();
  requestAnimationFrame(() => { if (svg) setView(fitPts(homePts(), 0, false)); });
  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!svg?.isConnected) return;
  setView(quadra ? fitPts(quadraPts(quadra), view.r, true) : fitPts(homePts(), view.r, false));
}

// ---------------------------------------------------------------- Desenho
function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0; a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-6) return [poly[0][0], poly[0][1], 0];
  return [cx / (3 * a), cy / (3 * a), Math.abs(a / 2)];
}

function draw() {
  const lots = emp.lotes.map(l => {
    const [cx, cy, a] = centroid(l.poly);
    const fs = Math.max(7, Math.min(15, Math.sqrt(a) * 0.3));
    return {
      poly: `<polygon class="lot" data-id="${l.id}" data-q="${l.q}" points="${l.poly.map(p => p.join(',')).join(' ')}"/>`,
      num: `<text class="num" data-q="${l.q}" data-x="${cx.toFixed(1)}" data-y="${cy.toFixed(1)}" font-size="${fs.toFixed(1)}">${l.n}</text>`
    };
  });
  vp.innerHTML = `<path class="ruas" d="${mp.ruas}" fill-rule="evenodd"/>
    ${Object.entries(mp.quadras).map(([q, d]) => `<path class="quadra" data-q="${q}" d="${d.path}" fill-rule="evenodd"/>`).join('')}
    <g id="mLots">${lots.map(x => x.poly).join('')}</g>
    <g id="mNums">${lots.map(x => x.num).join('')}</g>
    <g id="mLetras">${Object.entries(mp.quadras).map(([q, d]) => `<g class="letra" data-q="${q}" data-x="${d.cx}" data-y="${d.cy}"><text>${esc(q)}</text></g>`).join('')}</g>`;
  letras = [...vp.querySelectorAll('.letra')];
  nums = [...vp.querySelectorAll('.num')];
  placeNums();
  paint();
}

function paint() {
  if (!vp) return;
  for (const p of vp.querySelectorAll('.lot')) {
    const id = p.dataset.id;
    p.setAttribute('class', `lot st-${statusDe(id)}${id === lote ? ' sel' : ''}${quadra && p.dataset.q !== quadra ? ' out' : ''}`);
  }
  for (const g of vp.querySelectorAll('[data-q].quadra, [data-q].num, [data-q].letra'))
    g.classList.toggle('out', !!quadra && g.dataset.q !== quadra);
}

const deg = r => r * 180 / Math.PI;

/** Letras: tamanho fixo na tela e sempre em pé, mesmo com zoom e rotação. */
function placeLetters() {
  const k = 1 / view.s, a = -deg(view.r);
  for (const g of letras) g.setAttribute('transform', `translate(${g.dataset.x},${g.dataset.y}) rotate(${a}) scale(${k})`);
}
/** Números dos lotes sempre em pé (atualizado ao fim de cada gesto/animação). */
function placeNums() {
  const a = -deg(view.r);
  for (const t of nums) t.setAttribute('transform', `translate(${t.dataset.x},${t.dataset.y}) rotate(${a})`);
}

// ---------------------------------------------------------------- Câmera
const rot = ([x, y], r) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
const toScreen = (p, v = view) => { const [x, y] = rot(p, v.r); return [v.tx + v.s * x, v.ty + v.s * y]; };
const toMap = (p, v = view) => rot([(p[0] - v.tx) / v.s, (p[1] - v.ty) / v.s], -v.r);

function homePts() {
  const pts = [];
  for (const d of Object.values(mp.quadras)) { const [x0, y0, x1, y1] = d.bbox; pts.push([x0 - 30, y0 - 30], [x1 + 30, y0 - 30], [x1 + 30, y1 + 30], [x0 - 30, y1 + 30]); }
  return pts;
}
const quadraPts = q => emp.lotes.filter(l => l.q === q).flatMap(l => l.poly);

/** Câmera que enquadra os pontos na tela, mantendo a rotação r. */
function fitPts(pts, r, tight) {
  const rect = svg.getBoundingClientRect(), pad = tight ? 24 : PAD;
  const W = rect.width - pad * 2, H = rect.height - TOPO - pad;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { const [x, y] = rot(p, r); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const s = Math.min(W / (x1 - x0), H / (y1 - y0));
  return { s, r, tx: pad + (W - (x1 - x0) * s) / 2 - x0 * s, ty: TOPO + (H - (y1 - y0) * s) / 2 - y0 * s };
}

/** Mesma câmera girada para o ângulo r, em torno do centro da tela. */
function rotated(r) {
  const rect = svg.getBoundingClientRect(), c = [rect.width / 2, rect.height / 2];
  const m = toMap(c);
  const [x, y] = rot(m, r);
  return { s: view.s, r, tx: c[0] - view.s * x, ty: c[1] - view.s * y };
}

function setView(v, final = true) {
  view = { ...v };
  vp.setAttribute('transform', `translate(${view.tx},${view.ty}) rotate(${deg(view.r)}) scale(${view.s})`);
  placeLetters();
  if (final) placeNums();
  const girado = Math.abs(normAng(view.r)) > 0.01;
  el.querySelector('#mNorth').classList.toggle('hidden', !girado);
  el.querySelector('#mNorth svg').style.transform = `rotate(${deg(view.r)}deg)`;
}

const normAng = a => Math.atan2(Math.sin(a), Math.cos(a));

function animateTo(target, ms = 420) {
  const from = { ...view }, t0 = performance.now(), id = ++animId;
  const ease = t => 1 - Math.pow(1 - t, 3);
  const rect = svg.getBoundingClientRect(), c = [rect.width / 2, rect.height / 2];
  const m0 = toMap(c, from), m1 = toMap(c, target);
  const ls0 = Math.log(from.s), ls1 = Math.log(target.s);
  const dr = normAng(target.r - from.r);
  const step = now => {
    if (id !== animId || !vp) return;
    const t = Math.min(1, (now - t0) / ms), k = ease(t);
    const s = Math.exp(ls0 + (ls1 - ls0) * k), r = from.r + dr * k;
    const m = [m0[0] + (m1[0] - m0[0]) * k, m0[1] + (m1[1] - m0[1]) * k];
    const [x, y] = rot(m, r);
    setView({ s, r: t < 1 ? r : normAng(target.r), tx: c[0] - s * x, ty: c[1] - s * y }, t >= 1);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- Navegação
function focusQuadra(q) {
  quadra = q; lote = null;
  closePanel(false);
  box.classList.remove('overview'); box.classList.add('focus');
  el.querySelector('#mBack').classList.remove('hidden');
  el.querySelector('#mHint').textContent = `Quadra ${q} · toque em um lote`;
  paint();
  animateTo(fitPts(quadraPts(q), view.r, true));
}

function overview() {
  quadra = lote = null;
  closePanel(false);
  box.classList.add('overview'); box.classList.remove('focus');
  el.querySelector('#mBack').classList.add('hidden');
  el.querySelector('#mHint').textContent = 'Toque em uma quadra';
  paint();
  animateTo(fitPts(homePts(), view.r, false));
}

function openLote(id) {
  lote = id;
  el.querySelector('#mPanel').classList.remove('hidden');
  renderPanel();
  paint();
  ensureVisible(id);
}

function closePanel(repaint = true) {
  lote = null;
  el.querySelector('#mPanel').classList.add('hidden');
  if (repaint) paint();
}

/** Se o painel cobrir o lote escolhido, desliza o mapa para mostrá-lo. */
function ensureVisible(id) {
  const [cx, cy] = centroid(S.geoIndex[id].poly);
  const r = svg.getBoundingClientRect(), p = el.querySelector('#mPanel').getBoundingClientRect();
  const [sx, sy] = toScreen([cx, cy]);
  const lado = p.left - r.left > r.width * 0.4;            // painel lateral (paisagem) ou inferior (retrato)
  let dx = 0, dy = 0;
  if (lado && sx > p.left - r.left - 30) dx = (p.left - r.left) / 2 - sx;
  if (!lado && sy > p.top - r.top - 30) dy = Math.max(TOPO + 40, (p.top - r.top) / 2) - sy;
  if (dx || dy) animateTo({ ...view, tx: view.tx + dx, ty: view.ty + dy }, 300);
}

function tap(target) {
  const q = target.closest?.('[data-q]')?.dataset.q || null;
  const id = target.closest?.('.lot')?.dataset.id || null;
  if (!quadra) { if (q) focusQuadra(q); return; }
  if (id && q === quadra) { openLote(id); return; }
  if (lote) { closePanel(); return; }
  overview();
}

// ---------------------------------------------------------------- Gestos (toque, pinça, girar, arrastar, roda do mouse)
function bindGestures() {
  const pts = new Map();
  let start = null, moved = false, pinch = null, downTarget = null;
  const local = e => { const r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const limits = () => { const h = fitPts(homePts(), 0, false).s; return [h * 0.6, h * 25]; };
  const zoomAt = (v, f, cx, cy) => {
    const [min, max] = limits();
    const s = Math.min(Math.max(v.s * f, min), max); f = s / v.s;
    return { ...v, s, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f };
  };
  const rotateAt = (v, da, cx, cy) => {
    const [x, y] = rot([v.tx - cx, v.ty - cy], da);
    return { ...v, r: v.r + da, tx: cx + x, ty: cy + y };
  };
  const pinchState = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  svg.addEventListener('pointerdown', e => {
    try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) { start = { ...local(e), tx: view.tx, ty: view.ty }; moved = false; downTarget = e.target; }
    if (pts.size === 2) { animId++; pinch = { ...pinchState(), giro: 0, girando: false }; moved = true; }
  });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, local(e));
    if (pts.size >= 2 && pinch) {
      const n = pinchState();
      let v = { ...view, tx: view.tx + n.mx - pinch.mx, ty: view.ty + n.my - pinch.my };
      v = zoomAt(v, n.d / pinch.d, n.mx, n.my);
      // só começa a girar depois de ~12°, para a pinça de zoom não girar sem querer
      const da = normAng(n.ang - pinch.ang);
      pinch.giro += da;
      if (!pinch.girando && Math.abs(pinch.giro) > 0.21) { pinch.girando = true; v = rotateAt(v, pinch.giro, n.mx, n.my); }
      else if (pinch.girando) v = rotateAt(v, da, n.mx, n.my);
      setView(v, false);
      pinch = { ...n, giro: pinch.giro, girando: pinch.girando };
    } else if (pts.size === 1 && start) {
      const p = local(e);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) > 8) { moved = true; animId++; }
      if (moved) { svg.classList.add('dragging'); setView({ ...view, tx: start.tx + p.x - start.x, ty: start.ty + p.y - start.y }, false); }
    }
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) { const p = [...pts.values()][0]; start = { ...p, tx: view.tx, ty: view.ty }; }
    if (pts.size === 0) {
      svg.classList.remove('dragging');
      if (moved) placeNums();
      if (!moved && e.type === 'pointerup' && downTarget) tap(downTarget);
      start = null; downTarget = null;
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', e => {
    e.preventDefault(); animId++;
    const p = local(e);
    // Shift + roda gira (útil no computador); só a roda dá zoom
    if (e.shiftKey) setView(rotateAt(view, e.deltaY * 0.003, p.x, p.y));
    else setView(zoomAt(view, Math.exp(-e.deltaY * 0.0015), p.x, p.y));
  }, { passive: false });
}

// ---------------------------------------------------------------- Painel do lote
function renderPanel() {
  const panel = el.querySelector('#mPanel');
  if (!lote || panel.classList.contains('hidden')) return;
  const g = S.geoIndex[lote], st = statusDe(lote), pr = precoDe(lote), l = S.lotes[lote];
  const mostrarPreco = pr && st !== 'vendido';
  panel.innerHTML = `
    <div class="lp-head">
      <div>
        <div class="small muted">${esc(empCurto(g.emp))}</div>
        <h3>Quadra ${esc(g.q)} · Lote ${String(g.n).padStart(2, '0')}</h3>
      </div>
      <span class="badge b-${st}">${STATUS[st].label}</span>
    </div>
    <dl class="kv">
      <dt>Área</dt><dd>${g.area ? num(g.area) + ' m²' : '—'}</dd>
      ${mostrarPreco ? `
      <dt>Valor total</dt><dd class="money big">${brl(pr.total)}</dd>
      <dt>Entrada</dt><dd class="money">${pr.entradaPct != null ? `${pr.entradaPct}% · ` : ''}${brl(pr.entrada)}</dd>
      <dt>Parcelas</dt><dd class="money">${pr.numParcelas}x de ${brl(pr.parcela)}</dd>` : ''}
    </dl>
    ${mostrarPreco ? `<div class="small muted">Tabela atualizada em ${esc(pr.atualizada)}.</div>` : ''}
    ${!pr && st === 'bloqueado' ? '<div class="small muted">Este lote não consta na tabela de preços.</div>' : ''}
    ${can.admin() ? `<div class="lp-admin">
      <div class="small muted">Alterar status</div>
      <div class="st-btns">${['disponivel', 'reservado', 'vendido', 'bloqueado'].map(k => `<button type="button" data-st="${k}" class="${k === st ? 'active' : ''}"><i class="st-${k}"></i>${STATUS[k].label}</button>`).join('')}</div>
      ${l?.statusEm ? '<button type="button" class="btn sm" data-st="tabela">Voltar ao padrão da tabela</button>' : ''}
    </div>` : ''}`;
  panel.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => {
    const k = b.dataset.st; if (k === st && k !== 'tabela') return;
    b.disabled = true;
    try { await alterarStatus(lote, k); toast('Status atualizado.'); }
    catch (e) { console.error(e); toast(e.message || 'Erro ao salvar.', true); b.disabled = false; }
  });
}

export default {
  mount,
  refresh() { paint(); renderPanel(); },
  unmount() { animId++; window.removeEventListener('resize', onResize); svg = vp = box = null; }
};
