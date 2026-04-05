// ============================================================
// APP.JS — Utilitários gerais, componentes de UI e FAB
// Carregado em todas as páginas protegidas
// ============================================================

// ── Estado global ────────────────────────────────────────────
let mesSelecionado = getMesAtual();

// Hook que cada página registra para recarregar seus dados
// após um lançamento ser salvo via FAB
window._recarregarPagina = null;

// ── Categorias padrão de finanças pessoais ───────────────────
const CATEGORIAS_PADRAO = [
  { id: 'moradia',      nome: 'Moradia'           },
  { id: 'alimentacao',  nome: 'Alimentação'        },
  { id: 'transporte',   nome: 'Transporte'         },
  { id: 'saude',        nome: 'Saúde'              },
  { id: 'lazer',        nome: 'Lazer'              },
  { id: 'educacao',     nome: 'Educação'           },
  { id: 'vestuario',    nome: 'Vestuário'          },
  { id: 'contas',       nome: 'Contas e Serviços'  },
  { id: 'financeiro',   nome: 'Financeiro'         },
  { id: 'compras',      nome: 'Compras'            },
  { id: 'bem_estar',    nome: 'Bem-estar'          },
  { id: 'outros',       nome: 'Outros'             },
];

/** Popula qualquer <select> com as categorias padrão */
function popularSelectCategorias(selectId, valorAtual = '') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML =
    '<option value="">— Categoria —</option>' +
    CATEGORIAS_PADRAO.map(c =>
      `<option value="${c.id}"${c.id === valorAtual ? ' selected' : ''}>${c.nome}</option>`
    ).join('');
}

// ============================================================
// FORMATAÇÃO
// ============================================================

/** Formata número para moeda BRL. Ex: 1234.5 → "R$ 1.234,50" */
function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

/** Formata data (string ISO "YYYY-MM-DD", Date ou Timestamp Firestore) para dd/mm/aaaa */
function formatarData(data) {
  if (!data) return '—';
  if (data && typeof data.toDate === 'function') data = data.toDate();
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const [a, m, d] = data.split('-');
    return `${d}/${m}/${a}`;
  }
  const d = new Date(data);
  if (isNaN(d)) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

/**
 * Normaliza string para busca: minúsculas, sem acentos, sem caracteres especiais.
 * Usado para match na coleção memoria_descricoes.
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

  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 350);
  }, duracao);
}

// ============================================================
// LOADING
// ============================================================

function mostrarLoading(mostrar) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = mostrar ? 'flex' : 'none';
}

// ============================================================
// MODAL
// ============================================================

function abrirModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('modal-open'); document.body.style.overflow = 'hidden'; }
}

function fecharModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('modal-open'); document.body.style.overflow = ''; }
}

// Fecha ao clicar no overlay escuro
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    const wrapper = e.target.closest('.modal-wrapper');
    if (wrapper) { wrapper.classList.remove('modal-open'); document.body.style.overflow = ''; }
  }
});

/**
 * Diálogo de confirmação antes de excluir.
 * @param {string} mensagem
 * @param {Function} callback — executado se confirmado
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
        <div class="modal-header"><h3 class="modal-title">Confirmar exclusão</h3></div>
        <div class="modal-body">
          <p id="msgConfirmacao" style="color:var(--text-secondary);margin:0;line-height:1.6"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="fecharModal('${id}')">Cancelar</button>
          <button class="btn btn-danger" id="btnConfirmarExclusaoGlobal">Excluir</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('msgConfirmacao').textContent = mensagem;

  const btn    = document.getElementById('btnConfirmarExclusaoGlobal');
  const novBtn = btn.cloneNode(true);
  btn.replaceWith(novBtn);
  novBtn.addEventListener('click', () => { fecharModal(id); callback(); });

  abrirModal(id);
}

// ============================================================
// SELETOR DE MÊS
// ============================================================

/**
 * Inicializa os botões ‹ › do seletor de mês.
 * Apenas atualiza o display — não dispara callback na carga inicial
 * (cada página chama sua própria função de carregamento explicitamente).
 * @param {Function} callback — chamado com YYYY-MM ao clicar ‹ ›
 */
function inicializarSeletorMes(callback) {
  const display = document.getElementById('monthDisplay');
  const prev    = document.getElementById('prevMonth');
  const next    = document.getElementById('nextMonth');
  if (!display) return;

  // Apenas exibe o mês atual — sem disparar callback
  display.textContent = formatarMes(mesSelecionado);

  prev?.addEventListener('click', () => {
    mesSelecionado = deslocarMes(mesSelecionado, -1);
    display.textContent = formatarMes(mesSelecionado);
    if (typeof callback === 'function') callback(mesSelecionado);
  });

  next?.addEventListener('click', () => {
    mesSelecionado = deslocarMes(mesSelecionado, +1);
    display.textContent = formatarMes(mesSelecionado);
    if (typeof callback === 'function') callback(mesSelecionado);
  });
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
}

