# Plano de Estudos — Exame de Ordem (sincronizado com a EBRADI)

Site de página única (`index.html`) + funções serverless (`/api`) que guardam
o progresso de **cada usuário** num banco Redis conectado ao projeto na Vercel.
Cada pessoa cria a própria conta (nome completo, usuário e senha) e vê só o
próprio andamento, em qualquer computador ou celular.

## Cronograma personalizado

Logo depois de criar a conta, o site pergunta:

1. Qual Exame de Ordem a pessoa vai prestar (48º, 49º ou 50º — só aparecem os
   exames cuja 1ª fase ainda não passou);
2. Quantas horas por dia, no máximo, pretende estudar (1 a 8 h; cada aula
   dura em média 15 min — constante `MIN_PER_LESSON` no `index.html`);
3. Qual dia da semana fica para descanso (a véspera vira dia de questões e
   simulado);
4. Qual matéria vai escolher na 2ª fase (ou "Ainda não sei").

Com isso o plano é montado no próprio navegador:

- começa **no dia em que as respostas são enviadas** — ninguém entra com
  aulas atrasadas;
- as 961 aulas da 1ª fase são distribuídas até a véspera da prova, sem passar
  do limite de horas; os últimos dias viram revisões intensivas (uma por
  disciplina, enquanto couber);
- a 1ª fase segue a mesma regra para todos: **cada dia tem uma única
  disciplina** (todas as aulas do dia são dela, na sequência da EBRADI), e a
  disciplina de um dia **nunca se repete no dia de estudo seguinte**. As 20
  disciplinas se revezam de forma uniforme, entrando primeiro a que está mais
  atrasada em relação ao ritmo ideal. Uma segunda disciplina só aparece num
  dia quando, sem ela, as aulas não caberiam até a prova;
- se a pessoa escolheu uma matéria de 2ª fase, as aulas dela entram de
  **1 mês antes da 1ª fase até a véspera da 2ª** (com mais aulas por dia
  depois da 1ª fase);
- se não couber tudo no limite de horas, o painel avisa quantas aulas por dia
  o plano precisa.

As respostas ficam salvas na conta e podem ser ajustadas pelo botão
**Ajustar respostas do plano** no painel: o cronograma é refeito a partir do
dia do ajuste, e as aulas já concluídas continuam marcadas.

Os dados das aulas (títulos por disciplina, 1ª e 2ª fase) e as datas dos
exames ficam no bloco `<script id="catalog-data">` do `index.html`.

Os arquivos anexados aos simulados (PDF, DOC ou DOCX, até 4 MB) também ficam
no servidor, num armazenamento **privado** do Vercel Blob: só o dono da conta
consegue abri-los.

## Estrutura

```
index.html          → o app (HTML + CSS + JS + dados do cronograma)
api/register.js     → POST: cria conta { name, username, password } e já entra
api/login.js        → POST: entra com usuário e senha
api/logout.js       → POST: sai da conta
api/me.js           → GET: devolve quem está logado
api/state.js        → GET lê / POST grava o progresso e as respostas do plano
api/backup.js       → POST: cópia de segurança automática (chamada a cada 10 min)
api/files.js        → POST envia / GET abre / DELETE apaga anexos de simulado
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
oab-plano:state:<usuario>    → progresso (aulas, revisões, simulados) + respostas do plano
oab-plano:backups:<usuario>  → cópias de segurança (as 144 mais recentes, da mais nova à mais antiga)
oab-plano:backupmeta:<usuario> → horário e assinatura da última cópia
oab-plano:files:<usuario>    → lista dos anexos do usuário (o arquivo em si fica no Blob)
oab-plano:session:<hash>     → sessão ativa (expira sozinha)
oab-plano:state              → progresso ANTIGO (versão de senha única) — não é mais lido
```

## Cópias de segurança

Enquanto o site está aberto, ele pede ao servidor uma cópia de segurança a
cada 10 minutos. O servidor só grava uma nova cópia se os dados mudaram desde
a anterior, e guarda as 144 mais recentes. O rodapé mostra o horário da
última cópia. (A Vercel no plano gratuito só permite tarefas agendadas
diárias, por isso a cópia é disparada pelo próprio site aberto.)

Para recuperar uma cópia, abra o banco no painel da Vercel (Storage → Redis →
Data Browser / CLI) e leia a lista `oab-plano:backups:<usuario>`.

## Armazenamento dos anexos (Vercel Blob) — configurar uma vez

1. No projeto, aba **Storage** → **Create Database** → **Blob**.
2. Escolha acesso **Private** (se a Vercel perguntar) e conecte ao projeto.
   Isso cria sozinha a variável `BLOB_READ_WRITE_TOKEN`.
3. Faça um **Redeploy**.

Se o seu Blob store tiver sido criado como público, adicione a variável
`BLOB_ACCESS` com o valor `public` (os arquivos continuam acessíveis só por
meio do site, que confere o login antes de entregá-los).

Anexos feitos na versão anterior (guardados só no navegador) são enviados
automaticamente ao servidor na próxima vez que o site for aberto naquele
navegador.

## Atualizando a partir da versão com senha única

1. Substitua os arquivos do repositório por estes (a pasta `api` agora tem
   vários arquivos e a subpasta `_lib`).
2. Faça o deploy (o banco Redis continua o mesmo; nada precisa ser recriado).
3. Opcional: apague a variável `APP_PASSWORD` em **Environment Variables** —
   ela não é mais usada.
4. Abra o site, clique em **Criar conta** e cadastre-se.
5. Responda as perguntas do plano. Aulas que já estavam concluídas na conta
   continuam marcadas e saem da distribuição.

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
