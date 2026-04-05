// ============================================================
// PARCELAS.JS — Parcelamentos: timeline + lista plana + resumo
// ============================================================

let cartoesCacheParcelas = [];
let projetosCacheParcelas = [];
let modoVisualizacao = 'timeline'; // 'timeline' | 'lista'

async function inicializarPaginaParcelas() {
  mostrarLoading(true);
  try {
    await carregarCartoesFiltro();
    await renderizarLinhaDeTempo();
    _sincronizarBotoesView();
  } catch (err) {
    console.error('[Parcelas] Erro ao inicializar:', err);
    mostrarToast('Erro ao carregar parcelamentos.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

// ============================================================
// FILTRO E TOGGLE
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

function alternarVisualizacao(modo) {
  modoVisualizacao = modo;
  _sincronizarBotoesView();
  _renderizarConteudo(projetosCacheParcelas, gerarMeses(getMesAtual(), 18));
}

function _sincronizarBotoesView() {
  const btnT = document.getElementById('btnViewTimeline');
  const btnL = document.getElementById('btnViewLista');
  if (!btnT || !btnL) return;
  const ativos = 'background:rgba(205,205,205,0.15);color:var(--c5)';
  const normal = 'color:var(--c3)';
  btnT.style.cssText += modoVisualizacao === 'timeline' ? `;${ativos}` : `;${normal}`;
  btnL.style.cssText += modoVisualizacao === 'lista'    ? `;${ativos}` : `;${normal}`;
}

// ============================================================
// CARREGAMENTO PRINCIPAL
// ============================================================

async function renderizarLinhaDeTempo() {
  mostrarLoading(true);
  const container = document.getElementById('linhaTempo');
  if (!container) return;

  const cartaoFiltro = document.getElementById('filtroParcCartao')?.value || '';

  try {
    const snap = await colecaoUsuario('lancamentos').get();

    let lancamentos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(l => (l.total_parcelas || 1) > 1);

    if (cartaoFiltro) lancamentos = lancamentos.filter(l => l.cartao_id === cartaoFiltro);

    const meses    = gerarMeses(getMesAtual(), 18);
    const mesAtual = getMesAtual();

    const projetos = lancamentos.map(l => ({
      ...l,
      mesEncerra: adicionarMeses(l.mes, l.total_parcelas - 1)
    }));

    // Cachear para o toggle de view não precisar rebuscar
    projetosCacheParcelas = projetos;

    renderizarResumoParcelas(projetos);
    _renderizarConteudo(projetos, meses);

    if (!projetos.length) {
      container.innerHTML = '<p class="empty-state">Nenhum parcelamento encontrado.</p>';
    }

  } catch (err) {
    console.error('[Parcelas] Erro:', err);
    mostrarToast('Erro ao carregar parcelamentos.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

function _renderizarConteudo(projetos, meses) {
  if (modoVisualizacao === 'lista') renderizarListaPlana(projetos);
  else renderizarTimeline(projetos, meses);
}

// ============================================================
// RESUMO ESTATÍSTICO
// ============================================================

function renderizarResumoParcelas(projetos) {
  const el = document.getElementById('resumoParcelas');
  if (!el) return;

  const mesAtual = getMesAtual();
  const mes3     = adicionarMeses(mesAtual, 3);

  const ativos        = projetos.filter(l => l.mesEncerra >= mesAtual);
  const totalMesAtual = ativos.reduce((s, l) => s + (l.valor || 0), 0);

  const encerramBreve = ativos
    .filter(l => l.mesEncerra <= mes3)
    .sort((a, b) => a.mesEncerra.localeCompare(b.mesEncerra));

  const continuam      = ativos.filter(l => l.mesEncerra > mes3);
  const totalContinuam = continuam.reduce((s, l) => s + (l.valor || 0), 0);

  // Comprometimento futuro: soma de todas as parcelas restantes
  const totalRestante = ativos.reduce((s, l) => {
    const parc = diferencaMeses(l.mes, mesAtual) + 1;
    const restam = Math.max(0, l.total_parcelas - parc + 1);
    return s + restam * (l.valor || 0);
  }, 0);

  el.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
      <div class="card stat-card">
        <div class="stat-label">Parcelamentos ativos</div>
        <div class="stat-value">${ativos.length}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">Custo mensal atual</div>
        <div class="stat-value mono valor-negativo">${formatarMoeda(totalMesAtual)}</div>
      </div>
      <div class="card stat-card" style="cursor:pointer" onclick="_toggleEncerramBreve()"
           title="Clique para ver detalhes">
        <div class="stat-label">Encerram em até 3 meses
          <span style="font-size:.65rem;opacity:.6;margin-left:4px">▼ detalhes</span>
        </div>
        <div class="stat-value ${encerramBreve.length ? 'valor-positivo' : ''}">${encerramBreve.length}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">Continuam além de 3 meses</div>
        <div class="stat-value">${continuam.length}
          <span class="small text-muted mono" style="font-size:.8rem;margin-left:4px">${formatarMoeda(totalContinuam)}/mês</span>
        </div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">Total restante comprometido</div>
        <div class="stat-value mono valor-negativo" style="font-size:1.3rem">${formatarMoeda(totalRestante)}</div>
      </div>
    </div>`;

  // Renderizar painel "encerram em breve"
  _renderizarEncerramBreve(encerramBreve);
}

function _toggleEncerramBreve() {
  const el = document.getElementById('encerramBreve');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function _renderizarEncerramBreve(lista) {
  const el = document.getElementById('encerramBreve');
  if (!el) return;

  if (!lista.length) { el.style.display = 'none'; return; }

  const mesAtual = getMesAtual();
  el.innerHTML = `
    <div class="card">
      <div class="flex-between mb-4">
        <div>
          <h3 style="color:var(--c5)">Encerram nos próximos 3 meses</h3>
          <p class="small text-muted mt-2">Parcelas que encerram e liberarão orçamento em breve</p>
        </div>
        <span class="badge badge-warning" style="font-size:.8rem;padding:4px 10px">${lista.length} parcelas</span>
      </div>
      <div class="table-wrap">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Cartão</th>
              <th>Encerra em</th>
              <th>Parcelas restantes</th>
              <th style="text-align:right">Valor/mês</th>
              <th style="text-align:right">Total restante</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(l => {
              const cartao   = cartoesCacheParcelas.find(c => c.id === l.cartao_id);
              const parc     = Math.max(1, diferencaMeses(l.mes, mesAtual) + 1);
              const restam   = Math.max(0, l.total_parcelas - parc + 1);
              const totalR   = restam * (l.valor || 0);
              const nome     = l.apelido || l.descricao;
              return `<tr>
                <td>
                  <div style="font-weight:600;color:var(--c5)">${nome}</div>
                  ${l.apelido ? `<div class="small text-muted">${l.descricao}</div>` : ''}
                </td>
                <td><span class="badge" style="background:${cartao?.cor||'#888'};font-size:.65rem">${cartao?.nome||'?'}</span></td>
                <td class="small">${formatarMes(l.mesEncerra)}</td>
                <td><span class="badge badge-warning" style="font-size:.7rem">${restam}x de ${l.total_parcelas}</span></td>
                <td class="mono valor-negativo" style="text-align:right">${formatarMoeda(l.valor)}</td>
                <td class="mono valor-negativo" style="text-align:right;font-weight:600">${formatarMoeda(totalR)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  el.style.display = 'none'; // Começa fechado, abre ao clicar no card
}

// ============================================================
// VIEW: TIMELINE (grade por mês)
// ============================================================

function renderizarTimeline(projetos, meses) {
  const container = document.getElementById('linhaTempo');
  const mesAtual  = getMesAtual();

  // Agrupar por mês
  const porMes = {};
  meses.forEach(m => { porMes[m] = []; });

  projetos.forEach(l => {
    meses.forEach(m => {
      if (m >= l.mes && m <= l.mesEncerra) {
        const numParcela = diferencaMeses(l.mes, m) + 1;
        if (numParcela >= 1 && numParcela <= l.total_parcelas) {
          porMes[m].push({ ...l, parcelaDoMes: numParcela });
        }
      }
    });
  });

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
          <span class="small text-muted">${items.length} parcelas</span>
        </div>
        <span class="mes-total-tl mono">${formatarMoeda(totalMes)}</span>
      </div>
      <div class="parcelas-grid" id="grid-${mes}"></div>`;
    container.appendChild(secao);

    const grid = document.getElementById(`grid-${mes}`);
    items.forEach(l => {
      const cartao  = cartoesCacheParcelas.find(c => c.id === l.cartao_id);
      const encerra = l.parcelaDoMes === l.total_parcelas;
      const nome    = l.apelido || l.descricao;
      const card    = document.createElement('div');
      card.className = `parcela-card${encerra ? ' parcela-encerra' : ''}`;
      card.style.borderLeftColor = cartao?.cor || 'var(--c3)';
      card.innerHTML = `
        <div class="parcela-desc" title="${l.descricao}">${nome}</div>
        ${l.apelido ? `<div class="small text-muted" style="margin-bottom:6px;font-size:.7rem">${l.descricao}</div>` : ''}
        <div class="parcela-meta">
          <span class="badge" style="background:${cartao?.cor||'#888'};font-size:.62rem">${cartao?.nome||'?'}</span>
          ${l.categoria ? `<span class="badge" style="background:var(--bg-base);border:1px solid var(--border-md);color:var(--c3);font-size:.62rem">${_nomeCat(l.categoria)}</span>` : ''}
          <span class="parcela-num">${l.parcelaDoMes}/${l.total_parcelas}</span>
          ${encerra ? '<span class="badge badge-warning" style="font-size:.62rem">Última</span>' : ''}
        </div>
        <div class="parcela-valor">${formatarMoeda(l.valor)}</div>`;
      grid.appendChild(card);
    });
  });

  if (!algumMesTem) {
    container.innerHTML = '<p class="empty-state">Nenhum parcelamento futuro encontrado.</p>';
  }
}

// ============================================================
// VIEW: LISTA PLANA (tabela única com todos os ativos)
// ============================================================

function renderizarListaPlana(projetos) {
  const container = document.getElementById('linhaTempo');
  const mesAtual  = getMesAtual();

  const ativos = projetos
    .filter(l => l.mesEncerra >= mesAtual)
    .sort((a, b) => a.mesEncerra.localeCompare(b.mesEncerra));

  if (!ativos.length) {
    container.innerHTML = '<p class="empty-state">Nenhum parcelamento ativo.</p>';
    return;
  }

  // Agrupar por "encerra este mês" | "próximos 3 meses" | "outros"
  const mes3 = adicionarMeses(mesAtual, 3);

  const rows = ativos.map(l => {
    const cartao    = cartoesCacheParcelas.find(c => c.id === l.cartao_id);
    const parc      = Math.max(1, diferencaMeses(l.mes, mesAtual) + 1);
    const restam    = Math.max(0, l.total_parcelas - parc + 1);
    const totalRest = restam * (l.valor || 0);
    const nome      = l.apelido || l.descricao;
    const encerraBreve = l.mesEncerra <= mes3;

    return `<tr${encerraBreve ? ' style="background:rgba(184,144,58,0.04)"' : ''}>
      <td>
        <div style="font-weight:600;color:var(--c5)">${nome}</div>
        ${l.apelido ? `<div class="small text-muted">${l.descricao}</div>` : ''}
      </td>
      <td><span class="badge" style="background:${cartao?.cor||'#888'};font-size:.65rem">${cartao?.nome||'?'}</span></td>
      <td>${l.categoria ? `<span class="text-muted small">${_nomeCat(l.categoria)}</span>` : '<span class="text-muted small">—</span>'}</td>
      <td class="mono small" style="text-align:center">${parc}/${l.total_parcelas}</td>
      <td class="small" style="white-space:nowrap">
        ${formatarMes(l.mesEncerra)}
        ${encerraBreve ? '<span class="badge badge-warning" style="font-size:.6rem;margin-left:4px">em breve</span>' : ''}
      </td>
      <td class="mono small" style="text-align:right">${formatarMoeda(totalRest)}</td>
      <td class="mono valor-negativo" style="text-align:right;font-weight:600">${formatarMoeda(l.valor)}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="card">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Cartão</th>
              <th>Categoria</th>
              <th style="text-align:center">Parcela</th>
              <th>Encerra</th>
              <th style="text-align:right">Restante total</th>
              <th style="text-align:right">Valor/mês</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ============================================================
// HELPERS
// ============================================================

function _nomeCat(id) {
  if (typeof CATEGORIAS_PADRAO === 'undefined') return id;
  return CATEGORIAS_PADRAO.find(c => c.id === id)?.nome || id;
}

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

function adicionarMeses(mesStr, n) {
  if (!mesStr) return mesStr;
  let [ano, mes] = mesStr.split('-').map(Number);
  mes += n;
  while (mes > 12) { mes -= 12; ano++; }
  while (mes < 1)  { mes += 12; ano--; }
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function diferencaMeses(de, ate) {
  if (!de || !ate) return 0;
  const [aA, mA] = de.split('-').map(Number);
  const [aB, mB] = ate.split('-').map(Number);
  return (aB - aA) * 12 + (mB - mA);
}
