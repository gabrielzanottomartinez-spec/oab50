# Autos do Plano de Estudos — 50º Exame de Ordem

Site de página única (`index.html`) + duas funções serverless (`/api/state.js`)
que leem e gravam o progresso num banco de dados da própria Vercel (Vercel KV).
A partir de agora, o progresso (aulas concluídas, revisões, simulados) **fica
salvo no servidor**, não no navegador — dá pra abrir de qualquer computador ou
celular e ver o mesmo andamento.

**O que continua só no navegador:** os arquivos anexados nos registros de
simulado (PDF/DOCX) — isso fica em IndexedDB, local a cada navegador, porque
exigiria um serviço de armazenamento de arquivos à parte (Vercel Blob) para
sair de lá também. Se quiser esse passo no futuro é só pedir.

## Estrutura

```
index.html      → o app (HTML + CSS + JS + dados do cronograma)
api/state.js    → função serverless: GET lê o progresso, POST grava
package.json    → dependência (@vercel/kv) que a Vercel instala no deploy
vercel.json     → configuração mínima (URLs limpas + headers de segurança)
.env.example    → modelo da variável de ambiente necessária (senha de acesso)
```

## Passo 1 — Criar o banco (Vercel KV)

1. No [painel da Vercel](https://vercel.com), depois de importar/criar este
   projeto, vá em **Storage** (na barra do projeto) → **Create Database**.
2. Escolha **KV** (Redis) — o plano gratuito é mais que suficiente para isso.
3. Dê um nome e crie. A Vercel já conecta o banco ao projeto automaticamente
   e configura as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` sozinha
   — não precisa copiar nada manualmente.

## Passo 2 — Definir sua senha de acesso

Como o site guarda dados pessoais (seu progresso de estudo) e vai ficar
acessível por uma URL pública, ele pede uma senha simples antes de mostrar
qualquer coisa — só para impedir que alguém que ache o link mexa nos seus
dados.

1. No painel do projeto: **Settings → Environment Variables**.
2. Adicione uma variável:
   - Nome: `APP_PASSWORD`
   - Valor: uma senha sua (não precisa ser complexa, só privada)
3. Salve e marque para os três ambientes (Production, Preview, Development).

Sem essa variável configurada, o site funciona sem pedir senha (então não
esqueça desse passo).

## Passo 3 — Deploy

### Pela CLI
```bash
npm i -g vercel
cd pasta-do-projeto
vercel login
vercel --prod
```

### Pelo painel
Suba a pasta para um repositório no GitHub e importe em **Add New → Project**
(ou arraste a pasta, se sua conta tiver essa opção). Como há um
`package.json`, a Vercel instala a dependência automaticamente — não precisa
configurar build command nem output directory.

> Se você já tinha um projeto sem o banco/senha configurados, repita o
> deploy (`vercel --prod` ou um novo `git push`) depois de fazer os passos 1
> e 2, para que as funções em `/api` passem a existir com acesso ao banco.

## Passo 4 — Primeiro acesso e importação do progresso salvo

1. Abra a URL do site — vai pedir a senha que você definiu no Passo 2.
2. Como o banco começa vazio, use o botão **Importar backup** no rodapé do
   site com o arquivo de backup mais recente que você já tinha exportado
   (ex.: `backup-plano-oab-2026-09-26.json`) para trazer o progresso que já
   existia para o servidor.
3. A partir daí, qualquer aula marcada, revisão ou simulado preenchido salva
   direto no servidor — o indicador no rodapé mostra "Salvando no
   servidor…" / "Salvo no servidor".

## Depois do deploy

- Domínio: **Project → Settings → Domains**, se quiser um nome próprio.
- Para atualizar o conteúdo do app (por exemplo, um `index.html` novo gerado
  aqui comigo), repita o deploy — os dados no banco não são afetados, pois
  vivem separados do código.
- Continue exportando um backup de vez em quando (botão no rodapé) — é uma
  cópia de segurança independente do banco, útil se algo der errado com o
  banco ou se quiser migrar de projeto.
