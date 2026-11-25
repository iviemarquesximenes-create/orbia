# Revisão de riscos do ORBIA

## Prioridade imediata — P0

### 1. Acesso entre condomínios

**Impacto:** exposição de dados financeiros, endereços, contatos, documentos e conversas de um tenant a outro; risco de privacidade e LGPD. O isolamento não pode depender da interface.

**Mitigação:** middleware de tenant no backend deriva escopo da sessão e da membership; todas as consultas tenant-scoped recebem `tenant_id` do contexto validado; chaves compostas/foreign keys reforçam pertencimento; anexos e exports repetem a validação. Criar casos de teste negativos com usuário de outro condomínio, usuário com múltiplas memberships e mudança de tenant.

### 2. Erro financeiro ou duplicidade

**Impacto:** saldo, cobrança e prestação de contas incorretos. Pagamentos podem misturar os fundos ou criar duas entradas para uma transferência combinada.

**Mitigação:** armazenar valor monetário como decimal; registrar transação original uma única vez e relacionar alocações; proteger ingestão com idempotency key; movimentos por append/estorno, sem exclusão; toda operação financeira ocorre em transação no banco e mantém auditoria. Comprovante enviado permanece distinto de confirmação bancária. Ambiguidade, valor ou fundo desconhecido vira revisão, nunca alocação presumida.

### 3. Ação sensível acionada por mensagem ou interface

**Impacto:** despesa ou comunicado oficial sem autorização, ou atribuição incorreta de consentimento a outro morador.

**Mitigação:** autor e permissão validados no servidor para cada ação; confirmação vinculada à solicitação original, à identidade e a uma validade; estados separados para intenção, solicitação, autorização, pagamento e conclusão; não inferir decisão formal de conversa ambígua.

## Prioridade alta — P1

### 4. Credenciais e falsificação de webhook

**Impacto:** invasor pode registrar mensagens, provocar envio indevido ou tentar acionar workflows. A documentação da Evolution Foundation alerta que a chave da API dá acesso amplo à instância; ela não pode chegar ao frontend ou repositório [1].

**Mitigação:** manter a chave Evolution dentro do n8n quando possível. o desenho alvo prevê segredo individual/HMAC rotacionável; nesta versão o ORBIA valida bearer secret global ao projeto; segredo validado em tempo constante e não escrito em logs. Rejeitar payload sem origem/configuração conhecida, aplicar limites de tamanho e rate limit, mapear instância para tenant do lado servidor e registrar idempotência. Sem segredo fornecido, endpoint retorna estado não configurado e não processa eventos.

### 5. Indisponibilidade ou incompatibilidade Evolution/n8n

**Impacto:** mensagens podem atrasar, não chegar, duplicar após retry ou continuar numa instância desconectada. A Evolution lista eventos de mensagem e conexão, incluindo `MESSAGES_UPSERT` e `CONNECTION_UPDATE` [2]; o workflow externo também pode mudar ou ficar fora do ar.

**Mitigação:** status de conexão visível, fila/retry idempotente, estado de falha e reprocessamento sob autorização, logs sem conteúdo privado desnecessário, alarme e caminho manual pelo app. O produto não depende da integração para finanças e manutenção. Pedir URL pública do n8n, segredo e contrato do workflow antes de declarar integração operacional.

### 6. Risco de sessão e política de WhatsApp no método Evolution escolhido

**Impacto:** compatibilidade pode mudar porque a implementação Evolution pode usar conexão WhatsApp Web/Baileys, distinta do Cloud API oficial, e o próprio repositório do provedor registra que o modo baseado no WhatsApp Web pode ter limitações comparado com APIs oficiais [3]. Isso pode afetar disponibilidade, manutenção, sessão e elegibilidade de uso.

**Mitigação:** respeitar a escolha da usuária de Evolution+n8n sem substituir por Meta Cloud API; desacoplar provedor; evitar prometer uptime ou acesso universal a grupos; não capturar conversas privadas fora dos canais autorizados; documentar reconexão/QR e procedimento manual no ambiente proprietário. Validar a versão e o modo do Evolution que a usuária opera antes de escrever workflow final.

### 7. Identidade incompatível com comercialização pública

**Impacto:** autenticação de conta Manus serve ao ambiente atual, mas pode impedir que moradores/administradores sem conta Manus usem um produto comercial independente.

**Mitigação:** encapsular resolução de identidade e membership; documentar Manus OAuth como escolha temporária para Preview/MVP; antes do lançamento externo, selecionar provedor de identidade próprio e executar migração segura de usuários e sessões. Não publicar como SaaS aberto sem essa decisão.

