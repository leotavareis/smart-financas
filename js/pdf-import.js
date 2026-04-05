// ============================================================
// PDF-IMPORT.JS — Importação e classificação de faturas em PDF
// Depende de: PDF.js (cdnjs), app.js, auth.js
// ============================================================

// Estado da importação atual
const estadoImport = {
  cartaoId       : null,
  mes            : null,
  linhas         : [],        // Lançamentos extraídos do PDF
  classificados  : [],        // Lançamentos prontos para salvar
  indexAtual     : 0,         // Índice no modal de classificação manual
  pessoas        : [],        // Cache das pessoas
  cartoes        : []         // Cache dos cartões
};

// ============================================================
// INICIALIZAÇÃO DA PÁGINA
// ============================================================

async function inicializarPaginaFaturas() {
  mostrarLoading(true);
  try {
    await Promise.all([
      carregarCartoesSelect(),
      carregarPessoasEstado()
    ]);
    configurarDropZone();
    configurarFormImport();
    configurarModalClassificacao();
    await listarFaturasExistentes();
  } catch (err) {
    console.error('[PDF] Erro ao inicializar:', err);
    mostrarToast('Erro ao carregar a página.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

// ============================================================
// CARREGAMENTO DE DADOS
// ============================================================

async function carregarCartoesSelect() {
  const snap = await colecaoUsuario('cartoes').orderBy('nome').get();
  estadoImport.cartoes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const sel = document.getElementById('selectCartaoImport');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecione o cartão —</option>';
  estadoImport.cartoes.forEach(c => {
    sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
  });
}

async function carregarPessoasEstado() {
  const snap = await colecaoUsuario('pessoas').get();
  estadoImport.pessoas = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.nome);
}

async function listarFaturasExistentes() {
  const snap = await colecaoUsuario('faturas')
    .orderBy('mes', 'desc')
    .limit(20)
    .get();

  const lista = document.getElementById('listaFaturas');
  if (!lista) return;

  if (snap.empty) {
    lista.innerHTML = '<p class="empty-state">Nenhuma fatura importada ainda.</p>';
    return;
  }

  lista.innerHTML = '';
  for (const doc of snap.docs) {
    const f      = doc.data();
    const cartao = estadoImport.cartoes.find(c => c.id === f.cartao_id);
    const badge  = f.status === 'fechada'
      ? '<span class="badge badge-success">Fechada</span>'
      : '<span class="badge badge-warning">Aberta</span>';

    lista.innerHTML += `
      <div class="card card-row" style="border-left:4px solid ${cartao?.cor||'#3b82f6'}">
        <div>
          <strong>${cartao?.nome || 'Cartão'}</strong>
          <span class="text-muted">${formatarMes(f.mes)}</span>
        </div>
        <div class="row-mid">
          ${badge}
          <span class="mono">${formatarMoeda(f.total)}</span>
        </div>
        <div class="row-actions">
          <button class="btn btn-sm btn-ghost" onclick="verLancamentosFatura('${doc.id}','${f.mes}')">Ver</button>
          <button class="btn btn-sm btn-danger" onclick="excluirFatura('${doc.id}')">Excluir</button>
        </div>
      </div>`;
  }
}

// ============================================================
// DRAG & DROP + UPLOAD
// ============================================================

function configurarDropZone() {
  const zone = document.getElementById('dropZone');
  const inp  = document.getElementById('inputPDF');
  if (!zone || !inp) return;

  zone.addEventListener('click', () => inp.click());

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') processarPDF(file);
    else mostrarToast('Selecione um arquivo PDF válido.', 'aviso');
  });

  inp.addEventListener('change', () => {
    if (inp.files[0]) processarPDF(inp.files[0]);
  });
}