// ============================================================
// AVATAR DO USUÁRIO
// ============================================================

function inicializarAvatar(user) {
  const foto  = document.getElementById('userPhoto');
  const nome  = document.getElementById('userName');
  const email = document.getElementById('userEmail');
  if (foto  && user.photoURL)     { foto.src = user.photoURL; foto.alt = user.displayName || ''; }
  if (nome)  nome.textContent  = user.displayName?.split(' ')[0] || 'Usuário';
  if (email) email.textContent = user.email || '';
}

// ============================================================
// FAB — botão flutuante de lançamento rápido
// ============================================================

function inicializarFAB() {
  document.getElementById('fabBtn')?.addEventListener('click', () => {
    // Preenche data padrão = hoje antes de abrir
    const dtInput = document.getElementById('lr-data');
    if (dtInput && !dtInput.value) dtInput.value = new Date().toISOString().slice(0, 10);

    abrirModal('modalLancamentoRapido');
    carregarDadosLancamentoRapido();
  });
}

/** Popula selects de cartão e dono no modal de lançamento rápido */
async function carregarDadosLancamentoRapido() {
  try {
    const [snapCartoes, snapPessoas] = await Promise.all([
      colecaoUsuario('cartoes').orderBy('nome').get(),
      colecaoUsuario('pessoas').get()
    ]);

    const selCartao = document.getElementById('lr-cartao');
    if (selCartao) {
      selCartao.innerHTML = '<option value="">— Cartão —</option>';
      snapCartoes.forEach(d => {
        selCartao.innerHTML += `<option value="${d.id}">${d.data().nome}</option>`;
      });
    }

    const selDono = document.getElementById('lr-dono');
    if (selDono) {
      selDono.innerHTML = '<option value="eu">Eu mesmo</option>';
      snapPessoas.forEach(d => {
        const p = d.data();
        if (p.nome) selDono.innerHTML += `<option value="${d.id}">${p.nome}</option>`;
      });
    }

    // Data padrão = hoje
    const dtInput = document.getElementById('lr-data');
    if (dtInput && !dtInput.value) dtInput.value = new Date().toISOString().slice(0, 10);

    // Categorias
    popularSelectCategorias('lr-categoria');

    inicializarFloatLabels();
  } catch (err) {
    console.error('[FAB] Erro ao carregar dados:', err);
  }
}