### 8. Injeção de tenant pelo payload ou webhook

**Impacto:** um evento forjado com `tenant_id` de terceiro poderia contaminar dados ou gerar acesso cruzado.

**Mitigação:** `tenant_id` nunca vem de forma confiável do frontend ou mensagem; resolver pelo identificador de integração/instância previamente associado no banco e pela credencial de webhook. Revalidar usuário/remetente e membership antes de qualquer consulta/registro.

## Prioridade média — P2

### 9. IA classifica errado ou inventa contexto

**Impacto:** despesas, decisões ou avisos incorretos podem parecer oficiais.

**Mitigação:** IA só propõe; origem, confiança e versão ficam registradas; baixa confiança pede esclarecimento; revisão humana obrigatória para decisão, dinheiro e publicação; consultas usam endpoints determinísticos de relatório e apresentam fonte/link. Sem modelo conectado, não exibir chat de fachada.

### 10. Armazenamento e exposição de anexos

**Impacto:** comprovantes, notas e documentos pessoais podem vazar por URL aberta, tenant errado ou retenção indefinida.

**Mitigação:** guardar metadados e ACL por tenant, usar links assinados/temporários quando storage permitir, validar acesso no servidor, limitar tipo/tamanho, auditar download e definir retenção. Não disponibilizar arquivo privado por link previsível.

### 11. Amplitude do escopo e baixa confiabilidade operacional

**Impacto:** tentar entregar dezenas de módulos em paralelo pode resultar em telas sem comportamento, regras incompletas e vulnerabilidades financeiras.

**Mitigação:** priorizar fundação, ledger, unidade e fluxo de revisão; módulos conectados a dados reais primeiro; documentar itens futuros no TODO com estado aberto; demonstrar estado vazio antes de inserir dado inventado; concluir um fluxo ponta a ponta por vez.

### 12. Migrations e dados compartilhados entre Preview e produção

**Impacto:** DDL, seed ou testes de escrita no banco gerenciado podem afetar os mesmos dados usados na versão publicada.

**Mitigação:** migrations determinísticas, aditivas e registradas; não executar limpeza destrutiva; seed opt-in em tenant `DEMO`; separar testes unitários de integração que gravam no banco; revisar qualquer migração que remova ou altere dados.

### 13. Logs e privacidade

**Impacto:** payloads de WhatsApp, telefone, comprovantes e tokens podem ser replicados em logs e suportes.

**Mitigação:** logs estruturados com identificadores e estado, não conteúdo completo por padrão; mascarar telefones/segredos; reter apenas dados de gestão autorizados e necessários; permitir revisão e políticas de exclusão conforme obrigações legais.

## Decisões antes de produção

1. Confirmar versão/modo Evolution (WhatsApp Web/Baileys), URL de instância, estabilidade da sessão, eventos habilitados e limites observados.
2. Confirmar URL n8n, autenticação de entrada/saída, estrutura de payload, workflow de aprovação e rotação de segredos.
3. Escolher provedor de autenticação para moradores externos à Manus.
4. Definir retenção, exportação, exclusão, consentimento e política de tratamento de mensagens/anexos em conformidade com a LGPD.
5. Definir se confirmação bancária/manual ou integração financeira autorizada será a fonte oficial do status `confirmado`.
6. Definir regras formais de aprovação de despesas e comunicados por condomínio.

## Fontes

[1]: https://docs.evolutionfoundation.com.br/en/evo-nexus/integrations/evolution-api "Evolution API integration and credential handling"
[2]: https://evolution-74046672.mintlify.app/v2/en/configuration/webhooks "Evolution API v2 webhook events"
[3]: https://github.com/evolution-foundation/evolution-api "Evolution Foundation Evolution API repository"

## Situação observada na primeira versão (19/11/2026)

Implementados: escopo de membership/tenant no servidor e FKs compostas; CSRF e sessão Manus assinada; chaves obrigatórias e fingerprint para pagamentos/despesas; alocação incompleta com restante explícito; revisão sensível restrita; comunicados não publicados ocultos de não administradores; limite de corpo e rate limit básico por processo; payload de entrada minimizado; auditoria de mutações e habilitação de entrada.

Ainda não implementados ou não validados: HMAC/janela temporal, segredo por integração, rotação, filas distribuídas e monitoramento; estorno e conciliação; ACL/upload de documentos; retenção/LGPD operacional; teste de usuário do OAuth completo, lançamentos reais e integração externa. As mitigações deste relatório são requisitos, não certificações de segurança nem de conformidade.
