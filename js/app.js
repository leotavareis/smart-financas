// ============================================================
// APP.JS â€” UtilitÃ¡rios gerais, componentes de UI e FAB
// Carregado em todas as pÃ¡ginas protegidas
// ============================================================

// â”€â”€ Estado global do mÃªs selecionado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let mesSelecionado = getMesAtual();

// ============================================================
// FORMATAÃ‡ÃƒO
// ============================================================

/** Formata nÃºmero para moeda BRL: 1234.5 â†’ "R$ 1.234,50" */
function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

/** Formata data (string ISO, Date ou Timestamp) para dd/mm/aaaa */
function formatarData(data) {
  if (!data) return 'â€”';
  if (data && typeof data.toDate === 'function') data = data.toDate();
  const d = new Date(data);
  if (isNaN(d)) return 'â€”';
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

/**
 * Normaliza string para busca: minÃºsculas, sem acentos, sem caracteres especiais.
 * Usado para match nas memÃ³rias de descriÃ§Ã£o.
 */
function normalizarString(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// TOAST â€” notificaÃ§Ãµes no canto inferior direito
// ============================================================

/**
 * Exibe uma notificaÃ§Ã£o temporÃ¡ria.
 * @param {string} mensagem
 * @param {'sucesso'|'erro'|'aviso'|'info'} tipo
 * @param {number} duracao  ms antes de sumir automaticamente
 */
function mostrarToast(mensagem, tipo = 'info', duracao = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icones = { sucesso: 'âœ“', erro: 'âœ•', aviso: 'âš ', info: 'â„¹' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = `
    <span class="toast-icon">${icones[tipo] || icones.info}</span>
    <span class="toast-msg">${mensagem}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">âœ•</button>
  `;
  container.appendChild(toast);

  // Entra com animaÃ§Ã£o
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  // Sai automaticamente
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 350);
  }, duracao);
}

// ============================================================
// LOADING â€” overlay de carregamento global
// ============================================================

function mostrarLoading(mostrar) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = mostrar ? 'flex' : 'none';
}

// ============================================================
// MODAL â€” sistema reutilizÃ¡vel
// ============================================================

function abrirModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('modal-open'); document.body.style.overflow = 'hidden'; }
}

function fecharModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('modal-open'); document.body.style.overflow = ''; }
}

// Fecha modal ao clicar no overlay escuro
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    const wrapper = e.target.closest('.modal-wrapper');
    if (wrapper) { wrapper.classList.remove('modal-open'); document.body.style.overflow = ''; }
  }
});

/**
 * Mostra diÃ¡logo de confirmaÃ§Ã£o antes de excluir algo.
 * @param {string} mensagem
 * @param {Function} callback - Executado se o usuÃ¡rio confirmar
 */
function confirmarExclusao(mensagem, callback) {
  const id = 'modalConfirmacaoGlobal';
  let modal = document.getElementById(id);

  if (!modal) {
    modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal-wrapper';
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-box modal-sm">
        <div class="modal-header">
          <h3 class="modal-title">Confirmar exclusÃ£o</h3>
        </div>
        <div class="modal-body">
          <p id="msgConfirmacao" style="color:var(--text-secondary);margin:0"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="fecharModal('${id}')">Cancelar</button>
          <button class="btn btn-danger" id="btnConfirmarExclusaoGlobal">Excluir</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('msgConfirmacao').textContent = mensagem;

  // Clonar botÃ£o para limpar listeners anteriores
  const btn    = document.getElementById('btnConfirmarExclusaoGlobal');
  const novBtn = btn.cloneNode(true);
  btn.replaceWith(novBtn);
  novBtn.addEventListener('click', () => { fecharModal(id); callback(); });

  abrirModal(id);
}

// ============================================================
// SELETOR DE MÃŠS â€” header de todas as pÃ¡ginas
// ============================================================

/**
 * Inicializa os botÃµes â€¹ e â€º do seletor de mÃªs.
 * @param {Function} callback - Chamado com o novo YYYY-MM ao mudar
 */
function inicializarSeletorMes(callback) {
  const display = document.getElementById('monthDisplay');
  const prev    = document.getElementById('prevMonth');
  const next    = document.getElementById('nextMonth');
  if (!display) return;

  const atualizar = () => {
    display.textContent = formatarMes(mesSelecionado);
    if (typeof callback === 'function') callback(mesSelecionado);
  };

  prev?.addEventListener('click', () => {
    mesSelecionado = deslocarMes(mesSelecionado, -1);
    atualizar();
  });
  next?.addEventListener('click', () => {
    mesSelecionado = deslocarMes(mesSelecionado, +1);
    atualizar();
  });

  atualizar();
}

// ============================================================
// SIDEBAR & NAVEGAÃ‡ÃƒO
// ============================================================

function inicializarSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebarOverlay');

  hamburger?.addEventListener('click', () => {
    sidebar?.classList.toggle('sidebar-open');
    overlay?.classList.toggle('visible');
  });
  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('sidebar-open');
    overlay?.classList.remove('visible');
  });

  // Marca o item ativo conforme URL atual
  const pagina = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('href') === pagina) item.classList.add('active');
  });
}