function configurarFormImport() {
  const form = document.getElementById('formImportacao');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    estadoImport.cartaoId = document.getElementById('selectCartaoImport').value;
    estadoImport.mes      = document.getElementById('mesImport').value;

    if (!estadoImport.cartaoId || !estadoImport.mes) {
      mostrarToast('Selecione o cartão e o mês antes de importar.', 'aviso');
      return;
    }
    document.getElementById('dropZone').click();
  });

  // Preenche o mês padrão com o mês atual
  const mesInput = document.getElementById('mesImport');
  if (mesInput) mesInput.value = getMesAtual();
}

// ============================================================
// PROCESSAMENTO DO PDF
// ============================================================

/**
 * Lê o arquivo PDF com PDF.js e extrai o texto de todas as páginas.
 * @param {File} arquivo
 */
async function processarPDF(arquivo) {
  // Verificar se cartão e mês foram selecionados
  estadoImport.cartaoId = document.getElementById('selectCartaoImport')?.value;
  estadoImport.mes      = document.getElementById('mesImport')?.value;

  if (!estadoImport.cartaoId || !estadoImport.mes) {
    mostrarToast('Selecione o cartão e o mês antes de carregar o PDF.', 'aviso');
    return;
  }

  mostrarLoading(true);
  document.getElementById('progressoImport').style.display = 'block';
  setProgresso('Lendo PDF...', 10);

  try {
    const arrayBuffer = await arquivo.arrayBuffer();
    const pdfDoc      = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let textoCompleto = '';

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page  = await pdfDoc.getPage(i);
      const texto = await page.getTextContent();
      textoCompleto += texto.items.map(t => t.str).join(' ') + '\n';
      setProgresso(`Lendo página ${i} de ${pdfDoc.numPages}...`, 10 + (i / pdfDoc.numPages) * 40);
    }

    setProgresso('Identificando lançamentos...', 55);
    const linhas = parsearTextoFatura(textoCompleto);

    if (linhas.length === 0) {
      mostrarToast('Nenhum lançamento encontrado no PDF. Verifique o arquivo.', 'aviso');
      document.getElementById('progressoImport').style.display = 'none';
      mostrarLoading(false);
      return;
    }

    setProgresso(`${linhas.length} lançamentos encontrados. Buscando na memória...`, 70);
    estadoImport.linhas = linhas;
    await aplicarMemoriaDescricoes(linhas);

    setProgresso('Pronto!', 100);
    setTimeout(() => {
      document.getElementById('progressoImport').style.display = 'none';
      mostrarRevisaoImport();
    }, 600);

  } catch (err) {
    console.error('[PDF] Erro ao processar:', err);
    mostrarToast('Erro ao processar o PDF. Tente outro arquivo.', 'erro');
    document.getElementById('progressoImport').style.display = 'none';
  } finally {
    mostrarLoading(false);
  }
}

function setProgresso(msg, pct) {
  const bar  = document.getElementById('barraProgresso');
  const txt  = document.getElementById('textoProgresso');
  if (bar) bar.style.width  = pct + '%';
  if (txt) txt.textContent  = msg;
}

// ============================================================
// PARSER DE TEXTO DA FATURA
// ============================================================

/**
 * Extrai lançamentos de um bloco de texto bruto da fatura.
 * Suporta variações de formato das principais bandeiras.
 * @param {string} texto
 * @returns {Array} linhas com { descricao, valor, data, origem }
 */
