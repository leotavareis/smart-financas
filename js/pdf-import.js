// ============================================================
// PDF-IMPORT.JS — Importação e classificação de faturas em PDF
// Depende de: PDF.js (CDN), app.js, auth.js
// ============================================================

const estadoImport = {
  cartaoId      : null,
  mes           : null,
  linhas        : [],   // Lançamentos brutos extraídos do PDF
  classificados : [],   // Cópia com dono/parcelas preenchidos
  indexAtual    : 0,    // Índice no loop de classificação manual
  pessoas       : [],   // Cache carregado uma vez
  cartoes       : []    // Cache carregado uma vez
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
    configurarModalClassificacao();
    await listarFaturasExistentes();
  } catch (err) {
    console.error('[PDF] Erro ao inicializar:', err);
    mostrarToast('Erro ao carregar a página de faturas.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

// ── Carregamento de dados ────────────────────────────────────

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
    .filter(p => p.nome); // Ignora pessoas sem nome ainda
}

async function listarFaturasExistentes() {
  const lista = document.getElementById('listaFaturas');
  if (!lista) return;

  const snap = await colecaoUsuario('faturas')
    .orderBy('mes', 'desc')
    .limit(30)
    .get();

  if (snap.empty) {
    lista.innerHTML = '<p class="empty-state">Nenhuma fatura importada ainda.</p>';
    return;
  }

  lista.innerHTML = '';
  snap.forEach(doc => {
    const f      = doc.data();
    const cartao = estadoImport.cartoes.find(c => c.id === f.cartao_id);
    const cor    = cartao?.cor || '#3b82f6';
    const badge  = f.status === 'fechada'
      ? '<span class="badge badge-success">Fechada</span>'
      : '<span class="badge badge-warning">Aberta</span>';

    lista.innerHTML += `
      <div class="card-row card" style="border-left:4px solid ${cor}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700">${cartao?.nome || 'Cartão'}</div>
          <div class="text-muted small">${formatarMes(f.mes)}</div>
        </div>
        <div class="row-mid">
          ${badge}
          <span class="mono">${formatarMoeda(f.total)}</span>
        </div>
        <div class="row-actions">
          <button class="btn btn-sm btn-ghost"
              onclick="verLancamentosFatura('${doc.id}','${f.mes}')">Ver</button>
          <button class="btn btn-sm btn-danger"
              onclick="excluirFatura('${doc.id}')">Excluir</button>
        </div>
      </div>`;
  });
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
  ['dragleave', 'dragend'].forEach(ev =>
    zone.addEventListener(ev, () => zone.classList.remove('dragover'))
  );

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') iniciarImportacao(file);
    else mostrarToast('Selecione um arquivo PDF válido.', 'aviso');
  });

  inp.addEventListener('change', () => {
    if (inp.files[0]) iniciarImportacao(inp.files[0]);
  });

  // Preenche mês padrão
  const mesInput = document.getElementById('mesImport');
  if (mesInput && !mesInput.value) mesInput.value = getMesAtual();
}

function iniciarImportacao(arquivo) {
  estadoImport.cartaoId = document.getElementById('selectCartaoImport')?.value;
  estadoImport.mes      = document.getElementById('mesImport')?.value;

  if (!estadoImport.cartaoId) {
    mostrarToast('Selecione o cartão antes de importar.', 'aviso');
    return;
  }
  if (!estadoImport.mes) {
    mostrarToast('Selecione o mês antes de importar.', 'aviso');
    return;
  }
  processarPDF(arquivo);
}

// ============================================================
// PROCESSAMENTO DO PDF
// ============================================================

