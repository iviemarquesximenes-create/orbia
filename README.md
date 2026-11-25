# ORBIA — Primeira versão implementada

**Seu condomínio, conectado e inteligente.**

Aplicativo web responsivo com HTML/CSS/JavaScript separados e backend Express/PostgreSQL em diretório próprio. Esta é a primeira versão do núcleo, não o produto completo descrito no prompt mestre.

## Como usar no Manus

Abra **Preview**. Se as variáveis Supabase estiverem configuradas, o login oferece entrada/cadastro por e-mail e senha. Após entrar, somente contas globais do tipo `sindico` podem cadastrar um condomínio; o criador passa a ser o síndico responsável daquele condomínio. Cadastre unidades e registre pagamentos/despesas. Os fundos Condomínio e Caixinha são criados separados, com saldo inicial zero. Não foi inserido tenant ou registro fictício no banco.

A sessão usa cookie HttpOnly/Secure/SameSite=None para Preview HTTPS. Políticas de cookies de terceiros do navegador podem exigir abrir o login fora do iframe. O fluxo OAuth de usuário completo ainda precisa ser validado interativamente pelo titular; as checagens atuais não fingem esse login.

## Login Supabase

O login aceita e-mail e senha, cadastro e solicitação de redefinição de senha pelo Supabase Auth. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no ambiente do servidor; a chave publicável pode ser enviada ao navegador, mas nunca use uma `service_role` no frontend. No Supabase, habilite Email Auth e configure `https://SEU-DOMINIO/login.html` como URL de redirecionamento para confirmação e recuperação de senha.

A migration `database/supabase/001_orbia_schema.sql` cria no Supabase Auth e Postgres os perfis, usuários, condomínios, vínculos e tabelas de domínio com políticas RLS por condomínio. A `002_syndic_account_type.sql` adiciona o tipo global de conta e restringe a criação de condomínios a síndicos. A API usa `pg` e grava no PostgreSQL do Supabase. Aplique ambas pelo SQL Editor do Supabase ou execute `pnpm db:migrate` com `DATABASE_URL` configurada; cada migration é registrada em `schema_migrations`. As migrations MySQL antigas foram preservadas em `database/legacy-mysql-migrations/` apenas como histórico e não são usadas pela aplicação.

Configure `DATABASE_URL` no ambiente do servidor com a connection string PostgreSQL do Supabase (`postgresql://...`), preferencialmente o Transaction Pooler para Vercel (porta 6543). Não use a URL HTTPS do projeto Supabase nessa variável. Mantenha a connection string secreta, separada da chave publicável, e nunca a inclua no frontend. O pool exige TLS com validação do certificado; para desenvolvimento local, `sslmode=disable` só é aceito em `localhost`.

### Cadastro de síndico

Novos usuários começam com `public.users.account_type = 'resident'`. Um operador autorizado pode habilitar o responsável inicial pelo SQL Editor, usando o UUID do usuário em Supabase Auth:

```sql
UPDATE public.users
SET account_type = 'sindico', updated_at = now()
WHERE id = 'UUID-DO-USUARIO';
```

O tipo global permite criar condomínios; o papel por condomínio continua sendo controlado por `memberships`. O cadastro cria membership `syndic`, não `admin`. Usuários autenticados não podem alterar seu próprio `account_type`.

### Comprovantes enviados pelo grupo

Para receber imagens/PDFs do grupo, configure o segredo `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente server-side e crie o bucket privado `orbia-private-documents` no Supabase Storage. O n8n envia o arquivo binário ao endpoint ORBIA, que grava o objeto no tenant correspondente; depois envia a referência retornada no evento de mensagem. O anexo aparece na fila de revisão com URL assinada de curta duração. Não há lançamento financeiro automático: o síndico confere o comprovante/conta e registra o pagamento ou despesa pelo fluxo financeiro.

O contrato e as etapas do n8n estão em [docs/evolution-n8n.md](./docs/evolution-n8n.md). A integração continua dependendo da configuração externa do Evolution/n8n e do bucket privado.

Para tentar evitar a pausa automática do plano gratuito, depois de aplicar a migration adicione os secrets `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no GitHub Actions. O workflow `.github/workflows/supabase-keepalive.yml` chama diariamente uma função que faz uma atualização mínima no banco. Isso é apenas uma tentativa de manter atividade e não é garantia contra mudanças nos critérios de inatividade ou atrasos do GitHub Actions; o plano Pro é a opção confiável para evitar pausa automática.

### Deploy no Vercel

