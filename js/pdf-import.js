// ============================================================
// PDF-IMPORT.JS — Importação de faturas via Google Gemini AI
// O PDF é enviado em base64 para o Gemini, que extrai os
// lançamentos e retorna JSON estruturado. Sem regex frágil.
// Depende de: app.js, auth.js
// ============================================================

const estadoImport = {
  cartaoId      : null,
  mes           : null,
  classificados : [],   // Lançamentos prontos para revisão/salvar
  indexAtual    : 0,    // Índice no loop de classificação manual
  pessoas       : [],   // Cache
  cartoes       : []    // Cache
};

// Chave Gemini salva no localStorage (não vai para o Firestore)
const GEMINI_KEY_LS = 'smartfinancas_gemini_key';

// ============================================================
// INICIALIZAÇÃO DA PÁGINA
// ============================================================

async function inicializarPaginaFaturas() {
  mostrarLoading(true);
  try {
    await Promise.all([carregarCartoesSelect(), carregarPessoasEstado()]);
    configurarDropZone();
    configurarModalClassificacao();
    renderizarStatusChave();
    await listarFaturasExistentes();

    // Abre o modal de chave automaticamente se ainda não estiver configurada
    if (!obterChaveGemini()) {
      setTimeout(() => abrirModal('modalGeminiKey'), 600);
    }
  } catch (err) {
    console.error('[PDF] Erro ao inicializar:', err);
    mostrarToast('Erro ao carregar a página de faturas.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

// ── Carregamento de dados ─────────────────────────────────────

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
// GERENCIAMENTO DA CHAVE GEMINI
// ============================================================

function obterChaveGemini() {
  return localStorage.getItem(GEMINI_KEY_LS) || '';
}

function salvarChaveGemini(chave) {
  if (chave) localStorage.setItem(GEMINI_KEY_LS, chave.trim());
  else localStorage.removeItem(GEMINI_KEY_LS);
}

/** Mostra no card de configuração se a chave já está salva */
function renderizarStatusChave() {
  const chave  = obterChaveGemini();
  const status = document.getElementById('geminiKeyStatus');
  const input  = document.getElementById('geminiKeyInput');
  if (!status) return;

  if (chave) {
    status.innerHTML = `
      <span style="color:var(--success)">✓ Chave Gemini configurada</span>
      <button class="btn btn-sm btn-ghost" onclick="removerChaveGemini()">Remover</button>`;
    if (input) input.value = '';
  } else {
    status.innerHTML = `<span style="color:var(--warning)">⚠ Chave Gemini não configurada</span>`;
  }
}

function salvarChaveEFechar() {
  const input = document.getElementById('geminiKeyInput');
  const chave = input?.value.trim();
  if (!chave) { mostrarToast('Cole a chave antes de salvar.', 'aviso'); return; }
  salvarChaveGemini(chave);
  renderizarStatusChave();
  fecharModal('modalGeminiKey');
  mostrarToast('Chave Gemini salva!', 'sucesso');
}

function removerChaveGemini() {
  salvarChaveGemini('');
  renderizarStatusChave();
  mostrarToast('Chave removida.', 'info');
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
    inp.value = ''; // permite re-selecionar o mesmo arquivo
  });

  // Mês padrão
  const mesInput = document.getElementById('mesImport');
  if (mesInput && !mesInput.value) mesInput.value = getMesAtual();
}

function iniciarImportacao(arquivo) {
  estadoImport.cartaoId = document.getElementById('selectCartaoImport')?.value;
  estadoImport.mes      = document.getElementById('mesImport')?.value;

  if (!estadoImport.cartaoId) {
    mostrarToast('Selecione o cartão antes de importar.', 'aviso'); return;
  }
  if (!estadoImport.mes) {
    mostrarToast('Selecione o mês antes de importar.', 'aviso'); return;
  }

  const chave = obterChaveGemini();
  if (!chave) {
    abrirModal('modalGeminiKey');
    mostrarToast('Configure sua chave Gemini para usar a IA.', 'aviso');
    return;
  }

  processarComGemini(arquivo, chave);
}

// ============================================================
// EXTRAÇÃO VIA GEMINI AI
// ============================================================

async function processarComGemini(arquivo, chaveApi) {
  mostrarLoading(true);
  const progressoEl = document.getElementById('progressoImport');
  if (progressoEl) progressoEl.style.display = 'block';
  setProgresso('Lendo arquivo PDF…', 15);

  try {
    // 1. Converter PDF para base64
    const base64 = await arquivoParaBase64(arquivo);
    setProgresso('Enviando para a IA Gemini…', 35);

    // 2. Montar prompt estruturado
    const prompt = `Analise esta fatura de cartão de crédito em PDF e extraia todos os lançamentos.

Retorne SOMENTE um JSON válido, sem markdown, sem texto antes ou depois.

Formato:
{
  "lancamentos": [
    {
      "data": "DD/MM",
      "descricao": "EXATAMENTE como aparece na fatura, sem alterar nada",
      "valor": 123.45
    }
  ]
}

Regras OBRIGATÓRIAS:
- Copie a descrição EXATAMENTE como está escrita na fatura — não traduza, não resuma, não limpe
- Inclua TODOS os lançamentos de compra
- EXCLUA: total da fatura, pagamentos anteriores, créditos, encargos, IOF, juros, multas
- "valor" deve ser número positivo com ponto decimal (ex: 49.90)
- "data" deve ser DD/MM
- Se aparecer indicação de parcela no texto (ex: "02/12"), mantenha na descrição`;

    // 3. Chamar Gemini API
    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${chaveApi}`,
      {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: base64 } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature    : 0.1,   // Respostas determinísticas
            responseMimeType: 'application/json'
          }
        })
      }
    );

    setProgresso('Processando resposta da IA…', 70);

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      const msg  = erro?.error?.message || `Erro ${resposta.status}`;

      if (resposta.status === 400 && msg.includes('API_KEY')) {
        mostrarToast('Chave Gemini inválida. Configure novamente.', 'erro');
        abrirModal('modalGeminiKey');
      } else if (resposta.status === 429) {
        mostrarToast('Limite da API Gemini atingido. Aguarde alguns minutos.', 'aviso');
      } else {
        mostrarToast(`Erro Gemini: ${msg}`, 'erro');
      }
      return;
    }

    const dados    = await resposta.json();
    const textoIA  = dados?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    setProgresso('Interpretando lançamentos…', 85);

    // 4. Parsear JSON retornado pela IA
    let lancamentosIA;
    try {
      // Remove possíveis marcadores de markdown que a IA às vezes adiciona
      const jsonLimpo = textoIA.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed    = JSON.parse(jsonLimpo);
      lancamentosIA   = parsed.lancamentos || parsed;
      if (!Array.isArray(lancamentosIA)) throw new Error('Formato inesperado');
    } catch (parseErr) {
      console.error('[Gemini] Resposta bruta:', textoIA);
      mostrarToast('A IA retornou um formato inesperado. Tente novamente.', 'erro');
      return;
    }

    if (!lancamentosIA.length) {
      mostrarToast('Nenhum lançamento encontrado pela IA. Verifique o PDF.', 'aviso');
      return;
    }

    setProgresso(`${lancamentosIA.length} lançamentos extraídos!`, 100);

    // 5. Converter para formato interno e buscar memórias
    const linhas = lancamentosIA.map(l => ({
      descricao     : (l.descricao || '').substring(0, 80),
      valor         : parseFloat(String(l.valor).replace(',', '.')) || 0,
      data          : normalizarDataIA(l.data, estadoImport.mes),
      dono          : null,
      parcela_atual : extrairParcelaAtual(l.descricao),
      total_parcelas: extrairTotalParcelas(l.descricao),
      classificacao : 'manual'
    })).filter(l => l.valor > 0 && l.valor < 99_999);

    await aplicarMemoriaDescricoes(linhas);

    setTimeout(() => {
      if (progressoEl) progressoEl.style.display = 'none';
      estadoImport.classificados = linhas;
      iniciarClassificacaoManual();
    }, 600);

  } catch (err) {
    console.error('[Gemini] Erro:', err);
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      mostrarToast('Sem conexão com a internet ou CORS bloqueado.', 'erro');
    } else {
      mostrarToast('Erro ao processar com IA. Tente novamente.', 'erro');
    }
    if (progressoEl) progressoEl.style.display = 'none';
  } finally {
    mostrarLoading(false);
  }
}

/** Converte File para string base64 (sem prefixo data:...) */
function arquivoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(arquivo);
  });
}

function setProgresso(msg, pct) {
  const bar = document.getElementById('barraProgresso');
  const txt = document.getElementById('textoProgresso');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = msg;
}

/** Converte "DD/MM" da IA para "YYYY-MM-DD" usando o mês da fatura como referência */
function normalizarDataIA(dataStr, mesFatura) {
  if (!dataStr) return mesFatura ? mesFatura + '-01' : new Date().toISOString().slice(0, 10);

  const partes = String(dataStr).split('/');
  const dia    = (partes[0] || '01').padStart(2, '0');
  const mes    = (partes[1] || (mesFatura?.split('-')[1] || '01')).padStart(2, '0');
  const ano    = partes[2] || (mesFatura?.split('-')[0] || new Date().getFullYear().toString());
  return `${ano}-${mes}-${dia}`;
}

/** Detecta "2/6" ou "02/06" na descrição e retorna parcela atual */
function extrairParcelaAtual(desc) {
  const m = String(desc || '').match(/\b(\d{1,2})\/(\d{1,2})\s*$/);
  return m ? parseInt(m[1]) : 1;
}

/** Detecta "2/6" na descrição e retorna total de parcelas */
function extrairTotalParcelas(desc) {
  const m = String(desc || '').match(/\b\d{1,2}\/(\d{1,2})\s*$/);
  return m ? parseInt(m[1]) : 1;
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
        linha.total_parcelas = match.total_parcelas || linha.total_parcelas || 1;
        linha.classificacao  = 'automatico';
      }
    }
  } catch (err) {
    console.warn('[Memória] Erro ao carregar:', err);
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

  document.getElementById('cl-dono-principal')
    ?.addEventListener('change', e => {
      const area = document.getElementById('rateioArea');
      if (!area) return;
      const mostrar = e.target.value === 'rateio';
      area.style.display = mostrar ? 'block' : 'none';
      if (mostrar && !document.querySelector('.rateio-linha')) {
        adicionarLinhaRateio(); adicionarLinhaRateio();
      }
    });
}

function iniciarClassificacaoManual() {
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

function pularClassificacao() {
  const i = estadoImport.indexAtual;
  estadoImport.classificados[i].dono          = [{ pessoa_id: 'eu', percentual: 100 }];
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
            onclick="this.closest('.rateio-linha').remove()">✕</button>`;
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

  let dono;
  if (donoSel === 'rateio') {
    const linhas = document.querySelectorAll('.rateio-linha');
    dono = Array.from(linhas).map(l => ({
      pessoa_id : l.querySelector('.rateio-pessoa').value,
      percentual: parseFloat(l.querySelector('.rateio-pct').value) || 0
    }));
    const soma = dono.reduce((s, d) => s + d.percentual, 0);
    if (Math.abs(soma - 100) > 0.5) {
      mostrarToast(`Soma é ${soma.toFixed(0)}%. Precisa ser 100%.`, 'aviso');
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
            <th>Data</th><th>Descrição</th>
            <th style="text-align:right">Valor</th>
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
    const dataFmt   = l.data ? l.data.slice(5).split('-').reverse().join('/') : '—';
    const donoTexto = _formatarDonoTexto(l.dono);
    const parc      = l.total_parcelas > 1 ? `${l.parcela_atual}/${l.total_parcelas}` : '—';
    const badge     = l.classificacao === 'automatico'
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
        <td>${badge}</td>
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
      total, status: 'fechada', importada_em: ts
    });

    await batch.commit();
    mostrarToast(`${estadoImport.classificados.length} lançamentos salvos!`, 'sucesso');
    cancelarImportacao();
    await listarFaturasExistentes();

  } catch (err) {
    console.error('[PDF] Erro ao confirmar importação:', err);
    mostrarToast('Erro ao salvar os lançamentos. Tente novamente.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

function cancelarImportacao() {
  estadoImport.classificados = [];
  estadoImport.indexAtual    = 0;
  const secao = document.getElementById('secaoRevisao');
  if (secao) secao.style.display = 'none';
}

// ============================================================
// VER / EXCLUIR FATURA
// ============================================================

async function verLancamentosFatura(faturaId, mes) {
  mostrarLoading(true);
  try {
    const snap = await colecaoUsuario('lancamentos')
      .where('fatura_id', '==', faturaId)
      .orderBy('data', 'asc')
      .get();

    const corpo = document.getElementById('verFaturaCorpo');
    if (!corpo) return;

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
    'Excluir esta fatura e todos os seus lançamentos?',
    async () => {
      mostrarLoading(true);
      try {
        const userRef = db.collection('usuarios').doc(auth.currentUser.uid);
        const batch   = db.batch();
        const snap    = await colecaoUsuario('lancamentos')
          .where('fatura_id', '==', faturaId).get();
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