function parsearTextoFatura(texto) {
  const resultados = [];

  // Padrões possíveis:
  // "15/01 DESCRICAO R$ 1.234,56"
  // "15 JAN DESCRICAO 1.234,56"
  // "15/01/2026 DESCRICAO 1.234,56"
  const padroes = [
    // DD/MM + descrição + R$ valor
    /(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.+?)\s+R\$\s*([\d.,]+)/gi,
    // DD/MM + descrição + valor sem R$
    /(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.+?)\s+([\d]{1,3}(?:\.\d{3})*,\d{2})/gi,
  ];

  const linhastexto = texto.split('\n');

  for (const linha of linhastexto) {
    const limpa = linha.trim();
    if (!limpa) continue;

    for (const padrao of padroes) {
      padrao.lastIndex = 0;
      let match;
      while ((match = padrao.exec(limpa)) !== null) {
        const dataStr  = match[1].trim();
        const desc     = limparDescricao(match[2]);
        const valorStr = match[3].replace(/\./g, '').replace(',', '.');
        const valor    = parseFloat(valorStr);

        if (!desc || isNaN(valor) || valor <= 0 || valor > 99999) continue;
        if (isLinhaTotalizadora(desc)) continue; // Ignorar totais/subtotais

        // Evitar duplicatas na mesma extração
        const jaExiste = resultados.some(r =>
          r.descricao === desc && Math.abs(r.valor - valor) < 0.01
        );
        if (!jaExiste) {
          resultados.push({
            descricao     : desc,
            valor,
            data          : normalizarData(dataStr),
            origem        : 'pdf',
            dono          : null,
            parcela_atual : 1,
            total_parcelas: 1,
            classificacao : 'manual', // será atualizado se encontrar na memória
            lembrar       : false
          });
        }
      }
    }
  }

  // Ordenar por data
  resultados.sort((a, b) => a.data.localeCompare(b.data));
  return resultados;
}

/** Remove lixo da descrição: números de cartão, prefixos comuns */
function limparDescricao(str) {
  return str
    .replace(/\*+\d{4}/g, '')       // *1234 (número mascarado do cartão)
    .replace(/\b\d{4}\b/g, '')       // sequências de 4 dígitos
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 80);
}

/** Verifica se a linha é um totalizador que deve ser ignorado */
function isLinhaTotalizadora(desc) {
  const palavras = ['total', 'subtotal', 'saldo', 'pagamento', 'crédito', 'limite', 'vencimento'];
  const norm = normalizarString(desc);
  return palavras.some(p => norm.startsWith(p));
}

/** Converte "DD/MM" ou "DD/MM/YYYY" em "YYYY-MM-DD" */
function normalizarData(dataStr) {
  const partes = dataStr.split('/');
  const dia    = partes[0].padStart(2, '0');
  const mes    = partes[1].padStart(2, '0');
  const ano    = partes[2] || new Date().getFullYear().toString();
  return `${ano}-${mes}-${dia}`;
}

// ============================================================
// MEMÓRIA DE DESCRIÇÕES
// ============================================================

/**
 * Para cada lançamento, busca na coleção `memoria_descricoes`.
 * Se encontrar, preenche dono e parcelas automaticamente.
 */
async function aplicarMemoriaDescricoes(linhas) {
  let snap;
  try {
    snap = await colecaoUsuario('memoria_descricoes').get();
  } catch (err) {
    console.warn('[Memória] Não foi possível carregar:', err);
    return;
  }

  const memorias = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  for (const linha of linhas) {
    const chave = normalizarString(linha.descricao);
    const match = memorias.find(m => {
      const mChave = normalizarString(m.descricao_chave || '');
      return chave.includes(mChave) || mChave.includes(chave);
    });

    if (match) {
      linha.dono           = match.dono;
      linha.total_parcelas = match.total_parcelas || 1;
      linha.classificacao  = 'automatico';
    }
  }
}

// ============================================================
// TELA DE REVISÃO — lista todos os lançamentos antes de confirmar
// ============================================================

function mostrarRevisaoImport() {
  const container = document.getElementById('revisaoContainer');
  const secao     = document.getElementById('secaoRevisao');
  if (!container || !secao) return;

  estadoImport.classificados = JSON.parse(JSON.stringify(estadoImport.linhas));

  // Verificar quantos precisam de classificação manual
  const semClassificacao = estadoImport.classificados.filter(l => !l.dono);
  if (semClassificacao.length > 0) {
    // Iniciar fluxo de classificação manual
    estadoImport.indexAtual = 0;
    proximoParaClassificar();
    return;
  }

  renderizarRevisao();
}

