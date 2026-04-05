// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// IMPORTANTE: Substitua os valores abaixo pelas suas credenciais
// obtidas no Firebase Console > Configurações do projeto
// ============================================================

const firebaseConfig = {
  apiKey            : "AIzaSyDEjmjvJLZ7loGheBliCkeek8sRMVtyi54",
  authDomain        : "finanll.firebaseapp.com",
  projectId         : "finanll",
  storageBucket     : "finanll.firebasestorage.app",
  messagingSenderId : "93019360708",
  appId             : "1:93019360708:web:bc656ea44a12771ab9e891",
  measurementId     : "G-382BTQ3Z26"
};

// Inicializar o app Firebase
firebase.initializeApp(firebaseConfig);

// Instâncias globais utilizadas em todos os módulos
const auth      = firebase.auth();
const db        = firebase.firestore();
const analytics = firebase.analytics();

// Habilitar persistência offline — melhora UX no celular com rede instável
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('[Firestore] Persistência desabilitada: múltiplas abas abertas.');
  } else if (err.code === 'unimplemented') {
    console.warn('[Firestore] Persistência não suportada neste navegador.');
  }
});
