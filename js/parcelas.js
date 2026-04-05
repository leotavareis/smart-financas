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
    filtro.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
  });
  filtro.addEventListener('change', renderizarLinhaDeTempo);
}

// ============================================================
// LINHA DO TEMPO
// ============================================================

async function renderizarLinhaDeTempo() {
  mostrarLoading(true);
  const container = document.getElementById('linhaTempo');
  if (!container) return;

  const cartaoFiltro = document.getElementById('filtroParcCartao')?.value || '';

  try {
    // Busca TODOS os lançamentos — filtra parcelados em JS para evitar
    // índice composto desnecessário no Firestore (total_parcelas > 1 + orderBy)
    const snap = await colecaoUsuario('lancamentos').get();

    let lancamentos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(l => (l.total_parcelas || 1) > 1); // apenas parcelados

    if (cartaoFiltro) {
      lancamentos = lancamentos.filter(l => l.cartao_id === cartaoFiltro);
    }

    if (!lancamentos.length) {
      container.innerHTML = '<p class="empty-state">Nenhum parcelamento encontrado.</p>';
      renderizarResumoParcelas([], []);
      mostrarLoading(false);
      return;
    }

    // Projetar para os próximos 18 meses a partir do mês atual
    const meses   = gerarMeses(getMesAtual(), 18);
    const mesAtual = getMesAtual();

    // Calcula mês de encerramento de cada lançamento
    const projetos = lancamentos.map(l => {
      const mesEncerra = adicionarMeses(l.mes, l.total_parcelas - 1);
      return { ...l, mesEncerra };
    });

    // Agrupar por mês
    const porMes = {};
    meses.forEach(m => { porMes[m] = []; });

    projetos.forEach(l => {
      meses.forEach(m => {
        // Ativo neste mês se: mes >= mes_primeiro_lancamento E mes <= mesEncerra
        if (m >= l.mes && m <= l.mesEncerra) {
          const numParcela = diferencaMeses(l.mes, m) + 1;
          if (numParcela >= 1 && numParcela <= l.total_parcelas) {
            porMes[m].push({ ...l, parcelaDoMes: numParcela });
          }
        }
      });
    });

    // Renderizar
    container.innerHTML = '';
    let algumMesTem = false;

    meses.forEach(mes => {
      const items = porMes[mes];
      if (!items.length) return;
      algumMesTem = true;

      const totalMes = items.reduce((s, l) => s + (l.valor || 0), 0);
      const isAtual  = mes === mesAtual;

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
        <div class="parcelas-grid" id="grid-${mes}"></div>`;
      container.appendChild(secao);

      const grid = document.getElementById(`grid-${mes}`);
      items.forEach(l => {
        const cartao  = cartoesCacheParcelas.find(c => c.id === l.cartao_id);
        const encerra = l.parcelaDoMes === l.total_parcelas;
        const card    = document.createElement('div');
        card.className = `parcela-card${encerra ? ' parcela-encerra' : ''}`;
        card.style.borderLeftColor = cartao?.cor || '#3b82f6';
        card.innerHTML = `
          <div class="parcela-desc" title="${l.descricao}">${l.descricao}</div>
          <div class="parcela-meta">
            <span class="badge" style="background:${cartao?.cor || '#3b82f6'};font-size:.65rem">
              ${cartao?.nome || '?'}
            </span>
            <span class="parcela-num">${l.parcelaDoMes}/${l.total_parcelas}</span>
            ${encerra ? '<span class="badge badge-warning" style="font-size:.65rem">Última</span>' : ''}
          </div>
          <div class="parcela-valor">${formatarMoeda(l.valor)}</div>`;
        grid.appendChild(card);
      });
    });

    if (!algumMesTem) {
      container.innerHTML = '<p class="empty-state">Nenhum parcelamento futuro encontrado.</p>';
    }

    renderizarResumoParcelas(projetos, meses);

  } catch (err) {
    console.error('[Parcelas] Erro:', err);
    mostrarToast('Erro ao carregar parcelamentos.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

/** Exibe cards de resumo no topo da página */
function renderizarResumoParcelas(projetos, meses) {
  const el = document.getElementById('resumoParcelas');
  if (!el) return;

  const mesAtual = getMesAtual();
  const ativos   = projetos.filter(l => l.mesEncerra >= mesAtual);
  const totalMes = ativos.reduce((s, l) => s + (l.valor || 0), 0);
  const encerram = projetos.filter(l => l.mesEncerra === mesAtual).length;

  el.innerHTML = `
    <div class="card stat-card">
      <div class="stat-label">Parcelamentos ativos</div>
      <div class="stat-value">${ativos.length}</div>
    </div>
    <div class="card stat-card">
      <div class="stat-label">Custo este mês</div>
      <div class="stat-value mono valor-negativo">${formatarMoeda(totalMes)}</div>
    </div>
    <div class="card stat-card">
      <div class="stat-label">Encerram este mês</div>
      <div class="stat-value ${encerram > 0 ? 'valor-positivo' : ''}">${encerram}</div>
    </div>`;
}

// ============================================================
// HELPERS DE DATA
// ============================================================

/** Gera array de N strings YYYY-MM a partir de um mês inicial */
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

/** Adiciona N meses a uma string YYYY-MM e retorna YYYY-MM */
function adicionarMeses(mesStr, n) {
  if (!mesStr) return mesStr;
  let [ano, mes] = mesStr.split('-').map(Number);
  mes += n;
  while (mes > 12) { mes -= 12; ano++; }
  while (mes < 1)  { mes += 12; ano--; }
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

/** Diferença em meses entre duas strings YYYY-MM (pode ser negativo) */
function diferencaMeses(de, ate) {
  if (!de || !ate) return 0;
  const [aA, mA] = de.split('-').map(Number);
  const [aB, mB] = ate.split('-').map(Number);
  return (aB - aA) * 12 + (mB - mA);
}