function renderizarRevisao() {
  const container = document.getElementById('revisaoContainer');
  const secao     = document.getElementById('secaoRevisao');
  secao.style.display = 'block';

  const cartao = estadoImport.cartoes.find(c => c.id === estadoImport.cartaoId);
  let total    = 0;

  container.innerHTML = `
    <div class="revisao-header">
      <h3>📑 Revisão — ${cartao?.nome || ''} · ${formatarMes(estadoImport.mes)}</h3>
      <p class="text-muted">${estadoImport.classificados.length} lançamentos</p>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Valor</th>
            <th>Responsável</th>
            <th>Parcelas</th>
            <th>Origem</th>
          </tr>
        </thead>
        <tbody id="tbodyRevisao"></tbody>
      </table>
    </div>
    <div class="revisao-footer">
      <div class="total-revisao">Total: <span class="mono valor-positivo" id="totalRevisao"></span></div>
      <div class="revisao-acoes">
        <button class="btn btn-ghost" onclick="cancelarImportacao()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarImportacao()">Confirmar e salvar</button>
      </div>
    </div>
  `;

  const tbody = document.getElementById('tbodyRevisao');
  estadoImport.classificados.forEach((l, i) => {
    total += l.valor;
    const donoTexto = formatarDonoTexto(l.dono);
    const parc      = l.total_parcelas > 1 ? `${l.parcela_atual}/${l.total_parcelas}` : '—';
    const origBadge = l.classificacao === 'automatico'
      ? '<span class="badge badge-info">Auto</span>'
      : '<span class="badge badge-warning">Manual</span>';

    tbody.innerHTML += `
      <tr>
        <td class="mono">${l.data.slice(5).split('-').reverse().join('/')}</td>
        <td>${l.descricao}</td>
        <td class="mono valor-negativo">${formatarMoeda(l.valor)}</td>
        <td>${donoTexto}</td>
        <td class="mono">${parc}</td>
        <td>${origBadge}</td>
      </tr>`;
  });

  document.getElementById('totalRevisao').textContent = formatarMoeda(total);
}

function formatarDonoTexto(dono) {
  if (!dono || !dono.length) return '<span class="text-muted">—</span>';
  return dono.map(d => {
    if (d.pessoa_id === 'eu') return 'Eu';
    const p = estadoImport.pessoas.find(x => x.id === d.pessoa_id);
    const pct = d.percentual < 100 ? ` (${d.percentual}%)` : '';
    return `<span class="badge" style="background:${p?.cor||'#666'}">${p?.nome || '?'}${pct}</span>`;
  }).join(' ');
}

// ============================================================
// MODAL DE CLASSIFICAÇÃO MANUAL
// ============================================================

function configurarModalClassificacao() {
  // Formulário de classificação
  document.getElementById('formClassificacao')?.addEventListener('submit', salvarClassificacaoAtual);

  // Rateio múltiplo
  document.getElementById('btnAddRateio')?.addEventListener('click', adicionarLinhaRateio);
}

function proximoParaClassificar() {
  const pendentes = estadoImport.classificados
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !l.dono);

  if (pendentes.length === 0) {
    renderizarRevisao();
    return;
  }

  const { l, i } = pendentes[0];
  estadoImport.indexAtual = i;
  preencherModalClassificacao(l);
  abrirModal('modalClassificacao');
}

