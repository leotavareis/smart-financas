const fs = require('fs');
const path = require('path');

const map = {
  'ðŸ  ': '🏠',
  'âš¡': '⚡',
  'ðŸ ¿': '🍿',
  'ðŸ ¥': '🏥',
  'ðŸŽ“': '🎓',
  'âš™ï¸ ': '⚙️',
  'âœŽ': '✏️',
  'âœ•': '✕',
  'â ³': '⏳',
  'ðŸ’³': '💳',
  'MÃªs': 'Mês',
  'HistÃ³rico': 'Histórico',
  'ðŸ\u008f Dashboard': '🏠 Dashboard',
  'ðŸ“ˆ Receitas': '📈 Receitas',
  'ðŸ“‰ Despesas fixas': '📉 Despesas fixas',
  'ðŸ’³ Cartões': '💳 Cartões',
  'ðŸ“„ Importar Faturas': '📄 Importar Faturas',
  'â³ Parcelamentos': '⏳ Parcelamentos',
  'ðŸ“Š Relatórios/Cobrança': '📊 Relatórios/Cobrança',
  'ðŸ‘¥ Pessoas': '👥 Pessoas'
};

const map2 = {
  'ðŸ Dashboard': '🏠 Dashboard',
  'ðŸ’³ CartÃµes': '💳 Cartões',
  'ðŸ’³': '💳',
  'âœŽ Editar': '✏️ Editar',
  'ðŸ‘¥': '👥',
  'ðŸ“Š': '📊',
  'â³': '⏳',
  'ðŸ“„': '📄',
  'ðŸ“‰': '📉',
  'ðŸ“ˆ': '📈',
  'MÃªs': 'Mês'
};

const files = [
  'index.html',
  'dashboard.html',
  'receitas.html',
  'despesas.html',
  'cartoes.html',
  'faturas.html',
  'parcelamentos.html',
  'relatorios.html',
  'pessoas.html',
  'css/style.css',
  'js/app.js',
  'js/auth.js',
  'js/pdf-import.js',
  'js/parcelas.js',
  'js/relatorios.js'
];

for (const file of files) {
  try {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) continue;
    
    let content = fs.readFileSync(filePath, 'utf8');

    for (const [bad, good] of Object.entries(map)) {
      content = content.split(bad).join(good);
    }
    for (const [bad, good] of Object.entries(map2)) {
      content = content.split(bad).join(good);
    }
    
    // Add BOM if missing
    if (!content.startsWith('\uFEFF')) {
      content = '\uFEFF' + content;
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    process.stdout.write(`Fixed ${file}\n`);
  } catch (err) {
    console.error(`Error processing ${file}:`, err);
  }
}
process.exit(0);
