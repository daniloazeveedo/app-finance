/* Configuração pública do app. Este arquivo vai para o navegador de quem
   abrir o site — NUNCA coloque chave de API aqui.

   apiUrl    Endereço da API. Na Vercel, front e API dividem o domínio,
             então "/api" basta. Vazio = os dados ficam só no navegador
             e a tela de login não aparece.
   agenteUrl Só se o agente estiver em outro endereço que não apiUrl + /agente. */
window.CAIXA_CONFIG = {
  apiUrl: "/api",
  agenteUrl: ""
};
