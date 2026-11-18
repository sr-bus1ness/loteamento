export const STATUS = {
  disponivel: { label: 'Disponível', color: 'var(--st-disponivel)' },
  vendido: { label: 'Vendido', color: 'var(--st-vendido)' },
  reservado: { label: 'Reservado', color: 'var(--st-reservado)' },
  bloqueado: { label: 'Indisponível', color: 'var(--st-bloqueado)' }
};

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = v => (v === null || v === undefined || v === '' || isNaN(v)) ? '—' : fmtBRL.format(+v);
export const num = (v, d = 2) => (v === null || v === undefined || isNaN(v)) ? '—' : (+v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (a, b) => b ? (a / b * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '0%';
export const round2 = v => Math.round((+v + Number.EPSILON) * 100) / 100;

/** "1.234,56" | "1234.56" | number -> number|null */
export function parseMoney(s) {
  if (typeof s === 'number') return s;
  s = String(s ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
export const moneyIn = v => (v === null || v === undefined || v === '') ? '' : (+v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export const dateBR = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
export const dateTimeBR = ts => ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

export const badge = st => `<span class="badge b-${esc(st)}">${esc(STATUS[st]?.label || st)}</span>`;
export const loteLabel = l => l ? `Quadra ${esc(l.quadra)} · Lote ${String(l.numero).padStart(2, '0')}` : '—';
export const loteShort = l => l ? `${esc(l.quadra)}-${String(l.numero).padStart(2, '0')}` : '—';

export function toast(msg, err = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), err ? 5000 : 2600);
}

/**
 * Abre um modal. body: string HTML. actions: [{label, cls, value, onClick(form) -> false para manter aberto}]
 * Retorna Promise com o value da ação escolhida (ou null ao fechar).
 */
export function modal({ title, body, actions = [], wide = false, onOpen }) {
  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<form class="modal ${wide ? 'wide' : ''}" novalidate>
      <header><h3>${esc(title)}</h3><button type="button" data-x aria-label="Fechar">✕</button></header>
      <div class="body">${body}</div>
      ${actions.length ? `<footer>${actions.map((a, i) => `<button type="${a.submit ? 'submit' : 'button'}" class="btn ${a.cls || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</footer>` : ''}
    </form>`;
    const form = bg.querySelector('form');
    const close = v => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('mousedown', e => { if (e.target === bg) close(null); });
    bg.querySelector('[data-x]').onclick = () => close(null);
    const run = async (a, btn) => {
      if (a.onClick) {
        btn.disabled = true;
        try { const r = await a.onClick(form, close); if (r === false) { btn.disabled = false; return; } }
        catch (e) { console.error(e); toast(e.message || 'Erro', true); btn.disabled = false; return; }
      }
      close(a.value ?? a.label);
    };
    form.addEventListener('submit', e => { e.preventDefault(); const i = actions.findIndex(a => a.submit); if (i >= 0) run(actions[i], form.querySelector(`[data-i="${i}"]`)); });
    form.querySelectorAll('footer [data-i]').forEach(b => { const a = actions[+b.dataset.i]; if (!a.submit) b.onclick = () => run(a, b); });
    document.body.appendChild(bg);
    onOpen?.(form, close);
    form.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  });
}

export const confirmDlg = (title, msg, okLabel = 'Confirmar', danger = false) =>
  modal({ title, body: `<p>${msg}</p>`, actions: [{ label: 'Cancelar', value: false }, { label: okLabel, cls: danger ? 'danger' : 'primary', value: true }] }).then(v => v === true);

export const fval = (form, name) => form.elements[name]?.value?.trim() ?? '';

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const ICON = {
  painel: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  mapa: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
  lotes: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></svg>',
  compradores: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"/><path d="M1 21c0-4 4-6 8-6s8 2 8 6"/><path d="M17 4a4 4 0 0 1 0 8M23 21c0-3-2-5-5-5.5"/></svg>',
  financeiro: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  historico: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/></svg>',
  config: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};
