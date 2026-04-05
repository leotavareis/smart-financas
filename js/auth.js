// ============================================================
// MÃ“DULO DE AUTENTICAÃ‡ÃƒO
// Login com Google, inicializaÃ§Ã£o do usuÃ¡rio novo e logout
// ============================================================

/**
 * Observa o estado de autenticaÃ§Ã£o.
 * Em pÃ¡ginas protegidas, redireciona para login se nÃ£o estiver autenticado.
 * @param {Function} callback - Executado com o objeto user quando autenticado
 */
function verificarAuth(callback) {
  auth.onAuthStateChanged(async user => {
    const pagina      = window.location.pathname.split('/').pop() || 'index.html';
    const ehPublica   = pagina === 'index.html' || pagina === '';

    if (user) {
      // Garante que os dados base do usuÃ¡rio existam (idempotente â€” sÃ³ cria se faltar)
      await inicializarUsuario(user);
      if (typeof callback === 'function') callback(user);
    } else {
      if (!ehPublica) window.location.href = 'index.html';
    }
  });
}

/**
 * Abre o popup do Google e faz o login.
 * ApÃ³s o login bem-sucedido, redireciona para o dashboard.
 */
async function loginComGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    mostrarLoading(true);
    const resultado = await auth.signInWithPopup(provider);
    await inicializarUsuario(resultado.user);
    window.location.href = 'dashboard.html';
  } catch (erro) {
    console.error('[Auth] Erro no login:', erro);
    mostrarToast('Erro ao entrar com Google. Tente novamente.', 'erro');
    mostrarLoading(false);
  }
}

/**
 * Cria o documento raiz do usuÃ¡rio no Firestore e prÃ©-cadastra
 * os 3 cartÃµes padrÃ£o + 3 pessoas em branco (apenas na primeira vez).
 * @param {firebase.User} user
 */
async function inicializarUsuario(user) {
  const userRef = db.collection('usuarios').doc(user.uid);
  const snap    = await userRef.get();

  // 1. Criar documento do usuÃ¡rio se nÃ£o existir
  if (!snap.exists) {
    await userRef.set({
      nome      : user.displayName || '',
      email     : user.email      || '',
      foto      : user.photoURL   || '',
      criado_em : firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  const ts = firebase.firestore.FieldValue.serverTimestamp();

  // 2. Verificar e criar cartÃµes padrÃ£o se a coleÃ§Ã£o estiver vazia
  const snapCartoes = await userRef.collection('cartoes').limit(1).get();
  if (snapCartoes.empty) {
    const batch = db.batch();
    const cartoesDefault = [
      { nome: 'Banco do Brasil', cor: '#f59e0b', dia_fechamento: 3,  dia_vencimento: 10, limite: 0 },
      { nome: 'Nubank',          cor: '#8b5cf6', dia_fechamento: 19, dia_vencimento: 26, limite: 0 },
      { nome: 'C6',              cor: '#06b6d4', dia_fechamento: 5,  dia_vencimento: 12, limite: 0 }
    ];
    cartoesDefault.forEach(c => {
      batch.set(userRef.collection('cartoes').doc(), { ...c, criado_em: ts });
    });
    await batch.commit();
  }

  // 3. Verificar e criar pessoas padrÃ£o se a coleÃ§Ã£o estiver vazia
  const snapPessoas = await userRef.collection('pessoas').limit(1).get();
  if (snapPessoas.empty) {
    const batch = db.batch();
    const coresPessoas = ['#3b82f6', '#22c55e', '#f472b6'];
    for (let i = 0; i < 3; i++) {
      batch.set(userRef.collection('pessoas').doc(), {
        nome: '', cor: coresPessoas[i], criado_em: ts
      });
    }
    await batch.commit();
  }
}

/**
 * Encerra a sessÃ£o e redireciona para a tela de login.
 */
async function logout() {
  try {
    await auth.signOut();
    window.location.href = 'index.html';
  } catch (erro) {
    console.error('[Auth] Erro no logout:', erro);
    mostrarToast('Erro ao sair. Tente novamente.', 'erro');
  }
}

// ============================================================
// HELPERS DE DADOS â€” utilizados por todos os mÃ³dulos
// ============================================================

/**
 * Retorna a referÃªncia de uma subcoleÃ§Ã£o do usuÃ¡rio autenticado.
 * @param {string} colecao
 * @returns {firebase.firestore.CollectionReference}
 */
function colecaoUsuario(colecao) {
  const user = auth.currentUser;
  if (!user) throw new Error('UsuÃ¡rio nÃ£o autenticado');
  return db.collection('usuarios').doc(user.uid).collection(colecao);
}

/**
 * Retorna o mÃªs atual no formato YYYY-MM.
 */
function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Converte "YYYY-MM" em "Janeiro 2026".
 * @param {string} mesStr
 */
function formatarMes(mesStr) {
  if (!mesStr) return '';
  const [ano, mes] = mesStr.split('-');
  const nomes = [
    'Janeiro','Fevereiro','MarÃ§o','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  return `${nomes[parseInt(mes, 10) - 1]} ${ano}`;
}

/**
 * AvanÃ§a ou recua um mÃªs a partir de uma string YYYY-MM.
 * @param {string} mesStr
 * @param {number} delta  +1 ou -1
 */
function deslocarMes(mesStr, delta) {
  const [ano, mes] = mesStr.split('-').map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
