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
  auth/cadastro.ts             POST — cria conta
  auth/entrar.ts               POST — abre sessão
  auth/sair.ts                 POST — encerra sessão
  auth/eu.ts                   GET  — quem está logado
lib/
  db.ts                        conexão com o Neon
  auth.ts                      dono dos dados da requisição
  senha.ts                     hash de senha com scrypt
  sessao.ts                    token de sessão e cookie
  validacao.ts                 validação do corpo das requisições
  http.ts                      CORS, métodos, erros
  tipos.ts                     contratos compartilhados
sql/001_inicial.sql            tabelas de dados
sql/002_usuarios.sql           usuários e sessões
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

Crie um projeto em neon.tech, abra o SQL Editor e rode, nesta ordem,
`sql/001_inicial.sql` e depois `sql/002_usuarios.sql`. Guarde a string de conexão.

O `002` apaga as linhas de lançamentos, contas e metas que existirem, porque elas foram
criadas antes de haver usuários e não pertencem a ninguém. Rode enquanto os dados forem
de teste.

### 2. Projeto na Vercel

```bash
npm i -g vercel
vercel link
vercel env add DATABASE_URL      # cole a string do Neon
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
| POST | `/api/auth/cadastro` | `{ nome, email, senha }` — cria a conta e já entra |
| POST | `/api/auth/entrar` | `{ email, senha }` |
| POST | `/api/auth/sair` | encerra a sessão |
| GET | `/api/auth/eu` | quem está logado |
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

## Contas e segurança

Cada pessoa cria a própria conta e enxerga só os próprios dados. Como funciona:

- Senha guardada com **scrypt**, do próprio Node — sal aleatório por senha, comparação em
  tempo constante. A senha em texto puro nunca é gravada nem registrada em log.
- Sessão é um **token opaco** de 32 bytes aleatórios, entregue em cookie `HttpOnly`,
  `Secure`, `SameSite=Lax`, com 30 dias. JavaScript de página não lê esse cookie, o que
  fecha a porta para roubo de sessão por XSS.
- No banco fica só o **hash** do token. Se o banco vazar, ninguém remonta o cookie de
  ninguém. Apagar a linha revoga a sessão na hora.
- `usuario_id` é chave estrangeira para `usuarios` e entra no `WHERE` de toda leitura,
  edição e remoção. Não existe caminho para um usuário tocar no dado de outro.
- Login errado responde sempre a mesma mensagem, seja e-mail inexistente ou senha errada,
  para não revelar quais e-mails têm conta.
- Todo corpo de requisição passa por `lib/validacao.ts`. Consultas são parametrizadas pelo
  driver do Neon — não há concatenação de SQL.
- A chave da Anthropic fica no servidor, e o erro da Anthropic não é repassado ao cliente.

Limites que continuam em aberto, para você saber:

- **Sem limite de tentativas de login.** Alguém pode testar senhas em sequência. O scrypt
  deixa cada tentativa lenta, o que ajuda, mas não substitui um bloqueio por tentativas.
- **Sem recuperação de senha.** Esqueceu, se resolve trocando o `senha_hash` no banco.
- **Sem confirmação de e-mail.** Qualquer endereço é aceito como está.

Com login funcionando, a Deployment Protection da Vercel deixa de ser necessária — pode
desligar para usar o app no celular sem estar logado na conta Vercel.

## Android e iOS

O código é web, então o caminho mais curto é um **PWA**: `manifest.json` e service worker,
sem reescrever nada. Instala na tela inicial e funciona offline.

Para as lojas, **Capacitor** empacota o mesmo site num app nativo, reaproveitando quase todo
o código. React Native só se aparecer necessidade de API nativa ou desempenho que a web não
entregue — ali a interface seria reescrita do zero, já que não existe DOM nem CSS.

## Dados

Com `apiUrl` vazio, tudo fica no `localStorage`, sob a chave `caixa.dados`, e a tela de
login nem aparece — é o modo de teste local. Com `apiUrl` preenchido, os dados vão para o
Postgres, amarrados à conta de quem estiver logado.

**Não versione dados financeiros.** O repositório sobe vazio de propósito. Se exportar seus
lançamentos algum dia, deixe o arquivo fora do Git.

## Créditos

A identidade visual — paleta, formas e a tela de abertura — vem do arquivo
*Financial Mobile iOS App* da Nickelfox, publicado na comunidade do Figma. Confira a licença
do arquivo original antes de usar em algo comercial.