async function processarPDF(arquivo) {
  mostrarLoading(true);
  const progressoEl = document.getElementById('progressoImport');
  if (progressoEl) progressoEl.style.display = 'block';
  setProgresso('Lendo PDF…', 10);

  try {
    const arrayBuffer = await arquivo.arrayBuffer();
    const pdfDoc      = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let textoCompleto = '';

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page    = await pdfDoc.getPage(i);
      const conteudo = await page.getTextContent();
      textoCompleto += conteudo.items.map(t => t.str).join(' ') + '\n';
      setProgresso(`Lendo página ${i} de ${pdfDoc.numPages}…`, 10 + (i / pdfDoc.numPages) * 40);
    }

    setProgresso('Identificando lançamentos…', 55);
    const linhas = parsearTextoFatura(textoCompleto);

    if (!linhas.length) {
      mostrarToast('Nenhum lançamento encontrado no PDF. Verifique o arquivo.', 'aviso');
      if (progressoEl) progressoEl.style.display = 'none';
      mostrarLoading(false);
      return;
    }

    setProgresso(`${linhas.length} lançamentos encontrados. Buscando na memória…`, 70);
    estadoImport.linhas = linhas;
    await aplicarMemoriaDescricoes(linhas);

    setProgresso('Pronto!', 100);
    setTimeout(() => {
      if (progressoEl) progressoEl.style.display = 'none';
      estadoImport.classificados = JSON.parse(JSON.stringify(estadoImport.linhas));
      iniciarClassificacaoManual();
    }, 600);

  } catch (err) {
    console.error('[PDF] Erro ao processar:', err);
    mostrarToast('Erro ao processar o PDF. Tente outro arquivo.', 'erro');
    if (progressoEl) progressoEl.style.display = 'none';
  } finally {
    mostrarLoading(false);
  }
}

function setProgresso(msg, pct) {
  const bar = document.getElementById('barraProgresso');
  const txt = document.getElementById('textoProgresso');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = msg;
}

// ============================================================
// PARSER DE TEXTO
// ============================================================

/**
 * Extrai lançamentos do texto bruto da fatura.
 * Suporta formatos: "DD/MM DESCRIÇÃO R$ 1.234,56" e variações.
 */
function parsearTextoFatura(texto) {
  const resultados = [];

  const padroes = [
    // Com "R$" explícito
    /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+R\$\s*([\d.]+,\d{2})/gi,
    // Sem "R$" — valor no padrão brasileiro
    /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\b/gi,
  ];

  const linhas = texto.split('\n');

  for (const linha of linhas) {
    const limpa = linha.trim();
    if (!limpa) continue;

    for (const padrao of padroes) {
      padrao.lastIndex = 0;
      let match;
      while ((match = padrao.exec(limpa)) !== null) {
        const dataStr  = match[1];
        const desc     = limparDescricao(match[2]);
        const valorStr = match[3].replace(/\./g, '').replace(',', '.');
        const valor    = parseFloat(valorStr);

        if (!desc || isNaN(valor) || valor <= 0 || valor > 99_999) continue;
        if (isLinhaTotalizadora(desc)) continue;

        // Evita duplicatas dentro da mesma extração
        const jaExiste = resultados.some(r =>
          r.descricao === desc && Math.abs(r.valor - valor) < 0.01
        );
        if (jaExiste) continue;

        resultados.push({
          descricao     : desc,
          valor,
          data          : normalizarData(dataStr),
          dono          : null,  // null = precisa de classificação
          parcela_atual : 1,
          total_parcelas: 1,
          classificacao : 'manual',
          lembrar       : false
        });
      }
    }
  }

  resultados.sort((a, b) => a.data.localeCompare(b.data));
  return resultados;
}

function limparDescricao(str) {
  return (str || '')
    .replace(/\*+\d{4}/g, '')   // número mascarado *1234
    .replace(/\b\d{4}\b/g, '')  // sequências de 4 dígitos soltos
    .replace(/\s{2,}/g, ' ')
    .trim()
    .substring(0, 80);
}

function isLinhaTotalizadora(desc) {
  const palavras = ['total', 'subtotal', 'saldo', 'pagamento', 'credito', 'limite', 'vencimento'];
  return palavras.some(p => normalizarString(desc).startsWith(p));
}

function normalizarData(str) {
  const p   = str.split('/');
  const dia = p[0].padStart(2, '0');
  const mes = p[1].padStart(2, '0');
  const ano = p[2]
    ? (p[2].length === 2 ? '20' + p[2] : p[2])
    : new Date().getFullYear().toString();
  return `${ano}-${mes}-${dia}`;
}

// ============================================================
// MEMÓRIA DE DESCRIÇÕES
// ============================================================

