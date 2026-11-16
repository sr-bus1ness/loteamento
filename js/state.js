// Estado global sincronizado com o banco.
export const S = {
  user: null,          // usuário autenticado
  me: null,            // perfil em /usuarios/{uid}
  geo: null,           // geometria das plantas (data/loteamentos.json)
  geoIndex: {},        // id do lote -> { emp, poly }
  lotes: {}, compradores: {}, vendas: {}, parcelas: {}, pagamentos: {}, historico: {},
  config: {}, usuarios: {}, empreendimentos: {},
  emp: localStorageGet('emp') || 'E1',  // empreendimento selecionado
  loaded: new Set()
};

export const can = {
  edit: () => ['admin', 'operador'].includes(S.me?.papel),
  admin: () => S.me?.papel === 'admin'
};

export function localStorageGet(k) { try { return localStorage.getItem('lot-' + k); } catch { return null; } }
export function localStorageSet(k, v) { try { localStorage.setItem('lot-' + k, v); } catch { /* ignore */ } }

export const lotesDoEmp = (emp = S.emp) => Object.entries(S.lotes).filter(([, l]) => !emp || emp === 'all' || l.emp === emp).map(([id, l]) => ({ id, ...l }));
export const sortLotes = arr => arr.sort((a, b) => (a.emp || '').localeCompare(b.emp || '') || a.quadra.localeCompare(b.quadra) || a.numero - b.numero);
export const empNome = id => S.empreendimentos[id]?.nome || S.geo?.empreendimentos.find(e => e.id === id)?.nome || id;
export const empCurto = id => ({ E1: 'Esperança I', E2: 'Esperança II' }[id] || empNome(id));
