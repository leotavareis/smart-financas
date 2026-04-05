// ============================================================
// APP.JS — Utilitários gerais, componentes de UI e FAB
// Carregado em todas as páginas protegidas
// ============================================================

// ── Estado global do mês selecionado ─────────────────────────
let mesSelecionado = getMesAtual();

// ============================================================
// FORMATAÇÃO
// ============================================================

/** Formata número para moeda BRL: 1234.5 → "R$ 1.234,50" */
function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

/** Formata data (string ISO, Date ou Timestamp) para dd/mm/aaaa */
function formatarData(data) {
  if (!data) return '—';
  if (data && typeof data.toDate === 'function') data = data.toDate();
  const d = new Date(data);
  if (isNaN(d)) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

/**
 * Normaliza string para busca: minúsculas, sem acentos, sem caracteres especiais.
 * Usado para match nas memórias de descrição.
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
// TOAST — notificações no canto inferior direito
// ============================================================

/**
 * Exibe uma notificação temporária.
 * @param {string} mensagem
 * @param {'sucesso'|'erro'|'aviso'|'info'} tipo
 * @param {number} duracao  ms antes de sumir automaticamente
 */
function mostrarToast(mensagem, tipo = 'info', duracao = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icones = { sucesso: '✓', erro: '✕', aviso: '⚠', info: 'ℹ' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = `
    <span class="toast-icon">${icones[tipo] || icones.info}</span>
    <span class="toast-msg">${mensagem}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);

  // Entra com animação
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  // Sai automaticamente
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 350);
  }, duracao);
}

// ============================================================
// LOADING — overlay de carregamento global
// ============================================================

function mostrarLoading(mostrar) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = mostrar ? 'flex' : 'none';
}

// ============================================================
// MODAL — sistema reutilizável
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
 * Mostra diálogo de confirmação antes de excluir algo.
 * @param {string} mensagem
 * @param {Function} callback - Executado se o usuário confirmar
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
          <h3 class="modal-title">Confirmar exclusão</h3>
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

  // Clonar botão para limpar listeners anteriores
  const btn    = document.getElementById('btnConfirmarExclusaoGlobal');
  const novBtn = btn.cloneNode(true);
  btn.replaceWith(novBtn);
  novBtn.addEventListener('click', () => { fecharModal(id); callback(); });

  abrirModal(id);
}

// ============================================================
// SELETOR DE MÊS — header de todas as páginas
// ============================================================

/**
 * Inicializa os botões ‹ e › do seletor de mês.
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
// SIDEBAR & NAVEGAÇÃO
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
// AVATAR DO USUÁRIO
// ============================================================

function inicializarAvatar(user) {
  const foto  = document.getElementById('userPhoto');
  const nome  = document.getElementById('userName');
  const email = document.getElementById('userEmail');

  if (foto && user.photoURL) { foto.src = user.photoURL; foto.alt = user.displayName; }
  if (nome)  nome.textContent  = user.displayName?.split(' ')[0] || 'Usuário';
  if (email) email.textContent = user.email || '';
}

// ============================================================
// FAB — botão flutuante de lançamento rápido
// ============================================================

function inicializarFAB() {
  document.getElementById('fabBtn')?.addEventListener('click', () => {
    abrirModal('modalLancamentoRapido');
    carregarDadosLancamentoRapido();
  });
}

/** Popula selects do modal de lançamento rápido */
async function carregarDadosLancamentoRapido() {
  try {
    // Cartões
    const snapCartoes = await colecaoUsuario('cartoes').orderBy('nome').get();
    const selCartao   = document.getElementById('lr-cartao');
    if (selCartao) {
      selCartao.innerHTML = '<option value="">— Cartão —</option>';
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

    // Data padrão = hoje
    const dtInput = document.getElementById('lr-data');
    if (dtInput) dtInput.value = new Date().toISOString().slice(0, 10);

  } catch (err) {
    console.error('[FAB] Erro ao carregar dados:', err);
  }
}

/** Salva o lançamento rápido no Firestore */
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
    mostrarToast('Preencha todos os campos obrigatórios.', 'aviso');
    return;
  }

  const mes  = data.slice(0, 7);
  const dono = [{ pessoa_id: donoId, percentual: 100 }];

  try {
    mostrarLoading(true);

    // Garante que existe uma fatura para esse cartão/mês
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

    fecharModal('modalLancamentoRapido');
    document.getElementById('formLancamentoRapido').reset();
    mostrarToast('Lançamento salvo com sucesso!', 'sucesso');
    
    // Recarrega a página atual para refletir dados
    if (window.location.pathname.includes('dashboard.html')) carregarDashboard(mesSelecionado);

  } catch (err) {
    console.error('[FAB] Erro ao salvar:', err);
    mostrarToast('Erro ao salvar lançamento.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

/** Busca ou cria o documento da fatura para um cartão/mês */
async function obterOuCriarFatura(cartaoId, mes) {
  const coll = colecaoUsuario('faturas');
  const snap = await coll.where('cartao_id', '==', cartaoId).where('mes', '==', mes).limit(1).get();

  if (!snap.empty) return snap.docs[0].id;

  const res = await coll.add({
    cartao_id: cartaoId,
    mes,
    total    : 0,
    status   : 'aberta',
    criado_em: firebase.firestore.FieldValue.serverTimestamp()
  });
  return res.id;
}

// Configura o formulário do FAB no carregamento
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('formLancamentoRapido')?.addEventListener('submit', salvarLancamentoRapido);
  const chkParcelado = document.getElementById('lr-parcelado');
  const divParcelas  = document.getElementById('lr-campos-parcela');
  chkParcelado?.addEventListener('change', () => divParcelas.style.display = chkParcelado.checked ? 'grid' : 'none');
  
  inicializarSidebar();
  inicializarFAB();
});