// ============================================================
// AVATAR DO USUÃRIO
// ============================================================

function inicializarAvatar(user) {
  const foto  = document.getElementById('userPhoto');
  const nome  = document.getElementById('userName');
  const email = document.getElementById('userEmail');

  if (foto && user.photoURL) { foto.src = user.photoURL; foto.alt = user.displayName; }
  if (nome)  nome.textContent  = user.displayName?.split(' ')[0] || 'UsuÃ¡rio';
  if (email) email.textContent = user.email || '';
}

// ============================================================
// FAB â€” botÃ£o flutuante de lanÃ§amento rÃ¡pido
// ============================================================

function inicializarFAB() {
  document.getElementById('fabBtn')?.addEventListener('click', () => {
    abrirModal('modalLancamentoRapido');
    carregarDadosLancamentoRapido();
  });
}

/** Popula selects do modal de lanÃ§amento rÃ¡pido */
async function carregarDadosLancamentoRapido() {
  try {
    // CartÃµes
    const snapCartoes = await colecaoUsuario('cartoes').orderBy('nome').get();
    const selCartao   = document.getElementById('lr-cartao');
    if (selCartao) {
      selCartao.innerHTML = '<option value="">â€” CartÃ£o â€”</option>';
      snapCartoes.forEach(d => {
        selCartao.innerHTML += `<option value="${d.id}">${d.data().nome}</option>`;
      });
    }

    // Pessoas
    const snapPessoas = await colecaoUsuario('pessoas').get();
    const selDono     = document.getElementById('lr-dono');
    if (selDono) {
      selDono.innerHTML = '<option value="eu">Eu mesmo</option>';
      snapPessoas.forEach(d => {
        const p = d.data();
        if (p.nome) selDono.innerHTML += `<option value="${d.id}">${p.nome}</option>`;
      });
    }

    // Data padrÃ£o = hoje
    const dtInput = document.getElementById('lr-data');
    if (dtInput) dtInput.value = new Date().toISOString().slice(0, 10);

  } catch (err) {
    console.error('[FAB] Erro ao carregar dados:', err);
  }
}

