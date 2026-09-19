/* Configuração pública do app. Este arquivo vai para o navegador de quem
   abrir o site — NUNCA coloque chave de API aqui.

   apiUrl    Endereço da API. Na Vercel, front e API dividem o domínio,
             então "/api" basta. Vazio = os dados ficam só no navegador.
   chave     Opcional, espelha CHAVE_APP do servidor. Não é autenticação:
             qualquer visitante lê este valor no código-fonte. Serve apenas
             para barrar varredura automática. Veja o README.
   agenteUrl Só se o agente estiver em outro endereço que não apiUrl + /agente. */
window.CAIXA_CONFIG = {
  apiUrl: "/api",
  chave: "",
  agenteUrl: ""
};