/** Salva o lançamento rápido no Firestore */
async function salvarLancamentoRapido(e) {
  e.preventDefault();

  const cartaoId  = document.getElementById('lr-cartao').value;
  const descricao = document.getElementById('lr-descricao').value.trim();
  const valorStr  = document.getElementById('lr-valor').value;
  const data      = document.getElementById('lr-data').value;
  const donoId    = document.getElementById('lr-dono').value;
  const categoria = document.getElementById('lr-categoria')?.value || '';
  const parcelado = document.getElementById('lr-parcelado').checked;
  const parcAtual = parseInt(document.getElementById('lr-parcela-atual')?.value) || 1;
  const parcTotal = parseInt(document.getElementById('lr-total-parcelas')?.value) || 1;

  const valor = parseFloat(valorStr.replace(',', '.'));

  if (!cartaoId || !descricao || isNaN(valor) || valor <= 0 || !data) {
    mostrarToast('Preencha todos os campos obrigatórios.', 'aviso');
    return;
  }

  const mes  = data.slice(0, 7);
  const dono = [{ pessoa_id: donoId, percentual: 100 }];

  try {
    mostrarLoading(true);

    const faturaId = await obterOuCriarFatura(cartaoId, mes);

    await colecaoUsuario('lancamentos').add({
      fatura_id     : faturaId,
      cartao_id     : cartaoId,
      descricao,
      categoria,
      valor,
      data,
      dono,
      parcela_atual : parcelado ? parcAtual : 1,
      total_parcelas: parcelado ? parcTotal : 1,
      mes,
      criado_em     : firebase.firestore.FieldValue.serverTimestamp()
    });

    // Recalcula total da fatura
    await atualizarTotalFatura(faturaId);

    mostrarToast('Lançamento salvo!', 'sucesso');
    fecharModal('modalLancamentoRapido');
    document.getElementById('formLancamentoRapido')?.reset();

    // Notifica a página atual para recarregar dados, se ela registrou um hook
    if (typeof window._recarregarPagina === 'function') {
      window._recarregarPagina(mesSelecionado);
    }

  } catch (err) {
    console.error('[FAB] Erro ao salvar:', err);
    mostrarToast('Erro ao salvar lançamento.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

// ============================================================
// HELPERS DE FATURA
// ============================================================

/**
 * Busca a fatura de um cartão/mês ou cria uma nova.
 * @returns {Promise<string>} faturaId
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

/** Recalcula e persiste o campo `total` de uma fatura. */
async function atualizarTotalFatura(faturaId) {
  const snap  = await colecaoUsuario('lancamentos').where('fatura_id', '==', faturaId).get();
  const total = snap.docs.reduce((s, d) => s + (d.data().valor || 0), 0);
  await colecaoUsuario('faturas').doc(faturaId).update({ total });
}

// ============================================================
// FLOAT LABELS
// ============================================================

/** Ativa comportamento de label flutuante em todos os .fl-group da página. */
function inicializarFloatLabels() {
  // Tipos de input que sempre renderizam conteúdo visual no browser,
  // então o label precisa estar sempre flutuando para não sobrepor.
  const SEMPRE_FLUTUANTE = ['date', 'month', 'time', 'color', 'range'];

  document.querySelectorAll('.fl-group').forEach(grupo => {
    const inp = grupo.querySelector('input, textarea, select');
    const lbl = grupo.querySelector('label');
    if (!inp || !lbl) return;

    const verificar = () => {
      const temValor = !!(
        inp.value                              ||  // campo preenchido
        inp === document.activeElement         ||  // campo focado
        SEMPRE_FLUTUANTE.includes(inp.type)    ||  // date, month, color, etc.
        inp.placeholder                        ||  // tem placeholder visível
        inp.tagName === 'SELECT'                   // select sempre mostra texto
      );
      lbl.classList.toggle('floating', temValor);
    };

    inp.addEventListener('focus',  verificar);
    inp.addEventListener('blur',   verificar);
    inp.addEventListener('input',  verificar);
    inp.addEventListener('change', verificar);
    verificar();
  });
}

// ============================================================
// GRÁFICO DE BARRAS — canvas vanilla (dashboard)
// ============================================================

/**
 * Desenha gráfico de barras duplas (receitas × despesas).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} labels
 * @param {number[]} receitas
 * @param {number[]} despesas
 */
function desenharGrafico(ctx, labels, receitas, despesas) {
  const W   = ctx.canvas.width;
  const H   = ctx.canvas.height;
  const PAD = { top: 30, right: 20, bottom: 44, left: 68 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top  - PAD.bottom;

  ctx.clearRect(0, 0, W, H);

  const maxVal = Math.max(...receitas, ...despesas, 1) * 1.15;
  const n      = labels.length;
  const grpW   = plotW / n;
  const barW   = Math.min(grpW * 0.28, 30);

  // Linhas de grade horizontais
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + plotH - (plotH / 4) * i;

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();

    // Labels eixo Y
    ctx.fillStyle  = 'rgba(255,255,255,0.3)';
    ctx.font       = '10px DM Mono, monospace';
    ctx.textAlign  = 'right';
    const vlr = (maxVal / 4) * i;
    ctx.fillText(
      vlr >= 1000 ? `${(vlr / 1000).toFixed(1)}k` : vlr.toFixed(0),
      PAD.left - 8, y + 4
    );
  }

  // Barras
  labels.forEach((lbl, i) => {
    const baseX = PAD.left + grpW * i + grpW / 2;

    // Receita (verde)
    const hR = (receitas[i] / maxVal) * plotH || 0;
    ctx.fillStyle = '#22c55e';
    _barraArredondada(ctx, baseX - barW - 2, PAD.top + plotH - hR, barW, hR, 4);

    // Despesa (vermelho)
    const hD = (despesas[i] / maxVal) * plotH || 0;
    ctx.fillStyle = '#ef4444';
    _barraArredondada(ctx, baseX + 2, PAD.top + plotH - hD, barW, hD, 4);

    // Label eixo X
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font      = '11px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lbl, baseX, PAD.top + plotH + 26);
  });

  // Legenda
  const _legenda = (x, cor, texto) => {
    ctx.fillStyle = cor;
    ctx.fillRect(x, 8, 12, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font      = '11px DM Sans, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(texto, x + 16, 18);
  };
  _legenda(PAD.left,      '#22c55e', 'Receitas');
  _legenda(PAD.left + 90, '#ef4444', 'Despesas');
}

/** Retângulo com bordas arredondadas apenas no topo. */
function _barraArredondada(ctx, x, y, w, h, r) {
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
// INICIALIZAÇÃO — executada em todas as páginas
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  inicializarFloatLabels();
  inicializarSidebar();
  inicializarFAB();

  // Formulário de lançamento rápido (FAB)
  document.getElementById('formLancamentoRapido')
    ?.addEventListener('submit', salvarLancamentoRapido);

  // Toggle campos de parcela no FAB
  const chkParcelado = document.getElementById('lr-parcelado');
  const divParcelas  = document.getElementById('lr-campos-parcela');
  if (chkParcelado && divParcelas) {
    chkParcelado.addEventListener('change', () => {
      divParcelas.style.display = chkParcelado.checked ? 'grid' : 'none';
    });
  }
});
