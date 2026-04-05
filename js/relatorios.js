// ============================================================
// RELATORIOS.JS — Relatório de cobrança por pessoa
// Depende de: app.js, auth.js
// ============================================================

let dadosRelatorio = {}; // { pessoaId: { nome, cor, cartoes: { nomeCartao: [lancamentos] } } }

async function inicializarPaginaRelatorios() {
  mostrarLoading(true);
  try {
    inicializarSeletorMes(mes => gerarRelatorio(mes));
    await gerarRelatorio(mesSelecionado);
  } catch (err) {
    console.error('[Relatórios] Erro ao inicializar:', err);
    mostrarToast('Erro ao carregar relatório.', 'erro');
  } finally {
    mostrarLoading(false);
  }
}

// ============================================================
// GERAÇÃO DO RELATÓRIO
// ============================================================

/**
 * Busca todos os lançamentos do mês e organiza por pessoa.
 * @param {string} mes  YYYY-MM
 */
async function gerarRelatorio(mes) {
  mostrarLoading(true);
  const container = document.getElementById('relatorioContainer');
  if (!container) return;

  try {
    // Carregar dados em paralelo
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

    // Organizar lançamentos por pessoa
    dadosRelatorio = {};

    snapLanc.forEach(doc => {
      const l = doc.data();
      if (!l.dono || !l.dono.length) return;

      l.dono.forEach(d => {
        const pid = d.pessoa_id;
        if (pid === 'eu') return; // Pular lançamentos próprios no relatório de cobrança

        if (!dadosRelatorio[pid]) {
          const p = pessoas[pid] || { nome: 'Pessoa desconhecida', cor: '#999' };
          dadosRelatorio[pid] = { nome: p.nome, cor: p.cor, cartoes: {}, total: 0 };
        }

        const cartaoNome = cartoes[l.cartao_id]?.nome || 'Cartão';
        const cartaoCor  = cartoes[l.cartao_id]?.cor  || '#3b82f6';

        if (!dadosRelatorio[pid].cartoes[cartaoNome]) {
          dadosRelatorio[pid].cartoes[cartaoNome] = { cor: cartaoCor, itens: [] };
        }

        // Calcular valor proporcional
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
        <p>Nenhum lançamento com divisão de gastos em <strong>${formatarMes(mes)}</strong>.</p>
        <p class="text-muted">Importe faturas e classifique lançamentos por pessoa para ver o relatório.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  pessoas.forEach(([pid, pessoa]) => {
    const card = document.createElement('div');
    card.className = 'relatorio-pessoa-card';
    card.innerHTML = `
      <div class="rp-header" style="border-left-color: ${pessoa.cor}">
        <div class="rp-info">
          <span class="rp-nome">${pessoa.nome}</span>
          <span class="rp-mes text-muted">${formatarMes(mes)}</span>
        </div>
        <div class="rp-total-header">
          <span class="text-muted small">Total</span>
          <span class="mono rp-total-valor">${formatarMoeda(pessoa.total)}</span>
        </div>
        <button class="btn btn-sm btn-outline" onclick="copiarWhatsApp('${pid}','${mes}')">
          📋 Copiar para WhatsApp
        </button>
      </div>
      <div class="rp-body" id="rp-body-${pid}"></div>
    `;
    container.appendChild(card);

    const body = document.getElementById(`rp-body-${pid}`);
    Object.entries(pessoa.cartoes).forEach(([nomeCartao, grupo]) => {
      const secaoCartao = document.createElement('div');
      secaoCartao.className = 'rp-cartao-secao';
      secaoCartao.innerHTML = `
        <div class="rp-cartao-titulo">
          <span class="badge" style="background:${grupo.cor}">${nomeCartao}</span>
        </div>
        <table class="table table-sm">
          <tbody>${grupo.itens.map(item => `
            <tr>
              <td class="mono text-muted" style="width:70px">${item.data?.slice(5).split('-').reverse().join('/') || '—'}</td>
              <td>${item.descricao}${item.percentual < 100 ? ` <span class="text-muted">(${item.percentual}%)</span>` : ''}</td>
              <td class="mono valor-negativo" style="text-align:right">${formatarMoeda(item.valor)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      `;
      body.appendChild(secaoCartao);
    });
  });
}

// ============================================================
// COPIAR PARA WHATSAPP
// ============================================================

/**
 * Formata o resumo da pessoa em texto formatado para WhatsApp.
 * @param {string} pessoaId
 * @param {string} mes
 */
function copiarWhatsApp(pessoaId, mes) {
  const pessoa = dadosRelatorio[pessoaId];
  if (!pessoa) return;

  const nomeMes = formatarMes(mes);
  let texto = `💳 Fatura ${nomeMes} — Gastos de ${pessoa.nome}\n\n`;

  Object.entries(pessoa.cartoes).forEach(([nomeCartao, grupo]) => {
    texto += `${nomeCartao}:\n`;
    grupo.itens.forEach(item => {
      const data  = item.data?.slice(5).split('-').reverse().join('/') || '—';
      const desc  = item.descricao + (item.percentual < 100 ? ` (${item.percentual}%)` : '');
      const valor = formatarMoeda(item.valor);
      // Alinhamento com pontos
      const maxDesc = 35;
      const descPad = desc.length > maxDesc ? desc.substring(0, maxDesc) : desc;
      const pontos  = '.'.repeat(Math.max(2, maxDesc - descPad.length + 2));
      texto += `• ${data} ${descPad}${pontos} ${valor}\n`;
    });
    texto += '\n';
  });

  texto += `TOTAL: ${formatarMoeda(pessoa.total)}`;

  navigator.clipboard.writeText(texto)
    .then(() => mostrarToast('Resumo copiado! Cole no WhatsApp.', 'sucesso'))
    .catch(() => {
      // Fallback: mostrar em modal
      const modal = document.getElementById('modalTextoWhatsApp');
      if (modal) {
        document.getElementById('textoWhatsApp').value = texto;
        abrirModal('modalTextoWhatsApp');
      } else {
        prompt('Copie o texto abaixo:', texto);
      }
    });
}

/**
 * Copia o texto do textarea do modal de fallback.
 */
function copiarTextoModal() {
  const ta = document.getElementById('textoWhatsApp');
  ta?.select();
  document.execCommand('copy');
  mostrarToast('Texto copiado!', 'sucesso');
  fecharModal('modalTextoWhatsApp');
}