function preencherModalClassificacao(lancamento) {
  document.getElementById('cl-descricao').textContent = lancamento.descricao;
  document.getElementById('cl-valor').textContent     = formatarMoeda(lancamento.valor);

  // Preencher select de pessoas
  const selDono = document.getElementById('cl-dono-principal');
  if (selDono) {
    selDono.innerHTML = '<option value="eu">Eu mesmo (100%)</option>';
    estadoImport.pessoas.forEach(p => {
      selDono.innerHTML += `<option value="${p.id}">${p.nome}</option>`;
    });
    selDono.innerHTML += '<option value="rateio">Dividir entre pessoas...</option>';
  }

  // Parcelas
  document.getElementById('cl-total-parcelas').value = lancamento.total_parcelas || 1;
  document.getElementById('cl-parcela-atual').value  = lancamento.parcela_atual  || 1;

  // Lembrar
  document.getElementById('cl-lembrar').checked = false;

  // Rateio
  document.getElementById('rateioArea').style.display = 'none';
  document.getElementById('rateioLinhas').innerHTML = '';

  // Mostrar progresso
  const total    = estadoImport.classificados.filter(l => !l.dono).length;
  const restante = estadoImport.classificados.filter(l => !l.dono).length;
  document.getElementById('cl-progresso').textContent =
    `Falta classificar: ${restante} lançamento(s)`;
}

function adicionarLinhaRateio() {
  const area = document.getElementById('rateioLinhas');
  const div  = document.createElement('div');
  div.className = 'rateio-linha';
  div.innerHTML = `
    <select class="form-control rateio-pessoa">
      <option value="eu">Eu</option>
      ${estadoImport.pessoas.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}
    </select>
    <input type="number" class="form-control rateio-pct" placeholder="%" min="1" max="100" value="50">
    <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.rateio-linha').remove()">✕</button>
  `;
  area.appendChild(div);
}

function salvarClassificacaoAtual(e) {
  e.preventDefault();
  const i          = estadoImport.indexAtual;
  const lancamento = estadoImport.classificados[i];
  const donoSel    = document.getElementById('cl-dono-principal').value;
  const parcTotal  = parseInt(document.getElementById('cl-total-parcelas').value) || 1;
  const parcAtual  = parseInt(document.getElementById('cl-parcela-atual').value)  || 1;
  const lembrar    = document.getElementById('cl-lembrar').checked;

  // Construir array dono
  let dono;
  if (donoSel === 'rateio') {
    const linhas = document.querySelectorAll('.rateio-linha');
    dono = Array.from(linhas).map(l => ({
      pessoa_id : l.querySelector('.rateio-pessoa').value,
      percentual: parseFloat(l.querySelector('.rateio-pct').value) || 0
    }));
    const totalPct = dono.reduce((s, d) => s + d.percentual, 0);
    if (Math.abs(totalPct - 100) > 0.5) {
      mostrarToast('A soma dos percentuais deve ser 100%.', 'aviso');
      return;
    }
  } else {
    dono = [{ pessoa_id: donoSel, percentual: 100 }];
  }

  lancamento.dono           = dono;
  lancamento.total_parcelas = parcTotal;
  lancamento.parcela_atual  = parcAtual;
  lancamento.classificacao  = 'manual';

  if (lembrar) salvarMemoriaDescricao(lancamento);

  fecharModal('modalClassificacao');
  proximoParaClassificar(); // Avança para o próximo pendente
}

// Alterna exibição do rateio
document.addEventListener('change', e => {
  if (e.target.id === 'cl-dono-principal') {
    const area = document.getElementById('rateioArea');
    if (area) area.style.display = e.target.value === 'rateio' ? 'block' : 'none';
    if (e.target.value === 'rateio' && !document.querySelector('.rateio-linha')) {
      adicionarLinhaRateio(); adicionarLinhaRateio();
    }
  }
});

// ============================================================
// SALVAR NA MEMÓRIA
// ============================================================

