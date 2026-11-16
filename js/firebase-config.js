// Configuração do Firebase.
// 1. Crie um projeto em https://console.firebase.google.com (plano Spark, gratuito).
// 2. Adicione um "App da Web" e copie os valores abaixo.
// 3. Ative Authentication > E-mail/senha e crie o Realtime Database.
//
// Enquanto apiKey estiver vazio, o sistema funciona em MODO LOCAL
// (dados salvos apenas neste navegador), útil para testar.
// Estes valores não são secretos: a proteção dos dados é feita pelas
// regras em database.rules.json.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