async function aplicarMemoriaDescricoes(linhas) {
  try {
    const snap     = await colecaoUsuario('memoria_descricoes').get();
    const memorias = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    for (const linha of linhas) {
      const chave = normalizarString(linha.descricao);
      const match = memorias.find(m => {
        const mc = normalizarString(m.descricao_chave || '');
        return mc && (chave.includes(mc) || mc.includes(chave));
      });
      if (match) {
        linha.dono           = match.dono;
        linha.total_parcelas = match.total_parcelas || 1;
        linha.classificacao  = 'automatico';
      }
    }
  } catch (err) {
    console.warn('[Memória] Não foi possível carregar:', err);
  }
}

async function salvarMemoriaDescricao(lancamento) {
  try {
    await colecaoUsuario('memoria_descricoes').add({
      descricao_chave : normalizarString(lancamento.descricao),
      dono            : lancamento.dono,
      total_parcelas  : lancamento.total_parcelas,
      atualizado_em   : firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.warn('[Memória] Erro ao salvar:', err);
  }
}

// ============================================================
// CLASSIFICAÇÃO MANUAL — modal sequencial
// ============================================================

function configurarModalClassificacao() {
  document.getElementById('formClassificacao')
    ?.addEventListener('submit', salvarClassificacaoAtual);

  document.getElementById('btnAddRateio')
    ?.addEventListener('click', adicionarLinhaRateio);

  // Toggle rateio ao mudar seleção de dono
  document.getElementById('cl-dono-principal')
    ?.addEventListener('change', e => {
      const area = document.getElementById('rateioArea');
      if (!area) return;
      const mostrar = e.target.value === 'rateio';
      area.style.display = mostrar ? 'block' : 'none';
      if (mostrar && !document.querySelector('.rateio-linha')) {
        adicionarLinhaRateio();
        adicionarLinhaRateio();
      }
    });
}

function iniciarClassificacaoManual() {
  // Encontra o primeiro item sem dono
  const pendentes = estadoImport.classificados.filter(l => !l.dono);
  if (!pendentes.length) {
    renderizarRevisao();
    return;
  }
  avancarParaProxima();
}

function avancarParaProxima() {
  const pendentes = estadoImport.classificados
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !l.dono);

  if (!pendentes.length) {
    fecharModal('modalClassificacao');
    renderizarRevisao();
    return;
  }

  const { l, i } = pendentes[0];
  estadoImport.indexAtual = i;
  preencherModalClassificacao(l, pendentes.length);
  abrirModal('modalClassificacao');
}

/** Pular item — marca com dono "eu" e avança */
function pularClassificacao() {
  const i = estadoImport.indexAtual;
  estadoImport.classificados[i].dono = [{ pessoa_id: 'eu', percentual: 100 }];
  estadoImport.classificados[i].classificacao = 'pulado';
  fecharModal('modalClassificacao');
  setTimeout(avancarParaProxima, 200);
}

function preencherModalClassificacao(lancamento, totalPendentes) {
  document.getElementById('cl-descricao').textContent = lancamento.descricao;
  document.getElementById('cl-valor').textContent     = formatarMoeda(lancamento.valor);
  document.getElementById('cl-progresso').textContent = `Faltam: ${totalPendentes}`;
  document.getElementById('cl-total-parcelas').value  = lancamento.total_parcelas || 1;
  document.getElementById('cl-parcela-atual').value   = lancamento.parcela_atual  || 1;
  document.getElementById('cl-lembrar').checked       = false;

  const selDono = document.getElementById('cl-dono-principal');
  if (selDono) {
    selDono.innerHTML = '<option value="eu">Eu mesmo (100%)</option>';
    estadoImport.pessoas.forEach(p => {
      selDono.innerHTML += `<option value="${p.id}">${p.nome}</option>`;
    });
    selDono.innerHTML += '<option value="rateio">Dividir entre várias pessoas…</option>';
  }

  const rateioArea = document.getElementById('rateioArea');
  if (rateioArea) rateioArea.style.display = 'none';
  document.getElementById('rateioLinhas').innerHTML = '';
}

function adicionarLinhaRateio() {
  const div = document.createElement('div');
  div.className = 'rateio-linha';
  div.innerHTML = `
    <select class="form-control rateio-pessoa">
      <option value="eu">Eu</option>
      ${estadoImport.pessoas.map(p =>
        `<option value="${p.id}">${p.nome}</option>`
      ).join('')}
    </select>
    <input type="number" class="form-control rateio-pct"
           placeholder="%" min="1" max="100" value="50">
    <button type="button" class="btn btn-sm btn-danger"
            onclick="this.closest('.rateio-linha').remove()">✕</button>
  `;
  document.getElementById('rateioLinhas').appendChild(div);
}

function salvarClassificacaoAtual(e) {
  e.preventDefault();
  const i        = estadoImport.indexAtual;
  const lanc     = estadoImport.classificados[i];
  const donoSel  = document.getElementById('cl-dono-principal').value;
  const parcTotal = parseInt(document.getElementById('cl-total-parcelas').value) || 1;
  const parcAtual = parseInt(document.getElementById('cl-parcela-atual').value)  || 1;
  const lembrar  = document.getElementById('cl-lembrar').checked;

  // Construir array dono
  let dono;
  if (donoSel === 'rateio') {
    const linhas = document.querySelectorAll('.rateio-linha');
    dono = Array.from(linhas).map(l => ({
      pessoa_id : l.querySelector('.rateio-pessoa').value,
      percentual: parseFloat(l.querySelector('.rateio-pct').value) || 0
    }));
    const soma = dono.reduce((s, d) => s + d.percentual, 0);
    if (Math.abs(soma - 100) > 0.5) {
      mostrarToast(`Soma dos percentuais é ${soma.toFixed(0)}%. Deve ser 100%.`, 'aviso');
      return;
    }
  } else {
    dono = [{ pessoa_id: donoSel, percentual: 100 }];
  }

  lanc.dono           = dono;
  lanc.total_parcelas = parcTotal;
  lanc.parcela_atual  = parcAtual;
  lanc.classificacao  = 'manual';

  if (lembrar) salvarMemoriaDescricao(lanc);

  fecharModal('modalClassificacao');
  setTimeout(avancarParaProxima, 200);
}

// ============================================================
// TELA DE REVISÃO
// ============================================================

function renderizarRevisao() {
  const secao     = document.getElementById('secaoRevisao');
  const container = document.getElementById('revisaoContainer');
  if (!secao || !container) return;

  secao.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const cartao = estadoImport.cartoes.find(c => c.id === estadoImport.cartaoId);
  let total    = 0;

  container.innerHTML = `
    <div class="revisao-header">
      <h3>📋 Revisão — ${cartao?.nome || ''} · ${formatarMes(estadoImport.mes)}</h3>
      <span class="text-muted small">${estadoImport.classificados.length} lançamentos</span>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Data</th><th>Descrição</th><th style="text-align:right">Valor</th>
            <th>Responsável</th><th>Parcelas</th><th>Origem</th>
          </tr>
        </thead>
        <tbody id="tbodyRevisao"></tbody>
      </table>
    </div>
    <div class="revisao-footer">
      <div class="total-revisao">
        Total: <span class="mono valor-negativo" id="totalRevisao"></span>
      </div>
      <div class="revisao-acoes">
        <button class="btn btn-ghost" onclick="cancelarImportacao()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarImportacao()">Confirmar e salvar</button>
      </div>
    </div>`;

  const tbody = document.getElementById('tbodyRevisao');
  estadoImport.classificados.forEach(l => {
    total += l.valor;
    const dataFmt    = l.data ? l.data.slice(5).split('-').reverse().join('/') : '—';
    const donoTexto  = _formatarDonoTexto(l.dono);
    const parc       = l.total_parcelas > 1 ? `${l.parcela_atual}/${l.total_parcelas}` : '—';
    const origemBadge = l.classificacao === 'automatico'
      ? '<span class="badge badge-info">Auto</span>'
      : l.classificacao === 'pulado'
        ? '<span class="badge badge-warning">Pulado</span>'
        : '<span class="badge" style="background:var(--secondary)">Manual</span>';

    tbody.innerHTML += `
      <tr>
        <td class="mono small">${dataFmt}</td>
        <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
            title="${l.descricao}">${l.descricao}</td>
        <td class="mono valor-negativo" style="text-align:right">${formatarMoeda(l.valor)}</td>
        <td>${donoTexto}</td>
        <td class="mono small">${parc}</td>
        <td>${origemBadge}</td>
      </tr>`;
  });

  document.getElementById('totalRevisao').textContent = formatarMoeda(total);
}

function _formatarDonoTexto(dono) {
  if (!dono?.length) return '<span class="text-muted">—</span>';
  return dono.map(d => {
    if (d.pessoa_id === 'eu') return '<span class="badge" style="background:var(--primary)">Eu</span>';
    const p   = estadoImport.pessoas.find(x => x.id === d.pessoa_id);
    const pct = d.percentual < 100 ? ` ${d.percentual}%` : '';
    return `<span class="badge" style="background:${p?.cor || '#555'}">${p?.nome || '?'}${pct}</span>`;
  }).join(' ');
}

// ============================================================
// CONFIRMAÇÃO FINAL
// ============================================================

async function confirmarImportacao() {
  mostrarLoading(true);
  try {
    const faturaId = await obterOuCriarFatura(estadoImport.cartaoId, estadoImport.mes);
    const userRef  = db.collection('usuarios').doc(auth.currentUser.uid);
    const batch    = db.batch();
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

    const total = estadoImport.classificados.reduce((s, l) => s + l.valor, 0);
    batch.update(userRef.collection('faturas').doc(faturaId), {
      total,
      status      : 'fechada',
      importada_em: ts
    });

    await batch.commit();

    mostrarToast(`${estadoImport.classificados.length} lançamentos salvos com sucesso!`, 'sucesso');
    cancelarImportacao(); // Limpa estado
    await listarFaturasExistentes();

  } catch (err) {
    console.error('[PDF] Erro ao confirmar importação:', err);
    mostrarToast('Erro ao salvar os lançamentos. Tente novamente.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

function cancelarImportacao() {
  estadoImport.linhas        = [];
  estadoImport.classificados = [];
  estadoImport.indexAtual    = 0;
  const secao = document.getElementById('secaoRevisao');
  if (secao) secao.style.display = 'none';
  // Limpa o input de arquivo para permitir re-importar o mesmo arquivo
  const inp = document.getElementById('inputPDF');
  if (inp) inp.value = '';
}

// ============================================================
// VER / EXCLUIR FATURA
// ============================================================

async function verLancamentosFatura(faturaId, mes) {
  mostrarLoading(true);
  try {
    const snap  = await colecaoUsuario('lancamentos')
      .where('fatura_id', '==', faturaId)
      .orderBy('data', 'asc')
      .get();

    const modal = document.getElementById('modalVerFatura');
    const corpo = document.getElementById('verFaturaCorpo');
    if (!modal || !corpo) return;

    document.getElementById('verFaturaTitulo').textContent = formatarMes(mes);

    let total = 0;
    corpo.innerHTML = '';

    if (snap.empty) {
      corpo.innerHTML = '<tr><td colspan="4" class="empty-state">Sem lançamentos.</td></tr>';
    } else {
      snap.forEach(d => {
        const l  = d.data();
        total   += l.valor;
        const dt = l.data ? l.data.slice(5).split('-').reverse().join('/') : '—';
        corpo.innerHTML += `
          <tr>
            <td class="mono small">${dt}</td>
            <td>${l.descricao}</td>
            <td class="mono valor-negativo" style="text-align:right">${formatarMoeda(l.valor)}</td>
            <td>${_formatarDonoTexto(l.dono)}</td>
          </tr>`;
      });
    }

    document.getElementById('verFaturaTotal').textContent = formatarMoeda(total);
    abrirModal('modalVerFatura');
  } catch (err) {
    mostrarToast('Erro ao carregar lançamentos.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

async function excluirFatura(faturaId) {
  confirmarExclusao(
    'Excluir esta fatura e todos os seus lançamentos? Esta ação não pode ser desfeita.',
    async () => {
      mostrarLoading(true);
      try {
        const userRef = db.collection('usuarios').doc(auth.currentUser.uid);
        const batch   = db.batch();

        const snap = await colecaoUsuario('lancamentos')
          .where('fatura_id', '==', faturaId)
          .get();
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
    }
  );
}