O `vercel.json` seleciona o preset Express e o Build Command `pnpm build`; o entrypoint raiz `index.js` exporta a aplicação. O build copia os assets estáticos para `public/`, pois o Vercel não serve arquivos por `express.static()`. Não selecione Vite nem defina Output Directory. Não fixe manualmente `PORT`; aplique a migration separadamente no Supabase ou execute `pnpm db:migrate` fora do build do Vercel.

## Recursos implementados

- Criação/seleção de condomínio e escopo por membership no servidor; criação restrita a contas globais `sindico`.
- Papéis admin/síndico/financeiro/conselho/morador/funcionário no modelo de autorização; sem editor de papéis/convites nesta versão.
- Cadastro/listagem de unidades com primeiro morador opcional.
- Dashboard calculado do banco, fundos independentes, pagamentos/alocações e despesas em revisão.
- Idempotência de pagamentos/despesas com chave obrigatória, impressão digital e retorno do registro existente em retry.
- Alocação parcial explicitamente pendente; comprovante/lançamento não equivale a crédito bancário.
- Cadastros/listagens de prestadores, manutenção, orçamento, ocorrência e rascunho de comunicado; publicação autorizada no app.
- Triagem manual auditada, restrita a administrador/síndico/financeiro.
- Webhook de entrada Evolution+n8n, upload privado de mídia de grupo, tenant derivado da integração, normalização, revisão humana e deduplicação por delivery ID.

## Limitações e próximas etapas

A integração Evolution+n8n **não está conectada**: falta segredo protegido e workflow da instalação real. Não há envio de WhatsApp, bot, comandos ou IA classificadora. Habilitar entrada não comprova conectividade. A chave Evolution deve continuar no n8n.

Permanecem abertos: contribuições/cobranças mensais, esperado/recebido/pendente por unidade, edição de alocações, conciliação, estornos/ajustes, novos fundos, upload de documentos pelo app e vínculo de cada anexo da fila ao lançamento financeiro, calendário e transições completas, decisões, busca, exportação, notificações, convites/permissões configuráveis, vínculo conta–unidade, superadmin/planos e autenticação comercial independente. A visão financeira de morador fica bloqueada até existir vínculo individual seguro.

Não existem exclusões financeiras; auditoria e movimentos ficam preservados. A correção por estorno ainda será implementada. Rate limit é básico, por processo; rotação/segredos individuais, HMAC e limitação distribuída são requisitos antes de operação comercial. Retenção/LGPD e backup devem ser definidos operacionalmente.

## Organização

```text
frontend/                 HTML, CSS, JS e recursos do navegador
backend/src/              API, autenticação, autorização e regras
backend/test/             Testes unitários/HTTP sem escrita no banco real
database/supabase/        Schema PostgreSQL e políticas RLS
database/legacy-mysql-migrations/  Histórico das migrations MySQL antigas
docs/                     Prompt revisado, contrato e riscos
scripts/                  Sintaxe e validação de separação/rotas
```

O Express serve os arquivos do frontend sem embutir marcação no backend. `app.config.ts` contém apenas metadados do logo da plataforma.

## Comandos

Node 22; pnpm 11.25.0, dependências fixadas e lockfile versionado.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
pnpm test
pnpm build
```

`.env.example` lista somente nomes de variáveis, sem valores secretos. A migration atual cria um banco PostgreSQL novo; os dados que existiam no MySQL não são copiados automaticamente. Exporte/import esses dados separadamente antes de apontar produção ao novo banco. **Preview e produção podem compartilhar o banco:** não executar limpeza ou seed destrutivo.

## Evidência desta versão

55 testes automatizados passaram, cobrindo moeda, datas, permissões, sessão, autorização SQL controlada, anexos privados, health check, estados de falha de carregamento, páginas públicas, manifesto, API e PWA. Build verificou a sintaxe JavaScript, rotas e referências locais; também confirmou que o entrypoint Express e os assets PWA/páginas são publicados em `public/`. Os testes de aplicação usam SQL controlado; a conexão real com PostgreSQL/Supabase e a migration remota ainda precisam ser validadas com a `DATABASE_URL` do projeto.

Os testes de isolamento usam dependência SQL controlada e não gravam no banco. Não foi feito teste real de lançamento financeiro, conexão externa ou callback OAuth completo de usuário; esses resultados não devem ser inferidos dos testes unitários.

Ver `TODO.md` para os critérios completos preservados, `docs/api.md` para rotas implementadas e `docs/evolution-n8n.md` para conexão futura. A versão é destinada ao Preview; publicação é uma ação separada da usuária.
