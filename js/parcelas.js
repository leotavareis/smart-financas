// ============================================================
// PARCELAS.JS — Linha do tempo de parcelamentos
// Depende de: app.js, auth.js
// ============================================================

let cartoesCacheParcelas = [];

async function inicializarPaginaParcelas() {
  mostrarLoading(true);
  try {
    await carregarCartoesFiltro();
    await renderizarLinhaDeTempo();
  } catch (err) {
    console.error('[Parcelas] Erro ao inicializar:', err);
    mostrarToast('Erro ao carregar parcelamentos.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

// ============================================================
// FILTRO DE CARTÕES
// ============================================================

async function carregarCartoesFiltro() {
  const snap = await colecaoUsuario('cartoes').orderBy('nome').get();
  cartoesCacheParcelas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const filtro = document.getElementById('filtroParcCartao');
  if (!filtro) return;
  filtro.innerHTML = '<option value="">Todos os cartões</option>';
  cartoesCacheParcelas.forEach(c => {
    filtro.innerHTML += `<option value="${c.id}" style="color:${c.cor}">${c.nome}</option>`;
  });
  filtro.addEventListener('change', renderizarLinhaDeTempo);
}

// ============================================================
// LINHA DO TEMPO
// ============================================================

/**
 * Busca todos os lançamentos parcelados (total_parcelas > 1) e
 * projeta quais ainda estarão ativos nos próximos meses.
 */
async function renderizarLinhaDeTempo() {
  mostrarLoading(true);
  const container = document.getElementById('linhaTempo');
  if (!container) return;

  const cartaoFiltro = document.getElementById('filtroParcCartao')?.value || '';

  try {
    // Buscar todos os lançamentos parcelados
    let query = colecaoUsuario('lancamentos').where('total_parcelas', '>', 1);
    const snap = await query.get();

    if (snap.empty) {
      container.innerHTML = '<p class="empty-state">Nenhum parcelamento ativo encontrado.</p>';
      mostrarLoading(false);
      return;
    }

    // Filtrar por cartão se selecionado
    let lancamentos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (cartaoFiltro) lancamentos = lancamentos.filter(l => l.cartao_id === cartaoFiltro);

    // Projetar para os próximos 18 meses a partir do mês atual
    const meses = gerarMeses(getMesAtual(), 18);

    // Para cada lançamento, calcular o mês de encerramento
    const projetos = lancamentos.map(l => {
      const mesInicio   = l.mes; // mês da 1ª parcela
      const mesEncerra  = adicionarMeses(mesInicio, l.total_parcelas - 1);
      return { ...l, mesEncerra };
    });

    // Construir estrutura por mês
    const porMes = {};
    meses.forEach(m => { porMes[m] = []; });

    projetos.forEach(l => {
      meses.forEach(m => {
        // Parcela ativa neste mês se: mês >= mês da primeira parcela E mês <= mês de encerramento
        if (m >= l.mes && m <= l.mesEncerra) {
          // Número da parcela neste mês
          const diff        = diferencaMeses(l.mes, m);
          const numParcela  = diff + 1;
          if (numParcela >= 1 && numParcela <= l.total_parcelas) {
            porMes[m].push({ ...l, parcelaDoMes: numParcela });
          }
        }
      });
    });

    // Renderizar
    container.innerHTML = '';

    meses.forEach(mes => {
      const items = porMes[mes];
      if (!items.length) return; // Não mostrar meses sem parcelas

      const totalMes = items.reduce((s, l) => s + (l.valor || 0), 0);
      const isAtual  = mes === getMesAtual();

      const secao = document.createElement('div');
      secao.className = `mes-secao${isAtual ? ' mes-atual' : ''}`;
      secao.innerHTML = `
        <div class="mes-header-tl">
          <div class="mes-titulo-tl">
            <span class="mes-nome-tl">${formatarMes(mes)}</span>
            ${isAtual ? '<span class="badge badge-info">Mês atual</span>' : ''}
          </div>
          <span class="mes-total-tl mono">${formatarMoeda(totalMes)}</span>
        </div>
        <div class="parcelas-grid" id="grid-${mes}"></div>
      `;
      container.appendChild(secao);

      const grid = document.getElementById(`grid-${mes}`);
      items.forEach(l => {
        const cartao    = cartoesCacheParcelas.find(c => c.id === l.cartao_id);
        const encerra   = l.parcelaDoMes === l.total_parcelas;
        const card      = document.createElement('div');
        card.className  = `parcela-card${encerra ? ' parcela-encerra' : ''}`;
        card.style.borderLeftColor = cartao?.cor || '#3b82f6';
        card.innerHTML = `
          <div class="parcela-desc" title="${l.descricao}">${l.descricao}</div>
          <div class="parcela-meta">
            <span class="badge" style="background:${cartao?.cor||'#3b82f6'}">${cartao?.nome || '?'}</span>
            <span class="parcela-num">${l.parcelaDoMes}/${l.total_parcelas}</span>
            ${encerra ? '<span class="badge badge-warning">Última</span>' : ''}
          </div>
          <div class="parcela-valor mono">${formatarMoeda(l.valor)}</div>
        `;
        grid.appendChild(card);
      });
    });

    if (!container.children.length) {
      container.innerHTML = '<p class="empty-state">Nenhum parcelamento futuro encontrado.</p>';
    }

    // Resumo no topo
    renderizarResumoParcelas(projetos, meses);

  } catch (err) {
    console.error('[Parcelas] Erro:', err);
    mostrarToast('Erro ao carregar parcelamentos.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

/** Exibe card de resumo: total de parcelamentos ativos e custo mensal médio */
function renderizarResumoParcelas(projetos, meses) {
  const mesAtual  = getMesAtual();
  const ativos    = projetos.filter(l => l.mesEncerra >= mesAtual);
  const totalMes  = ativos.reduce((s, l) => s + l.valor, 0);

  const el = document.getElementById('resumoParcelas');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Parcelamentos ativos</div>
      <div class="stat-value">${ativos.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Custo este mês</div>
      <div class="stat-value mono valor-negativo">${formatarMoeda(totalMes)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Encerram este mês</div>
      <div class="stat-value">${projetos.filter(l => l.mesEncerra === mesAtual).length}</div>
    </div>
  `;
}

// ============================================================
// HELPERS DE DATA
// ============================================================

/** Gera array de YYYY-MM a partir de um mês inicial por N meses */
function gerarMeses(inicio, quantidade) {
  const resultado = [];
  let [ano, mes] = inicio.split('-').map(Number);
  for (let i = 0; i < quantidade; i++) {
    resultado.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return resultado;
}

/** Adiciona N meses a uma string YYYY-MM */
function adicionarMeses(mesStr, n) {
  let [ano, mes] = mesStr.split('-').map(Number);
  mes += n;
  while (mes > 12) { mes -= 12; ano++; }
  while (mes < 1)  { mes += 12; ano--; }
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

/** Diferença em meses entre duas strings YYYY-MM */
function diferencaMeses(de, ate) {
  const [aA, mA] = de.split('-').map(Number);
  const [aB, mB] = ate.split('-').map(Number);
  return (aB - aA) * 12 + (mB - mA);
}


