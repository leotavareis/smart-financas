# 🚀 Guia de Configuração e Deploy

Siga este passo a passo para colocar seu sistema de Finanças Pessoais no ar utilizando o Firebase.

## 1. Criar Projeto no Firebase Console
1. Acesse o [Firebase Console](https://console.firebase.google.com/).
2. Clique em **"Adicionar projeto"** e dê um nome (ex: `Financas-Smart`).
3. Siga os passos e clique em **"Criar projeto"**.

## 2. Ativar Authentication
1. No menu lateral, acesse **Build > Authentication**.
2. Clique em **"Get Started"**.
3. Na aba **"Sign-in method"**, selecione **Google** e clique em **"Ativar"**.
4. Configure o e-mail de suporte e clique em **"Salvar"**.

## 3. Criar Firestore Database
1. No menu lateral, acesse **Build > Firestore Database**.
2. Clique em **"Crie um banco de dados"**.
3. Selecione **"Modo de produção"** e clique em **"Avançar"**.
4. Escolha a região mais próxima de você (ex: `southamerica-east1`) e clique em **"Ativar"**.

## 4. Configurar Web App e credenciais
1. No Dashboard do projeto, clique no ícone **Web (</>)**.
2. Registre o app (ex: `SmartFin Web`).
3. Copie o objeto `firebaseConfig` que aparecerá na tela.
4. Abra o arquivo `js/firebase-config.js` no seu editor e substitua os valores fictícios pelas suas credenciais reais.

```javascript
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto-id",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

## 5. Deploy com Firebase CLI
1. No seu terminal, instale o Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
2. Faça login na sua conta Google:
   ```bash
   firebase login
   ```
3. Na pasta raiz do projeto (`c:\Finanças Pessoais`), inicialize o Firebase:
   ```bash
   firebase init
   ```
   - Escolha **Firestore** e **Hosting**.
   - Selecione **"Use an existing project"** e escolha o projeto criado no passo 1.
   - Para Firestore rules e indexes, aperte **Enter** (já criamos os arquivos).
   - Para o diretório public, digite: `.` (ponto final, para usar a raiz).
   - Configurar como single-page app? Digite `y`.
   - Sobrescrever `index.html`? Digite `N`.
4. Envie tudo para a nuvem:
   ```bash
   firebase deploy
   ```

## 6. Configurar Regras e Índices (Manual ou CLI)
Como já criamos `firestore.rules` e `firestore.indexes.json`, o comando `firebase deploy` já enviará as regras e os índices automaticamente. Caso queira conferir, eles estão nas abas correspondentes no Console do Firebase.

---
**Pronto!** O link do seu app aparecerá no terminal após o deploy (geralmente `https://seu-projeto-id.web.app`).
