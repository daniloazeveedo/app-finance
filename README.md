# Caixa

Controle financeiro pessoal: contas com vencimento, metas de compra, lançamentos do mês
e uma tela de análise. Celular e desktop têm layouts diferentes — no celular é um app de
uma coluna com navegação inferior, no desktop um dashboard com barra lateral.

Sem framework, sem build. HTML, CSS e JavaScript puro.

## Rodando

Abra `index.html` no navegador, ou sirva a pasta:

```bash
python3 -m http.server 8000
```

## Publicando no GitHub Pages

1. Crie o repositório e suba os arquivos:

```bash
git init
git add .
git commit -m "Primeira versão"
git branch -M main
git remote add origin git@github.com:SEU_USUARIO/caixa.git
git push -u origin main
```

2. No repositório: **Settings → Pages → Source: Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. O site sai em `https://SEU_USUARIO.github.io/caixa/`.

## Onde ficam os dados

No `localStorage` do navegador, sob a chave `caixa.dados`. Não existe servidor: os dados
nunca saem do aparelho, e cada navegador tem os seus. Limpar os dados do site apaga tudo.

**Não versione dados financeiros.** O repositório sobe vazio de propósito. Se um dia você
exportar seus lançamentos para um arquivo, deixe esse arquivo fora do Git.

## O agente

A tela do agente responde perguntas sobre o seu mês usando os dados do app. Ela precisa de
um modelo de linguagem, e a chave da API **não pode** ficar no navegador — qualquer visitante
do site conseguiria ler e usar a sua chave.

O caminho é um backend mínimo que guarde a chave e repasse a pergunta. Uma função da
Cloudflare, da Vercel ou da Netlify resolve. Ela precisa:

- aceitar `POST` com `{ "messages": [ { "role": "user", "content": "..." } ] }`
- chamar a API da Anthropic usando a chave guardada como variável de ambiente
- responder `{ "text": "resposta do modelo" }`
- liberar CORS para o domínio do seu Pages

Com a função no ar, preencha `assets/js/config.js`:

```js
window.CAIXA_CONFIG = { agenteUrl: "https://sua-funcao.workers.dev/agente" };
```

Enquanto `agenteUrl` estiver vazio, o app esconde o formulário do agente e o resto continua
funcionando normalmente.

## Estrutura

```
index.html
assets/
  css/estilo.css
  js/config.js          configuração pública (sem segredos)
  js/armazenamento.js   banco local sobre o localStorage
  js/app.js             telas, cálculos e gráficos
  img/estatua.png       arte da tela de abertura
```

## Créditos

A identidade visual — paleta, formas e a tela de abertura — vem do arquivo
*Financial Mobile iOS App* da Nickelfox, publicado na comunidade do Figma.
Confira a licença do arquivo original antes de usar em algo comercial.
