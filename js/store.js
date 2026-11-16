// Camada de dados: Firebase Realtime Database + Auth, ou modo local (localStorage).
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
export const MODE = firebaseConfig.apiKey ? 'firebase' : 'local';

let fb = null;   // { app, auth, db, A: authModule, D: dbModule }

// ---------------------------------------------------------------- Local mode
const LS_KEY = 'loteamento-db-v1';
const local = {
  tree: {},
  listeners: new Set(),
  load() { try { this.tree = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { this.tree = {}; } },
  save() { try { localStorage.setItem(LS_KEY, JSON.stringify(this.tree)); } catch (e) { console.warn(e); } },
  get(path) {
    let n = this.tree;
    for (const k of split(path)) { if (n == null) return null; n = n[k]; }
    return n === undefined ? null : clone(n);
  },
  put(path, val) {
    const ks = split(path);
    if (!ks.length) { this.tree = val ?? {}; return; }
    let n = this.tree;
    for (const k of ks.slice(0, -1)) { if (typeof n[k] !== 'object' || n[k] === null) n[k] = {}; n = n[k]; }
    const last = ks[ks.length - 1];
    if (val === null || val === undefined) delete n[last]; else n[last] = clone(val);
    prune(this.tree, ks);
  },
  emit() { for (const l of this.listeners) l.cb(this.get(l.path)); }
};
function prune(tree, ks) {
  // remove objetos vazios deixados por exclusões (comportamento do RTDB)
  for (let i = ks.length - 1; i > 0; i--) {
    let n = tree; for (const k of ks.slice(0, i - 1)) n = n?.[k];
    const k = ks[i - 1];
    if (n && n[k] && typeof n[k] === 'object' && !Object.keys(n[k]).length) delete n[k]; else break;
  }
}
const split = p => String(p || '').split('/').filter(Boolean);
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------- API
export async function init() {
  if (MODE === 'local') { local.load(); return; }
  const [appM, authM, dbM] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-database.js`)
  ]);
  const app = appM.initializeApp(firebaseConfig);
  const auth = authM.getAuth(app);
  await authM.setPersistence(auth, authM.browserLocalPersistence);
  fb = { app, auth, db: dbM.getDatabase(app), A: authM, D: dbM, appM };
}

export function onAuth(cb) {
  if (MODE === 'local') {
    const u = JSON.parse(sessionStorage.getItem('local-user') || 'null');
    setTimeout(() => cb(u), 0);
    local.authCb = cb;
    return () => {};
  }
  return fb.A.onAuthStateChanged(fb.auth, u => cb(u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null));
}

export async function login(email, senha) {
  if (MODE === 'local') {
    const u = { uid: 'local-' + email.toLowerCase().replace(/[^a-z0-9]/g, ''), email, displayName: email.split('@')[0] };
    sessionStorage.setItem('local-user', JSON.stringify(u));
    local.authCb?.(u); return u;
  }
  const r = await fb.A.signInWithEmailAndPassword(fb.auth, email, senha);
  return r.user;
}

export async function register(email, senha, nome) {
  if (MODE === 'local') return login(email, senha);
  const r = await fb.A.createUserWithEmailAndPassword(fb.auth, email, senha);
  if (nome) await fb.A.updateProfile(r.user, { displayName: nome });
  return r.user;
}

export async function resetPassword(email) {
  if (MODE === 'local') throw new Error('Indisponível no modo local.');
  await fb.A.sendPasswordResetEmail(fb.auth, email);
}

export async function logout() {
  if (MODE === 'local') { sessionStorage.removeItem('local-user'); local.authCb?.(null); return; }
  await fb.A.signOut(fb.auth);
}

/** Observa um caminho; cb(valor) a cada alteração. Retorna função para cancelar. */
export function watch(path, cb, onError) {
  if (MODE === 'local') {
    const l = { path, cb }; local.listeners.add(l);
    setTimeout(() => cb(local.get(path)), 0);
    return () => local.listeners.delete(l);
  }
  return fb.D.onValue(fb.D.ref(fb.db, path), s => cb(s.val()), e => { console.error(path, e); onError?.(e); });
}

export async function get(path) {
  if (MODE === 'local') return local.get(path);
  const s = await fb.D.get(fb.D.ref(fb.db, path));
  return s.val();
}

/** Atualização atômica multi-caminho: { 'lotes/X/status': 'vendido', ... } */
export async function update(paths) {
  if (MODE === 'local') {
    for (const [p, v] of Object.entries(paths)) local.put(p, v);
    local.save(); local.emit(); return;
  }
  await fb.D.update(fb.D.ref(fb.db), paths);
}

export function newKey(path) {
  if (MODE === 'local') return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return fb.D.push(fb.D.child(fb.D.ref(fb.db), path)).key;
}

export function serverTime() {
  return Date.now();
}

export function onConnection(cb) {
  if (MODE === 'local') { cb(true); return () => {}; }
  return fb.D.onValue(fb.D.ref(fb.db, '.info/connected'), s => cb(!!s.val()));
}
