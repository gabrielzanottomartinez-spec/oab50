# Autos do Plano de Estudos — 50º Exame de Ordem

Site de página única (`index.html`) + funções serverless (`/api`) que guardam
o progresso de **cada usuário** num banco Redis conectado ao projeto na Vercel.
Cada pessoa cria a própria conta (nome completo, usuário e senha) e vê só o
próprio andamento, em qualquer computador ou celular.

**O que continua só no navegador:** os arquivos anexados nos registros de
simulado (PDF/DOCX) — ficam em IndexedDB, local a cada navegador (separados
por usuário).

## Estrutura

```
index.html          → o app (HTML + CSS + JS + dados do cronograma)
api/register.js     → POST: cria conta { name, username, password } e já entra
api/login.js        → POST: entra com usuário e senha
api/logout.js       → POST: sai da conta
api/me.js           → GET: devolve quem está logado
api/state.js        → GET lê / POST grava o progresso do usuário logado
api/_lib/core.js    → código compartilhado (Redis, senhas, sessões) — não vira rota
package.json        → dependência (redis) que a Vercel instala no deploy
vercel.json         → configuração mínima (URLs limpas + headers de segurança)
.env.example        → notas sobre variáveis de ambiente
```

## Como funciona a segurança

- Senhas nunca são guardadas: o servidor salva só um hash `scrypt` com sal
  aleatório.
- Ao entrar, o servidor cria uma sessão de 30 dias e a guarda num cookie
  `HttpOnly` (o JavaScript da página não consegue lê-lo).
- Depois de 10 senhas erradas para o mesmo usuário, o login dele fica
  bloqueado por 15 minutos.
- Nomes de usuário: 3 a 30 caracteres (letras minúsculas, números, `.`, `-`,
  `_`). Maiúsculas digitadas viram minúsculas. Senha: mínimo de 6 caracteres.

## Dados no Redis

```
oab-plano:user:<usuario>     → nome, usuário, hash da senha
oab-plano:state:<usuario>    → progresso (aulas, revisões, simulados)
oab-plano:session:<hash>     → sessão ativa (expira sozinha)
oab-plano:state              → progresso ANTIGO (versão de senha única) — não é mais lido
```

## Atualizando a partir da versão com senha única

1. Substitua os arquivos do repositório por estes (a pasta `api` agora tem
   vários arquivos e a subpasta `_lib`).
2. Faça o deploy (o banco Redis continua o mesmo; nada precisa ser recriado).
3. Opcional: apague a variável `APP_PASSWORD` em **Environment Variables** —
   ela não é mais usada.
4. Abra o site, clique em **Criar conta** e cadastre-se.
5. Use **Importar backup** no rodapé com o seu arquivo de backup mais recente
   para trazer o progresso antigo para a sua conta.

## Deploy do zero

1. **Storage → Create Database → Redis** → conecte ao projeto (cria a
   variável `REDIS_URL` sozinha).
2. Suba os arquivos para um repositório no GitHub e importe em
   **Add New → Project** — ou, pela CLI: `vercel --prod`.
3. Depois de conectar o banco, faça um **Redeploy** para a variável valer.

## Testar localmente

```bash
vercel env pull .env.local   # traz a REDIS_URL do projeto
vercel dev
```

## Se a página não abrir

1. Em **Deployments**, o deploy mais recente está "Ready" (verde)? Se estiver
   "Error", abra-o e veja o log.
2. Use a URL exata da aba **Overview**.
3. Teste numa aba anônima e em outra rede (dados móveis).
