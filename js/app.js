import * as store from './store.js';
import { S, can } from './state.js';
import { esc, toast, ICON } from './util.js';
import { seedLotes } from './ops.js';

const ROUTES = [
  { id: 'painel', title: 'Painel', mod: './views/painel.js' },
  { id: 'mapa', title: 'Mapa', mod: './views/mapa.js' },
  { id: 'lotes', title: 'Lotes', mod: './views/lotes.js' },
  { id: 'compradores', title: 'Compradores', mod: './views/compradores.js' },
  { id: 'financeiro', title: 'Financeiro', mod: './views/financeiro.js' },
  { id: 'historico', title: 'Histórico', mod: './views/historico.js', desktopOnly: true },
  { id: 'config', title: 'Configurações', mod: './views/config.js', desktopOnly: true }
];
const NODES = ['lotes', 'compradores', 'vendas', 'parcelas', 'pagamentos', 'config', 'empreendimentos'];

const $ = id => document.getElementById(id);
let current = null;      // { id, view }
let unsubs = [];
let refreshQueued = false;

async function main() {
  try { await store.init(); }
  catch (e) { console.error(e); document.body.innerHTML = `<div class="login-wrap"><div class="login-card"><h1>Erro ao iniciar</h1><p>${esc(e.message)}</p></div></div>`; return; }
  S.geo = await fetch('data/loteamentos.json').then(r => r.json());
  for (const emp of S.geo.empreendimentos) for (const l of emp.lotes) S.geoIndex[l.id] = { emp: emp.id, ...l };
  setupLogin();
  store.onAuth(onUser);
  window.addEventListener('hashchange', route);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.match(/^(localhost|127\.)/))
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------------------------------------------------------------- Login
let registering = false;
function setupLogin() {
  const msg = (t, info) => { const m = $('loginMsg'); m.textContent = t; m.className = 'notice' + (info ? ' info' : ''); m.hidden = false; m.classList.toggle('hidden', !t); };
  if (store.MODE === 'local') msg('Modo local de teste: o Firebase ainda não foi configurado. Os dados ficam só neste navegador. Entre com qualquer e-mail.', true);
  $('lToggle').onclick = e => {
    e.preventDefault(); registering = !registering;
    $('fNome').hidden = !registering; $('lBtn').textContent = registering ? 'Criar conta' : 'Entrar';
    $('lToggle').textContent = registering ? 'Já tenho conta' : 'Criar conta';
  };
  $('lReset').onclick = async e => {
    e.preventDefault();
    const email = $('lEmail').value.trim(); if (!email) return msg('Informe o e-mail para recuperar a senha.');
    try { await store.resetPassword(email); msg('Enviamos um link de redefinição para o seu e-mail.', true); } catch (er) { msg(traduz(er)); }
  };
  $('loginForm').onsubmit = async e => {
    e.preventDefault();
    const email = $('lEmail').value.trim(), senha = $('lSenha').value;
    $('lBtn').disabled = true;
    try {
      if (registering) await store.register(email, senha, $('lNome').value.trim());
      else await store.login(email, senha);
    } catch (er) { msg(traduz(er)); }
    $('lBtn').disabled = false;
  };
}
function traduz(e) {
  const c = e.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'E-mail ou senha incorretos.';
  if (c.includes('email-already-in-use')) return 'Este e-mail já possui conta.';
  if (c.includes('weak-password')) return 'A senha deve ter pelo menos 6 caracteres.';
  if (c.includes('too-many-requests')) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (c.includes('network')) return 'Sem conexão com a internet.';
  return e.message || 'Erro inesperado.';
}

// ---------------------------------------------------------------- Sessão
let dataUnsubs = [];
const stopData = () => { dataUnsubs.forEach(f => f()); dataUnsubs = []; };

async function onUser(u) {
  unsubs.forEach(f => f()); unsubs = []; stopData();
  S.user = u; S.me = null;
  if (!u) { $('app').classList.add('hidden'); $('login').classList.remove('hidden'); return; }
  if (store.MODE === 'local') {
    S.me = { nome: u.displayName || u.email, email: u.email, papel: 'admin' };
    return start();
  }
  unsubs.push(store.watch(`usuarios/${u.uid}`, async perfil => {
    if (!perfil) {
      // primeiro acesso: o primeiro usuário do sistema vira administrador
      const adminExiste = await store.get('meta/adminCriado').catch(() => true);
      const p = { nome: u.displayName || u.email.split('@')[0], email: u.email, criadoEm: Date.now() };
      try {
        if (!adminExiste) await store.update({ [`usuarios/${u.uid}`]: { ...p, papel: 'admin' }, 'meta/adminCriado': u.uid });
        else await store.update({ [`usuarios/${u.uid}`]: { ...p, papel: 'pendente' } });
      } catch (e) { console.error(e); toast('Não foi possível criar o perfil: ' + e.message, true); }
      return;
    }
    const mudouPapel = S.me?.papel !== perfil.papel;
    S.me = perfil;
    if (perfil.papel === 'pendente' || perfil.papel === 'bloqueado') { stopData(); return telaPendente(perfil); }
    if (mudouPapel) start();
  }));
}