/** Salva o lanÃ§amento rÃ¡pido no Firestore */
async function salvarLancamentoRapido(e) {
  e.preventDefault();

  const cartaoId    = document.getElementById('lr-cartao').value;
  const descricao   = document.getElementById('lr-descricao').value.trim();
  const valorStr    = document.getElementById('lr-valor').value;
  const data        = document.getElementById('lr-data').value;
  const donoId      = document.getElementById('lr-dono').value;
  const parcelado   = document.getElementById('lr-parcelado').checked;
  const parcAtual   = parseInt(document.getElementById('lr-parcela-atual')?.value) || 1;
  const parcTotal   = parseInt(document.getElementById('lr-total-parcelas')?.value) || 1;

  const valor = parseFloat(valorStr.replace(',', '.'));

  if (!cartaoId || !descricao || isNaN(valor) || !data) {
    mostrarToast('Preencha todos os campos obrigatÃ³rios.', 'aviso');
    return;
  }

  const mes  = data.slice(0, 7);
  const dono = [{ pessoa_id: donoId, percentual: 100 }];

  try {
    mostrarLoading(true);

    // Garante que existe uma fatura para esse cartÃ£o/mÃªs
    const faturaId = await obterOuCriarFatura(cartaoId, mes);

    await colecaoUsuario('lancamentos').add({
      fatura_id     : faturaId,
      cartao_id     : cartaoId,
      descricao,
      valor,
      data,
      dono,
      parcela_atual : parcelado ? parcAtual  : 1,
      total_parcelas: parcelado ? parcTotal  : 1,
      mes,
      criado_em     : firebase.firestore.FieldValue.serverTimestamp()
    });

    await atualizarTotalFatura(faturaId);

    mostrarToast('LanÃ§amento salvo!', 'sucesso');
    fecharModal('modalLancamentoRapido');
    document.getElementById('formLancamentoRapido')?.reset();

    // Recarrega a pÃ¡gina atual se ela tiver essa funÃ§Ã£o
    if (typeof carregarPagina === 'function') carregarPagina();

  } catch (err) {
    console.error('[FAB] Erro ao salvar:', err);
    mostrarToast('Erro ao salvar lanÃ§amento.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

// ============================================================
// HELPERS DE FATURA
// ============================================================

/**
 * Busca a fatura de um cartÃ£o/mÃªs ou cria uma nova se nÃ£o existir.
 * @returns {string} faturaId
 */
async function obterOuCriarFatura(cartaoId, mes) {
  const snap = await colecaoUsuario('faturas')
    .where('cartao_id', '==', cartaoId)
    .where('mes', '==', mes)
    .limit(1)
    .get();

  if (!snap.empty) return snap.docs[0].id;

  const nova = await colecaoUsuario('faturas').add({
    cartao_id   : cartaoId,
    mes,
    total       : 0,
    status      : 'aberta',
    importada_em: firebase.firestore.FieldValue.serverTimestamp()
  });
  return nova.id;
}

/** Recalcula e atualiza o campo total de uma fatura. */
async function atualizarTotalFatura(faturaId) {
  const snap  = await colecaoUsuario('lancamentos').where('fatura_id', '==', faturaId).get();
  const total = snap.docs.reduce((s, d) => s + (d.data().valor || 0), 0);
  await colecaoUsuario('faturas').doc(faturaId).update({ total });
}

// ============================================================
// FLOAT LABELS â€” inputs com label flutuante
// ============================================================

function inicializarFloatLabels() {
  document.querySelectorAll('.fl-group input, .fl-group textarea, .fl-group select').forEach(inp => {
    const update = () => {
      const lbl = inp.closest('.fl-group')?.querySelector('label');
      if (!lbl) return;
      lbl.classList.toggle('floating', !!(inp.value || inp === document.activeElement));
    };
    inp.addEventListener('focus', update);
    inp.addEventListener('blur',  update);
    inp.addEventListener('input', update);
    update();
  });
}

// ============================================================
// TOGGLE CAMPOS DE PARCELAMENTO
// ============================================================

function toggleCamposParcela(checkId, camposId) {
  const chk    = document.getElementById(checkId);
  const campos = document.getElementById(camposId);
  if (!chk || !campos) return;

  const sync = () => {
    campos.style.display = chk.checked ? 'grid' : 'none';
  };
  chk.addEventListener('change', sync);
  sync();
}

// ============================================================
// GRÃFICO DE BARRAS â€” canvas vanilla (dashboard)
// ============================================================

/**
 * Desenha grÃ¡fico de barras duplas (receitas Ã— despesas).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} labels
 * @param {number[]} receitas
 * @param {number[]} despesas
 */
function desenharGrafico(ctx, labels, receitas, despesas) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const PAD = { top: 20, right: 20, bottom: 40, left: 60 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top  - PAD.bottom;

  ctx.clearRect(0, 0, W, H);

  const maxVal = Math.max(...receitas, ...despesas, 1) * 1.15;
  const n      = labels.length;
  const grpW   = plotW / n;
  const barW   = Math.min(grpW * 0.3, 28);

  // Linhas de grade
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + plotH - (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();

    // Valor no eixo Y
    ctx.fillStyle  = 'rgba(255,255,255,0.35)';
    ctx.font       = '10px DM Mono, monospace';
    ctx.textAlign  = 'right';
    const vlr = (maxVal / 4) * i;
    ctx.fillText(
      vlr >= 1000 ? `${(vlr/1000).toFixed(1)}k` : vlr.toFixed(0),
      PAD.left - 6, y + 4
    );
  }

  labels.forEach((lbl, i) => {
    const baseX = PAD.left + grpW * i + grpW / 2;

    // Barra receita (verde)
    const hR = (receitas[i] / maxVal) * plotH;
    ctx.fillStyle = '#22c55e';
    arredondadoTopo(ctx, baseX - barW - 2, PAD.top + plotH - hR, barW, hR, 4);

    // Barra despesa (vermelho)
    const hD = (despesas[i] / maxVal) * plotH;
    ctx.fillStyle = '#ef4444';
    arredondadoTopo(ctx, baseX + 2, PAD.top + plotH - hD, barW, hD, 4);

    // Label eixo X
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font      = '11px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lbl, baseX, PAD.top + plotH + 22);
  });

  // Legenda
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(PAD.left, 6, 12, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font      = '11px DM Sans';
  ctx.textAlign = 'left';
  ctx.fillText('Receitas', PAD.left + 16, 16);

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(PAD.left + 90, 6, 12, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Despesas', PAD.left + 106, 16);
}

/** Desenha retÃ¢ngulo com bordas arredondadas apenas no topo */
function arredondadoTopo(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// ============================================================
// INICIALIZAÃ‡ÃƒO GERAL â€” executada em todas as pÃ¡ginas
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  inicializarFloatLabels();
  inicializarSidebar();
  inicializarFAB();

  // FormulÃ¡rio de lanÃ§amento rÃ¡pido
  const formLR = document.getElementById('formLancamentoRapido');
  if (formLR) {
    formLR.addEventListener('submit', salvarLancamentoRapido);
    toggleCamposParcela('lr-parcelado', 'lr-campos-parcela');
  }
});