async function salvarMemoriaDescricao(lancamento) {
  try {
    const chave = normalizarString(lancamento.descricao);
    await colecaoUsuario('memoria_descricoes').add({
      descricao_chave: chave,
      dono           : lancamento.dono,
      total_parcelas : lancamento.total_parcelas,
      atualizado_em  : firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.warn('[Memória] Erro ao salvar:', err);
  }
}

// ============================================================
// CONFIRMAÇÃO FINAL — salvar no Firestore
// ============================================================

async function confirmarImportacao() {
  mostrarLoading(true);
  try {
    const faturaId = await obterOuCriarFatura(estadoImport.cartaoId, estadoImport.mes);
    const batch    = db.batch();
    const userRef  = db.collection('usuarios').doc(auth.currentUser.uid);
    const ts       = firebase.firestore.FieldValue.serverTimestamp();

    for (const l of estadoImport.classificados) {
      const ref = userRef.collection('lancamentos').doc();
      batch.set(ref, {
        fatura_id     : faturaId,
        cartao_id     : estadoImport.cartaoId,
        descricao     : l.descricao,
        valor         : l.valor,
        data          : l.data,
        dono          : l.dono,
        parcela_atual : l.parcela_atual,
        total_parcelas: l.total_parcelas,
        mes           : estadoImport.mes,
        criado_em     : ts
      });
    }

    // Atualizar fatura: status fechada, total
    const total = estadoImport.classificados.reduce((s, l) => s + l.valor, 0);
    batch.update(userRef.collection('faturas').doc(faturaId), {
      total,
      status: 'fechada',
      importada_em: ts
    });

    await batch.commit();

    mostrarToast(`${estadoImport.classificados.length} lançamentos salvos!`, 'sucesso');
    document.getElementById('secaoRevisao').style.display = 'none';
    estadoImport.linhas = [];
    estadoImport.classificados = [];
    await listarFaturasExistentes();

  } catch (err) {
    console.error('[PDF] Erro ao confirmar importação:', err);
    mostrarToast('Erro ao salvar os lançamentos.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

function cancelarImportacao() {
  estadoImport.linhas        = [];
  estadoImport.classificados = [];
  document.getElementById('secaoRevisao').style.display = 'none';
}

// ============================================================
// VER LANÇAMENTOS DE UMA FATURA EXISTENTE
// ============================================================

async function verLancamentosFatura(faturaId, mes) {
  mostrarLoading(true);
  try {
    const snap   = await colecaoUsuario('lancamentos').where('fatura_id', '==', faturaId).orderBy('data').get();
    const modal  = document.getElementById('modalVerFatura');
    const corpo  = document.getElementById('verFaturaCorpo');
    if (!modal || !corpo) return;

    document.getElementById('verFaturaTitulo').textContent = formatarMes(mes);

    let total = 0;
    corpo.innerHTML = '';
    snap.forEach(d => {
      const l = d.data();
      total += l.valor;
      corpo.innerHTML += `
        <tr>
          <td class="mono">${l.data?.slice(5).split('-').reverse().join('/') || '—'}</td>
          <td>${l.descricao}</td>
          <td class="mono valor-negativo">${formatarMoeda(l.valor)}</td>
          <td>${formatarDonoTexto(l.dono)}</td>
        </tr>`;
    });

    document.getElementById('verFaturaTotal').textContent = formatarMoeda(total);
    abrirModal('modalVerFatura');
  } catch (err) {
    mostrarToast('Erro ao carregar lançamentos.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

// ============================================================
// EXCLUIR FATURA
// ============================================================

async function excluirFatura(faturaId) {
  confirmarExclusao('Excluir esta fatura e todos os seus lançamentos?', async () => {
    mostrarLoading(true);
    try {
      // Excluir lançamentos
      const snap = await colecaoUsuario('lancamentos').where('fatura_id', '==', faturaId).get();
      const batch = db.batch();
      const userRef = db.collection('usuarios').doc(auth.currentUser.uid);
      snap.forEach(d => batch.delete(userRef.collection('lancamentos').doc(d.id)));
      batch.delete(userRef.collection('faturas').doc(faturaId));
      await batch.commit();
      mostrarToast('Fatura excluída.', 'sucesso');
      await listarFaturasExistentes();
    } catch (err) {
      mostrarToast('Erro ao excluir fatura.', 'erro');
    } finally {
      mostrarLoading(false);
    }
  });
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('faturas.html')) {
    inicializarPaginaFaturas();
  }
});
