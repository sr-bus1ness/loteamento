import { S, can } from '../state.js';
import * as store from '../store.js';
import { esc, toast, fval, download, confirmDlg, dateTimeBR, modal } from '../util.js';
import { seedLotes } from '../ops.js';

let el;
const PAPEIS = { admin: 'Administrador', operador: 'Operador', leitura: 'Somente leitura', pendente: 'Pendente', bloqueado: 'Bloqueado' };

function mount(e) { el = e; refresh(); }

function refresh() {
  if (!el) return;
  const emp = S.config?.empresa || {};
  const admin = can.admin();
  const faltando = S.geo.empreendimentos.reduce((n, x) => n + x.lotes.filter(l => !S.lotes[l.id]).length, 0);
  el.innerHTML = `<div class="grid two">
    <form class="card" id="cEmp">
      <h3>Empresa</h3>
      <div class="row" style="margin-bottom:12px"><div class="brand-mark" style="width:64px;height:64px">${emp.logo ? `<img src="${esc(emp.logo)}" alt="Logomarca">` : esc((emp.nome || 'L')[0])}</div>
        ${admin ? `<label class="btn">Enviar logomarca<input type="file" accept="image/*" id="cLogo" hidden></label>${emp.logo ? '<button type="button" class="btn danger" id="cLogoX">Remover</button>' : ''}` : ''}</div>
      <div class="field"><label>Nome da empresa</label><input class="input" name="nome" value="${esc(emp.nome || '')}" ${admin ? '' : 'disabled'}></div>
      <div class="form-grid">
        <div class="field"><label>CNPJ</label><input class="input" name="cnpj" value="${esc(emp.cnpj || '')}" ${admin ? '' : 'disabled'}></div>
        <div class="field"><label>Cidade</label><input class="input" name="cidade" value="${esc(emp.cidade || '')}" ${admin ? '' : 'disabled'}></div>
        <div class="field"><label>Telefone</label><input class="input" name="telefone" value="${esc(emp.telefone || '')}" ${admin ? '' : 'disabled'}></div>
      </div>
      ${admin ? '<button class="btn primary">Salvar</button>' : ''}
    </form>
    <div class="card">
      <h3>Dados e segurança</h3>
      <p class="small">Banco de dados: <b>${store.MODE === 'firebase' ? 'Firebase Realtime Database (nuvem, sincronização em tempo real)' : 'MODO LOCAL — dados apenas neste navegador'}</b></p>
      ${store.MODE === 'local' ? '<div class="notice">Configure o Firebase em <code>js/firebase-config.js</code> para salvar na nuvem e sincronizar entre dispositivos (veja o README).</div>' : ''}
      <p class="small muted">Lotes das plantas: ${S.geo.empreendimentos.map(x => `${esc(x.nome)}: ${x.lotes.length}`).join(' · ')}. ${faltando ? `<b>${faltando} lote(s) da planta não estão no banco.</b>` : 'Todos presentes no banco.'}</p>
      <div class="row">
        <button class="btn" id="cBackup">Baixar backup (JSON)</button>
        ${admin && faltando ? `<button class="btn" id="cSeed">Importar ${faltando} lote(s) da planta</button>` : ''}
        ${admin ? '<label class="btn">Restaurar backup<input type="file" accept="application/json,.json" id="cRestore" hidden></label>' : ''}
      </div>
    </div>
  </div>
  ${admin && store.MODE === 'firebase' ? `<div class="card" style="margin-top:14px"><h3>Usuários</h3>
    <p class="small muted">Novos usuários criam a conta na tela de login e aparecem aqui como “Pendente”. Defina o nível de acesso: <b>Administrador</b> (consulta, altera o status dos lotes e gerencia usuários) ou <b>Somente leitura</b>/<b>Operador</b> (corretor: apenas consulta).</p>
    <div class="table-wrap"><table class="t"><thead><tr><th>Nome</th><th>E-mail</th><th>Desde</th><th>Acesso</th></tr></thead><tbody>
    ${Object.entries(S.usuarios).sort((a, b) => (a[1].nome || '').localeCompare(b[1].nome || '')).map(([uid, u]) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td class="small">${dateTimeBR(u.criadoEm)}</td>
      <td><select class="input" data-uid="${uid}" style="width:auto" ${uid === S.user.uid ? 'disabled title="Você não pode alterar o próprio acesso"' : ''}>${Object.entries(PAPEIS).map(([k, t]) => `<option value="${k}" ${u.papel === k ? 'selected' : ''}>${t}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table></div></div>` : ''}`;

  el.querySelector('#cEmp').onsubmit = async ev => {
    ev.preventDefault(); const f = ev.target;
    await store.update({ 'config/empresa/nome': fval(f, 'nome') || null, 'config/empresa/cnpj': fval(f, 'cnpj') || null, 'config/empresa/cidade': fval(f, 'cidade') || null, 'config/empresa/telefone': fval(f, 'telefone') || null });
    toast('Dados da empresa salvos.');
  };
  el.querySelector('#cLogo')?.addEventListener('change', async ev => {
    const file = ev.target.files[0]; if (!file) return;
    try { await store.update({ 'config/empresa/logo': await reduzirImagem(file, 256) }); toast('Logomarca atualizada.'); }
    catch (e) { toast('Não foi possível usar esta imagem.', true); }
  });
  el.querySelector('#cLogoX')?.addEventListener('click', async () => { await store.update({ 'config/empresa/logo': null }); });
  el.querySelector('#cBackup').onclick = backup;
  el.querySelector('#cSeed')?.addEventListener('click', async () => { const n = await seedLotes(S.geo); toast(`${n} lote(s) importado(s).`); });
  el.querySelector('#cRestore')?.addEventListener('change', restaurar);
  el.querySelectorAll('[data-uid]').forEach(s => s.onchange = async () => {
    const uid = s.dataset.uid; const u = S.usuarios[uid];
    const k = store.newKey('historico');
    await store.update({ [`usuarios/${uid}/papel`]: s.value, [`historico/${k}`]: { ts: Date.now(), uid: S.user.uid, usuario: S.me.nome, tipo: 'usuario', desc: `Acesso de ${u.nome} (${u.email}) alterado para ${PAPEIS[s.value]}.` } });
    toast('Acesso atualizado.');
  });
}

function reduzirImagem(file, max) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); res(c.toDataURL('image/png'));
    };
    img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}

const NODES = ['lotes', 'compradores', 'vendas', 'parcelas', 'pagamentos', 'historico', 'config', 'empreendimentos'];
function backup() {
  const data = { versao: 1, geradoEm: new Date().toISOString(), por: S.me?.email };
  for (const n of NODES) data[n] = S[n] || {};
  download(`backup-loteamento-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`, JSON.stringify(data, null, 1));
}

async function restaurar(ev) {
  const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
  let data; try { data = JSON.parse(await file.text()); } catch { return toast('Arquivo inválido.', true); }
  if (!data.versao || !data.lotes) return toast('Este arquivo não é um backup do sistema.', true);
  const resumo = `${Object.keys(data.lotes).length} lotes, ${Object.keys(data.compradores || {}).length} compradores, ${Object.keys(data.vendas || {}).length} vendas, gerado em ${esc(data.geradoEm || '?')}`;
  if (!await confirmDlg('Restaurar backup', `Os dados atuais de lotes, compradores, vendas, parcelas, pagamentos e histórico serão <b>substituídos</b> por este backup (${resumo}). Recomenda-se baixar um backup atual antes. Continuar?`, 'Substituir dados', true)) return;
  const paths = {};
  for (const n of NODES) paths[n] = data[n] || null;
  const k = store.newKey('historico');
  paths.historico = { ...(data.historico || {}), [k]: { ts: Date.now(), uid: S.user.uid, usuario: S.me.nome, tipo: 'sistema', desc: `Backup restaurado (${resumo}).` } };
  await store.update(paths);
  toast('Backup restaurado.');
}

export default { mount, refresh, unmount() { el = null; } };
