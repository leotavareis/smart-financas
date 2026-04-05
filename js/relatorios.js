// ============================================================
// RELATORIOS.JS — Relatório de cobrança por pessoa
// Depende de: app.js, auth.js
// ============================================================

// Cache do relatório atual (usado ao copiar para WhatsApp)
let dadosRelatorio = {};

// ============================================================
// INICIALIZAÇÃO
// ============================================================

async function inicializarPaginaRelatorios() {
  // inicializarSeletorMes apenas registra listeners — não dispara callback aqui
  inicializarSeletorMes(mes => gerarRelatorio(mes));
  await gerarRelatorio(mesSelecionado);
}

// ============================================================
// GERAÇÃO DO RELATÓRIO
// ============================================================

/**
 * Busca todos os lançamentos do mês com dono != "eu" e organiza por pessoa.
 * @param {string} mes  YYYY-MM
 */
async function gerarRelatorio(mes) {
  mostrarLoading(true);
  const container = document.getElementById('relatorioContainer');
  if (!container) { mostrarLoading(false); return; }

  try {
    const [snapLanc, snapPessoas, snapCartoes] = await Promise.all([
      colecaoUsuario('lancamentos').where('mes', '==', mes).get(),
      colecaoUsuario('pessoas').get(),
      colecaoUsuario('cartoes').get()
    ]);

    const pessoas = Object.fromEntries(
      snapPessoas.docs.map(d => [d.id, { id: d.id, ...d.data() }])
    );
    const cartoes = Object.fromEntries(
      snapCartoes.docs.map(d => [d.id, { id: d.id, ...d.data() }])
    );

    dadosRelatorio = {};

    snapLanc.forEach(doc => {
      const l = doc.data();
      if (!l.dono?.length) return;

      l.dono.forEach(d => {
        if (d.pessoa_id === 'eu') return; // Lançamentos próprios não aparecem no relatório

        const pid = d.pessoa_id;
        if (!dadosRelatorio[pid]) {
          const p = pessoas[pid] || { nome: 'Pessoa desconhecida', cor: '#64748b' };
          dadosRelatorio[pid] = { nome: p.nome, cor: p.cor, cartoes: {}, total: 0 };
        }

        const cartaoNome = cartoes[l.cartao_id]?.nome || 'Cartão';
        const cartaoCor  = cartoes[l.cartao_id]?.cor  || '#3b82f6';

        if (!dadosRelatorio[pid].cartoes[cartaoNome]) {
          dadosRelatorio[pid].cartoes[cartaoNome] = { cor: cartaoCor, itens: [] };
        }

        const valorProporcional = l.valor * (d.percentual / 100);
        const parcelaStr        = l.total_parcelas > 1
          ? ` (${l.parcela_atual}/${l.total_parcelas})`
          : '';

        dadosRelatorio[pid].cartoes[cartaoNome].itens.push({
          data          : l.data,
          descricao     : l.descricao + parcelaStr,
          valorOriginal : l.valor,
          percentual    : d.percentual,
          valor         : valorProporcional
        });

        dadosRelatorio[pid].total += valorProporcional;
      });
    });

    renderizarRelatorio(mes);

  } catch (err) {
    console.error('[Relatórios] Erro ao gerar:', err);
    mostrarToast('Erro ao gerar relatório.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

// ============================================================
// RENDERIZAÇÃO
// ============================================================

function renderizarRelatorio(mes) {
  const container = document.getElementById('relatorioContainer');
  const pessoas   = Object.entries(dadosRelatorio);

  if (!pessoas.length) {
    container.innerHTML = `
      <div class="empty-state-grande">
        <p style="font-size:1.1rem;font-weight:600">Nenhuma cobrança em ${formatarMes(mes)}</p>
        <p class="text-muted">Importe faturas e classifique lançamentos por pessoa para ver o relatório aqui.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  pessoas.forEach(([pid, pessoa]) => {
    const card = document.createElement('div');
    card.className = 'relatorio-pessoa-card';

    card.innerHTML = `
      <div class="rp-header" style="border-left-color:${pessoa.cor}">
        <div class="rp-info">
          <span class="rp-nome">${pessoa.nome}</span>
        </div>
        <div class="rp-total-header">
          <span class="text-muted small">Total a cobrar</span>
          <span class="rp-total-valor">${formatarMoeda(pessoa.total)}</span>
        </div>
        <button class="btn btn-outline btn-sm" onclick="copiarWhatsApp('${pid}','${mes}')">
          📋 Copiar para WhatsApp
        </button>
      </div>
      <div class="rp-body" id="rp-body-${pid}"></div>`;

    container.appendChild(card);

    const body = document.getElementById(`rp-body-${pid}`);
    Object.entries(pessoa.cartoes).forEach(([nomeCartao, grupo]) => {
      const secao = document.createElement('div');
      secao.className = 'rp-cartao-secao';

      const subtotal = grupo.itens.reduce((s, i) => s + i.valor, 0);

      secao.innerHTML = `
        <div class="rp-cartao-titulo flex-between">
          <span class="badge" style="background:${grupo.cor}">${nomeCartao}</span>
          <span class="mono small text-muted">${formatarMoeda(subtotal)}</span>
        </div>
        <table class="table table-sm">
          <tbody>
            ${grupo.itens.map(item => {
              const dt  = item.data ? item.data.slice(5).split('-').reverse().join('/') : '—';
              const pct = item.percentual < 100 ? ` <span class="text-muted">(${item.percentual}%)</span>` : '';
              return `<tr>
                <td class="mono text-muted" style="width:60px;white-space:nowrap">${dt}</td>
                <td>${item.descricao}${pct}</td>
                <td class="mono valor-negativo" style="text-align:right;white-space:nowrap">
                  ${formatarMoeda(item.valor)}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;

      body.appendChild(secao);
    });
  });
}

// ============================================================
// COPIAR PARA WHATSAPP
// ============================================================

/**
 * Formata o resumo em texto para WhatsApp e tenta copiar via API clipboard.
 * Fallback: abre modal com textarea para cópia manual.
 */
function copiarWhatsApp(pessoaId, mes) {
  const pessoa = dadosRelatorio[pessoaId];
  if (!pessoa) return;

  const nomeMes = formatarMes(mes);
  let texto = `💳 Fatura ${nomeMes} — Gastos de ${pessoa.nome}\n\n`;

  Object.entries(pessoa.cartoes).forEach(([nomeCartao, grupo]) => {
    texto += `${nomeCartao}:\n`;
    grupo.itens.forEach(item => {
      const dt    = item.data ? item.data.slice(5).split('-').reverse().join('/') : '—';
      const desc  = item.descricao + (item.percentual < 100 ? ` (${item.percentual}%)` : '');
      const valor = formatarMoeda(item.valor);

      // Alinhamento com pontos (máx 38 chars para desc)
      const MAX   = 38;
      const short = desc.length > MAX ? desc.substring(0, MAX - 1) + '…' : desc;
      const pontos = '.'.repeat(Math.max(2, MAX - short.length + 2));

      texto += `• ${dt} ${short}${pontos} ${valor}\n`;
    });
    texto += '\n';
  });

  texto += `TOTAL: ${formatarMoeda(pessoa.total)}`;

  navigator.clipboard.writeText(texto)
    .then(() => mostrarToast('Resumo copiado! Cole no WhatsApp.', 'sucesso'))
    .catch(() => {
      // Fallback para navegadores sem suporte ao clipboard
      const ta = document.getElementById('textoWhatsApp');
      if (ta) {
        ta.value = texto;
        abrirModal('modalTextoWhatsApp');
      }
    });
}

/** Seleciona e copia o texto do textarea de fallback */
function copiarTextoModal() {
  const ta = document.getElementById('textoWhatsApp');
  if (!ta) return;
  ta.select();
  ta.setSelectionRange(0, 99999); // Mobile
  document.execCommand('copy');
  mostrarToast('Texto copiado!', 'sucesso');
  fecharModal('modalTextoWhatsApp');
}