function telaPendente(p) {
  $('app').classList.add('hidden'); $('login').classList.remove('hidden');
  const m = $('loginMsg');
  m.className = 'notice'; m.classList.remove('hidden'); m.hidden = false;
  m.innerHTML = `Olá, <b>${esc(p.nome)}</b>. Sua conta ${p.papel === 'bloqueado' ? 'está bloqueada' : 'aguarda aprovação de um administrador'}. <a href="#" id="lOut">Sair</a>`;
  $('lOut').onclick = e => { e.preventDefault(); store.logout(); };
}

function start() {
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  stopData();
  const nodes = [...NODES]; if (can.admin()) nodes.push('usuarios');
  S.loaded = new Set();
  for (const n of nodes) {
    dataUnsubs.push(store.watch(n, v => {
      S[n] = v || {}; S.loaded.add(n);
      if (n === 'lotes' && !v && can.admin() && !start.seeding) {
        start.seeding = true;
        seedLotes(S.geo).then(c => toast(`${c} lotes importados das plantas.`)).catch(e => toast('Falha ao importar lotes: ' + e.message, true)).finally(() => { start.seeding = false; });
      }
      if (n === 'config') brand();
      queueRefresh();
    }, e => toast(`Sem permissão para ler "${n}". Verifique as regras do banco.`, true)));
  }
  dataUnsubs.push(store.watch('historico', v => { S.historico = v || {}; queueRefresh(); }));
  dataUnsubs.push(store.onConnection(on => { const c = $('conn'); c.textContent = on ? (store.MODE === 'local' ? 'modo local' : 'sincronizado') : 'offline'; c.classList.toggle('on', on); }));
  $('navUser').innerHTML = `${esc(S.me.nome)}<br><span style="opacity:.7">${esc(papelLabel(S.me.papel))}</span>`;
  $('btnSair').onclick = () => store.logout();
  buildNav(); brand(); route();
}
const papelLabel = p => ({ admin: 'Administrador', operador: 'Operador', leitura: 'Somente leitura' }[p] || p);

function brand() {
  const e = S.config?.empresa || {};
  const nome = e.nome || S.geo?.proprietario || 'Loteamentos';
  const mark = e.logo ? `<img src="${esc(e.logo)}" alt="">` : esc(nome.trim()[0] || 'L');
  $('navEmpresa').textContent = nome; $('navLogo').innerHTML = mark;
  $('loginEmpresa').textContent = nome; $('loginLogo').innerHTML = mark;
  document.title = `${nome} · Gestão de Loteamentos`;
}

function buildNav() {
  const link = r => `<a href="#/${r.id}" data-r="${r.id}">${ICON[r.id]}<span>${r.title}</span></a>`;
  $('nav').innerHTML = ROUTES.map(link).join('');
  $('bnav').innerHTML = ROUTES.filter(r => !r.desktopOnly).map(link).join('') + `<a href="#/mais" data-r="mais">${ICON.config}<span>Mais</span></a>`;
}

async function route() {
  if (!S.me || $('app').classList.contains('hidden')) return;
  let id = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'painel';
  if (id === 'mais') return maisMenu();
  const r = ROUTES.find(x => x.id === id) || ROUTES[0];
  document.querySelectorAll('[data-r]').forEach(a => a.classList.toggle('active', a.dataset.r === r.id || (a.dataset.r === 'mais' && !!r.desktopOnly)));
  $('pageTitle').textContent = r.title;
  current?.view?.unmount?.();
  const mod = await import(r.mod);
  const el = $('view'); el.innerHTML = ''; el.scrollTop = 0; window.scrollTo(0, 0);
  current = { id: r.id, view: mod.default };
  mod.default.mount(el, params());
}
export const params = () => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));

function maisMenu() {
  const el = $('view');
  $('pageTitle').textContent = 'Mais';
  document.querySelectorAll('[data-r]').forEach(a => a.classList.toggle('active', a.dataset.r === 'mais'));
  current?.view?.unmount?.(); current = null;
  el.innerHTML = `<div class="grid">${ROUTES.filter(r => r.desktopOnly).map(r => `<a class="card row" style="text-decoration:none;color:inherit" href="#/${r.id}">${ICON[r.id]} <b>${r.title}</b></a>`).join('')}
    <div class="card"><div class="small muted">Conectado como</div><b>${esc(S.me.nome)}</b> · ${esc(papelLabel(S.me.papel))}<div style="margin-top:10px"><button class="btn" id="mSair">Sair</button></div></div></div>`;
  $('mSair').onclick = () => store.logout();
}

function queueRefresh() {
  if (refreshQueued) return; refreshQueued = true;
  requestAnimationFrame(() => { refreshQueued = false; current?.view?.refresh?.(); });
}

main();
