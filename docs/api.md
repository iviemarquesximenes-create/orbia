# API ORBIA — Contrato da primeira versão

## Autenticação e escopo

Base: `/api`. Rotas de domínio aceitam sessão Supabase em cookies `HttpOnly` ou, para compatibilidade, o cookie Manus `webdev_app_session`. A sessão Supabase é validada pelo Auth do projeto e renovada pelo backend; o identificador Auth é mapeado a um usuário local. `X-Orbia-Tenant-Id` seleciona um condomínio, mas só é aceito após consulta da membership ativa do usuário. Papéis vêm do banco, nunca do payload.

Mutações autenticadas também exigem `X-Orbia-CSRF`, obtido de `GET /api/auth/me`. A API envia `Cache-Control: private, no-store`, limita JSON a 512 KiB e aplica rate limiting por processo/IP. O webhook usa bearer servidor-servidor, não sessão/CSRF do navegador.

## Endpoints implementados

### Autenticação

| Método e rota | Comportamento |
|---|---|
| `GET /api/auth/config` | Provedor e disponibilidade; com Supabase, retorna URL e chave publicável (nunca service role). |
| `POST /api/auth/session` | Valida tokens Supabase no servidor e cria cookies de sessão seguros. |
| `POST /api/auth/start` | Exige header Origin público válido; cria state/nonce e URL OAuth Manus. |
| `GET /auth/callback` | Verifica state/nonce, troca código, resolve identidade e cria sessão HTTPS. |
| `GET /api/auth/me` | Identidade, tipo global da conta, memberships e token CSRF. |
| `POST /api/auth/logout` | Exige sessão/CSRF e limpa o cookie da aplicação. |
| `GET /api/health` | Readiness de banco e migrations; informa integrações pendentes. |

### Condomínios e unidades

| Método e rota | Comportamento |
|---|---|
| `GET /api/tenants` | Lista apenas condomínios associados ao usuário. |
| `POST /api/tenants` | Apenas `account_type = 'sindico'` cria condomínio; cria membership `syndic` e fundos Condomínio/Caixinha em transação. |
| `GET /api/units` | Lista unidades e nomes de moradores; administrador/síndico/financeiro/conselho. |
| `POST /api/units` | Administrador/síndico cria unidade e, opcionalmente, primeiro morador. |

Não há ainda endpoints de convite, mudança de papel, edição de membership ou vínculo seguro conta–unidade. Moradores/funcionários não recebem extrato financeiro geral nem lista completa de unidades.

### Financeiro

Leitura: administrador, síndico, financeiro e conselho. Escrita/aprovação: administrador, síndico e financeiro. Valores são strings decimais nas respostas e DECIMAL no banco; cálculos de alocação usam centavos inteiros.

| Método e rota | Comportamento |
|---|---|
| `GET /api/dashboard` | Saldo do ledger por fundo, movimentos do mês pela data financeira e contagens operacionais. |
| `GET /api/funds` | Fundos ativos e saldos calculados. |
| `GET /api/payments` | Original, alocações, `allocated_amount`, `unallocated_amount`, origem e status; até 100. |
| `POST /api/payments` | Original único, até 12 alocações por fundo/mês, total alocado ≤ original. |
| `GET /api/expenses` | Despesas, justificativa, fundo, status; até 100. |
| `POST /api/expenses` | Despesa justificada em `pending_review`; não altera saldo. |
| `POST /api/expenses/:expenseId/review` | `decision: approve` ou `reject`; aprovação cria uma saída única. |

`POST /api/payments` e `POST /api/expenses` exigem `Idempotency-Key` estável de até 191 caracteres. O mesmo tenant/chave com o mesmo payload normalizado retorna o registro existente com `replayed: true`, sem novo lançamento. Reutilização com dados diferentes retorna `409 IDEMPOTENCY_CONFLICT`. A interface conserva a chave de uma tentativa malsucedida na sessão do navegador.

Pagamento exige `amount` positivo e `receivedAt` real; campos opcionais `unitId`, `payerName`, `note`; `allocations` contém `fundId`, `referenceMonth` (AAAA-MM), `amount`. Alocação parcial fica em `identified`, com saldo não alocado explícito; apenas alocação integral fica em `posted`. Nenhum desses estados equivale à conciliação bancária. O saldo dos fundos contém somente o que foi alocado ao ledger.

Despesa exige `fundId`, `amount`, `occurredAt`, `category`, `reason`; `supplierId` opcional. A justificativa completa permanece na despesa e o ledger guarda um resumo de até 500 caracteres. Datas ausentes ou impossíveis são rejeitadas, não preenchidas automaticamente.

Não há ainda cobranças mensais, conciliação, comprovantes, estorno/ajuste, edição de alocações pendentes, novo fundo ou exportação. Não existe endpoint de exclusão financeira.

### Operação e revisão

- `GET/POST /api/suppliers`: lista/cria prestador; verifica semelhança por nome/empresa/telefone.
- `GET/POST /api/maintenance`: lista/cria registro solicitado/planejado; não conclui manutenção automaticamente.
- `GET/POST /api/quotes`: lista/cria orçamento; datas validadas.
- `GET/POST /api/occurrences`: lista/cria ocorrência.
- `GET/POST /api/announcements`: lista/cria rascunho. Não administradores recebem apenas comunicados publicados.
- `POST /api/announcements/:announcementId/publish`: publicação no ORBIA por administrador/síndico; não envia WhatsApp.
- `GET/POST /api/review`: fila sensível/manual, com permissões `review:read`/`review:create`.
- `GET /api/review/:itemId/attachments/:attachmentIndex/url`: emite URL privada assinada por cinco minutos para revisor autorizado.
- `POST /api/review/:itemId/action`: `approve`, `reject`, `ignore`, `clarify`; exige `review:decide` e registra auditoria.

A revisão está restrita a administrador/síndico/financeiro. Aprovar triagem não cria um movimento financeiro. Pedir esclarecimento apenas registra estado; não envia mensagem externa. O CRUD é de criação/listagem e das transições explicitamente citadas, não CRUD completo de todos os módulos.

### Evolution API + n8n

- `GET/POST /api/integrations`: lista/cadastra instância pendente.
- `POST /api/integrations/:integrationId/activate`: habilita entrada após configuração do segredo; audita a alteração. Não testa conectividade Evolution.
- `POST /api/integrations/evolution/media`: recebe imagem/PDF binário autorizado pelo webhook e armazena em bucket privado.
- `POST /api/integrations/evolution/events`: contrato normalizado, segredo, origem, integração e delivery ID estável; resolve tenant internamente; persiste evento e mensagem na fila.

Ver `docs/evolution-n8n.md` para headers/payload. Saída não implementada; status `outboundImplemented: false`.

## Erros

Formato: `{ "error": { "code": "...", "message": "..." } }`. Códigos incluem `UNAUTHENTICATED`, `CSRF_VALIDATION_FAILED`, `TENANT_REQUIRED`, `TENANT_FORBIDDEN`, `PERMISSION_DENIED`, `IDEMPOTENCY_REQUIRED`, `IDEMPOTENCY_CONFLICT`, `INVALID_JSON`, `RATE_LIMITED`, `INTEGRATION_NOT_CONFIGURED` e validações de domínio. Nenhuma resposta expõe segredos ou stack trace.
