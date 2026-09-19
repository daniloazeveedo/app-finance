# Caixa

Controle financeiro pessoal: contas com vencimento, metas de compra, lançamentos do mês,
análise de gastos e um agente que responde perguntas sobre o próprio orçamento.

Celular e desktop têm layouts diferentes — no celular é um app de uma coluna com navegação
inferior; acima de 1100px vira um dashboard com barra lateral. Tema claro e escuro seguem o
sistema.

## Arquitetura

```
Navegador / app instalado
        │  HTTPS
        ▼
public/            front-end estático (HTML, CSS, JS puro — sem build)
        │  fetch /api/...
        ▼
api/               funções serverless da Vercel (TypeScript)
        │  SQL
        ▼
Neon               Postgres serverless
```

Front e API vivem no mesmo domínio da Vercel. Isso elimina CORS e deixa o caminho livre para
cookie de sessão quando o login entrar.

```
public/
  index.html
  assets/css/estilo.css
  assets/js/config.js          configuração pública (sem segredos)
  assets/js/armazenamento.js   banco no localStorage
  assets/js/api.js             banco via HTTP
  assets/js/app.js             telas, cálculos e gráficos
  assets/img/estatua.png
api/
  dados.ts                     GET  — as três coleções numa chamada
  lancamentos/index.ts         POST
  lancamentos/[id].ts          PATCH, DELETE
  compromissos/index.ts        POST
  compromissos/[id].ts         PATCH, DELETE
  metas/index.ts               POST
  metas/[id].ts                PATCH, DELETE
  agente.ts                    POST — ponte para a API da Anthropic
lib/
  db.ts                        conexão com o Neon
  auth.ts                      dono dos dados da requisição
  validacao.ts                 validação do corpo das requisições
  http.ts                      CORS, métodos, erros
  tipos.ts                     contratos compartilhados
sql/001_inicial.sql            esquema do banco
```

### A troca de banco não toca a interface

O app nunca fala com um banco específico. Ele usa uma interface — `collection().add`,
`collection().onSnapshot`, `doc().update`, `doc().delete` — e existem três implementações:

| Onde roda | Implementação | Arquivo |
|---|---|---|
| Artifact do Claude | banco da plataforma | injetado pelo runtime |
| Site sem `apiUrl` | localStorage | `armazenamento.js` |
| Site com `apiUrl` | HTTP + Postgres | `api.js` |

A escolha acontece em cerca de dez linhas no fim de `app.js`, na ordem: Claude, servidor,
navegador. Nenhuma tela, cálculo ou gráfico sabe onde os dados moram.

Como HTTP não tem eventos, `api.js` mantém um cache em memória: carrega tudo uma vez em
`GET /api/dados` e, a cada escrita confirmada pelo servidor, atualiza o cache e reemite para
os ouvintes. Para o app, é indistinguível de um banco reativo.

## Subindo

### 1. Banco no Neon

Crie um projeto em neon.tech, abra o SQL Editor e rode `sql/001_inicial.sql`.
Guarde a string de conexão.

### 2. Projeto na Vercel

```bash
npm i -g vercel
vercel link
vercel env add DATABASE_URL      # cole a string do Neon
vercel env add USUARIO_PADRAO    # qualquer texto estável, ex: "danilo"
vercel env add ANTHROPIC_API_KEY # opcional, só para o agente
vercel deploy --prod
```

A Vercel serve `public/` como site estático e transforma cada arquivo de `api/` em função,
sem configuração extra. Pela integração Vercel + Neon, a `DATABASE_URL` é injetada sozinha.

Rodando local: `vercel dev` (site e API juntos). Sem backend,
`python3 -m http.server -d public` já abre o app com os dados no navegador.

### 3. Variáveis

Veja `.env.example`. Nenhum segredo entra em `public/` — o que está lá vai para o navegador
de qualquer visitante.

## API

Todas as rotas respondem JSON. Erro sai como `{ "erro": "..." }`.

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/dados` | lançamentos, compromissos e metas do usuário |
| POST | `/api/lancamentos` | `{ desc, valor, tipo, cat, data }` |
| PATCH | `/api/lancamentos/:id` | qualquer subconjunto dos campos acima |
| DELETE | `/api/lancamentos/:id` | remove |
| POST | `/api/compromissos` | `{ desc, valor, venc, rec }` |
| PATCH | `/api/compromissos/:id` | inclui `pago` |
| DELETE | `/api/compromissos/:id` | remove |
| POST | `/api/metas` | `{ nome, alvo, guardado }` |
| PATCH | `/api/metas/:id` | idem |
| DELETE | `/api/metas/:id` | remove |
| POST | `/api/agente` | `{ messages: [...] }` → `{ text }` |

Códigos: 400 dado inválido, 401 não autorizado, 404 inexistente, 405 método errado,
429 excesso de chamadas ao agente, 5xx falha do servidor.

## Segurança

O que já está feito:

- Nenhuma credencial no código; tudo em variável de ambiente.
- Todo corpo de requisição passa por `lib/validacao.ts` antes de chegar ao banco. Valor
  precisa ser número positivo, data precisa ser `AAAA-MM-DD`, tipo e recorrência precisam
  estar na lista de valores aceitos.
- Consultas parametrizadas pelo driver do Neon — não há concatenação de SQL.
- `usuario_id` entra no `WHERE` de toda leitura, edição e remoção.
- A chave da Anthropic fica no servidor. O corpo de erro da Anthropic não é repassado ao
  cliente, para não vazar detalhes da conta.

**O que ainda não está resolvido, e você precisa saber:** enquanto não houver login, a API
responde a quem souber a URL. O `usuario_id` vem de variável de ambiente, não de um token —
ele organiza os dados, não protege.

O `CHAVE_APP` ajuda pouco: o valor precisa estar em `config.js`, que é público. Ele barra
varredura automática, não uma pessoa que abra o código-fonte.

Enquanto isso, duas saídas válidas:

- Deixar a **Vercel Authentication** ligada no projeto, que exige login da sua conta Vercel
  para acessar qualquer URL do deploy, API inclusive.
- Ou colocar login de verdade antes de guardar dados reais.

Quando o login entrar, muda um arquivo: `lib/auth.ts` passa a validar o token e devolver o id
do usuário autenticado. O esquema já nasceu com `usuario_id` em todas as tabelas, então não
haverá migração de dados. Para autenticação, use um serviço pronto — Clerk, Auth.js — em vez
de escrever hash de senha e sessão à mão.

## Android e iOS

O código é web, então o caminho mais curto é um **PWA**: `manifest.json` e service worker,
sem reescrever nada. Instala na tela inicial e funciona offline.

Para as lojas, **Capacitor** empacota o mesmo site num app nativo, reaproveitando quase todo
o código. React Native só se aparecer necessidade de API nativa ou desempenho que a web não
entregue — ali a interface seria reescrita do zero, já que não existe DOM nem CSS.

## Dados

Com `apiUrl` vazio, tudo fica no `localStorage`, sob a chave `caixa.dados`. Com `apiUrl`
preenchido, no Postgres.

**Não versione dados financeiros.** O repositório sobe vazio de propósito. Se exportar seus
lançamentos algum dia, deixe o arquivo fora do Git.

## Créditos

A identidade visual — paleta, formas e a tela de abertura — vem do arquivo
*Financial Mobile iOS App* da Nickelfox, publicado na comunidade do Figma. Confira a licença
do arquivo original antes de usar em algo comercial.
