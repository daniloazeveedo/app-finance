# Sobra — finanças pessoais

App de finanças pessoais que funciona como aplicativo no iPhone e no Android
(PWA): ícone na tela inicial, tela cheia e uso sem internet.

## Publicar no GitHub Pages

1. Crie um repositório **público** chamado `sobra` em github.com.
2. Na página do repositório, clique em **Add file → Upload files**, arraste
   **todo o conteúdo desta pasta** (inclusive a pasta `icons` e o arquivo
   `.nojekyll`) e clique em **Commit changes**.
3. Vá em **Settings → Pages**. Em *Source*, escolha **Deploy from a branch**,
   branch **main**, pasta **/ (root)**, e salve.
4. Em um ou dois minutos o app fica em `https://SEU-USUARIO.github.io/sobra/`.

## Instalar no iPhone

1. Abra o endereço acima no **Safari**.
2. Toque em **Compartilhar → Adicionar à Tela de Início** → **Adicionar**.
3. Abra pelo ícone amarelo. Ele roda em tela cheia, como um app.

## Trazer seus dados

Na versão instalada, os dados ficam **guardados no próprio celular**.
Para trazer o que você já tinha: toque no seu avatar → **Seus dados neste
aparelho → Importar backup** e escolha o arquivo `caixa-backup-....json` (o nome antigo continua valendo).
Use **Exportar backup** de vez em quando para ter uma cópia.

> ⚠️ Nunca envie arquivos de backup para este repositório. Ele é público.
> O `.gitignore` já bloqueia esses arquivos se você usar `git` pelo terminal.

## O que funciona nesta versão

- Lançamentos, fluxo de caixa, contas a pagar, contas bancárias, metas,
  limites de gastos, categorias, relatórios, alertas e configurações.
- Aba **news**: lê as notícias do arquivo `noticias.json` deste repositório.
  Puxe a tela ou toque em atualizar para buscar a versão mais nova do arquivo.
  Para usar um servidor próprio, defina `window.SOBRA_NOTICIAS_URL` no `index.html`.

## O que ainda não funciona (fase 2)

Estes recursos dependiam do Claude e precisam de um servidor próprio:

- **Agente financeiro, leitura de recibo e categorização por IA** —
  exigem a API do Claude com a chave guardada em um servidor.
- **Puxar para atualizar as notícias** — será um robô do GitHub Actions
  reescrevendo o `noticias.json` sozinho.
- **Sincronizar entre aparelhos e login** — exige um banco na nuvem
  (por exemplo, Supabase).

## Arquivos

| Arquivo | Para que serve |
| --- | --- |
| `index.html` | O app inteiro |
| `local-runtime.js` | Motor local: guarda os dados no aparelho |
| `sw.js` | Faz o app abrir sem internet e se atualizar sozinho |
| `manifest.webmanifest` | Nome, cores e ícones do app instalado |
| `icons/` | Ícones do app |
| `noticias.json` | Notícias exibidas na aba news |
