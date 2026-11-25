# ORBIA — Prompt Mestre Revisado de Produto e Implementação

**Nome:** ORBIA

**Slogan:** Seu condomínio, conectado e inteligente.

**Categoria:** SaaS de gestão condominial, comunidades residenciais e administração colaborativa.

## 1. Missão e princípios

Construir uma plataforma web responsiva e mobile-first que organize finanças, pagamentos, fundos, manutenção, prestadores, orçamentos, ocorrências, comunicados, documentos, decisões e comunicação de moradores. O ORBIA reduz a dependência de grupos como único arquivo operacional e transforma informações autorizadas em registros pesquisáveis, rastreáveis e auditáveis.

A plataforma deverá continuar utilizável sem WhatsApp, IA ou n8n conectados. Nenhum protótipo, tela, dado de demonstração ou automação pendente poderá ser apresentado como funcionalidade real. Se houver demonstração, o tenant e todos os dados serão claramente identificados como `DEMO`.

Prioridades permanentes: segurança multi-tenant, simplicidade para moradores, transparência financeira, histórico confiável, revisão humana para ambiguidade, automação que reduza trabalho manual e origem dos dados visível.

## 2. Arquitetura SaaS e estrutura de implementação

O produto atende inicialmente a um condomínio de 5 casas, mas desde o início suporta múltiplos condomínios simultâneos e unidades configuráveis sem limite fixo codificado. Cada tenant tem nome, logo, endereço, configurações, unidades, moradores, usuários, administradores, síndico/conselho/funcionários, fundos, contribuições, despesas, manutenções, prestadores, orçamentos, ocorrências, comunicados, documentos, decisões, histórico, integrações, configurações de IA/WhatsApp e regras de automação próprios.

Usuários podem pertencer a mais de um condomínio e possuir permissões distintas por condomínio. Toda consulta e alteração valida sessão, tenant autorizado, membership e permissão no backend. O tenant não pode ser aceito exclusivamente de um parâmetro do frontend, webhook ou mensagem.

**Separação mandatória:** frontend e backend em diretórios próprios. HTML sem lógica ou estilos embutidos; CSS exclusivamente em arquivos `.css`; JavaScript exclusivamente em arquivos `.js`; sem JSX. O frontend consome API autenticada. O backend concentra autenticação, autorização, validações, regras financeiras e integrações. O banco relacional usa migrations, relações, índices e restrições. Segredos ficam fora do código, do banco não criptografado, do HTML e do navegador.

Preparar para planos comerciais Orbia Start, Gestão, Inteligência e Pro. Planos futuros poderão limitar unidades, usuários, armazenamento, processamento de IA, integrações, automação, relatórios e recursos avançados. Cobrança SaaS pode ficar para fase posterior.

## 3. Identidade visual e experiência

Criar identidade própria, moderna, premium, minimalista e acolhedora, com alta legibilidade e baixo ruído visual. Paleta preferencial: verde profundo/teal proprietário, verde suave, branco/off-white, cinza neutro, grafite, âmbar para alertas e vermelho para erro/crítico. Entregar logotipo, ícone, favicons, tela de login, painel, avatar do assistente e componentes consistentes.

A interface prioriza leitura rápida, ações curtas, pesquisa, histórico, responsividade, confirmação clara e mensagens de erro compreensíveis. No celular, usar navegação simples, botões fáceis de tocar, upload de fotos/comprovantes pela câmera e acesso rápido a saldo, pagamentos, pendências, manutenções, avisos e ocorrências. Preparar instalação PWA quando suportado.

Não construir um painel administrativo burocrático. A navegação usa módulos independentes e adapta conteúdo e dados ao papel do usuário.

## 4. Papéis e permissões

Perfis: superadministrador ORBIA; administrador do condomínio; síndico opcional; financeiro; conselho; morador; funcionário. O superadministrador da plataforma não recebe acesso automático irrestrito aos dados privados dos condomínios.

As permissões granulares distinguem consultar, criar, editar, aprovar, cancelar, excluir/arquivar, publicar, exportar e visualizar dados financeiros. Moradores veem pagamentos da própria unidade, comunicados, ocorrências e informações coletivas autorizadas. Não revelar inadimplência de outra unidade sem política e permissão explícitas.

## 5. Unidades, moradores e dashboard

Cadastrar casas, apartamentos, condomínios mistos, blocos e unidades individualizadas. Campos: identificação, número/nome, bloco, tipo, proprietário, morador, contatos, telefone, e-mail, status, observações e histórico. Permitir vários moradores por unidade, proprietários, inquilinos e temporários.

Dashboard responsivo com: saldos por fundo e total; receitas/despesas; contribuições previstas/recebidas/pendentes; ocorrências abertas/urgentes; manutenções pendentes e próximas; orçamentos em análise; comunicados recentes; mensagens processadas; registros aguardando confirmação; itens incompletos; possíveis duplicidades e falhas de automação. Exibir receitas/despesas, evolução de saldo, gastos por categoria e indicadores operacionais somente com dados existentes. Filtros por mês, ano e intervalo de datas.

## 6. Financeiro e contribuições

Criar inicialmente dois fundos independentes:

- **Condomínio:** água, energia, limpeza, materiais, manutenção comum, pequenos reparos, serviços recorrentes e demais despesas ordinárias.
- **Caixinha:** fundo de reserva coletivo para limpeza de caixa de gordura/fossa, reparos extraordinários, portão, estrutura, emergência, materiais e outras despesas aprovadas.

Cada fundo terá saldo, receitas, despesas, extrato, histórico, relatórios, regras e contribuições previstas. Permitir novos fundos.

Contribuições são configuráveis por valor mensal, fundo, unidade, vencimento, frequência, início, ajustes, isenções, valores diferenciados e histórico de alteração. Aceitar pagamento separado ou combinado, parcial, atrasado, antecipado, de terceiro e referente a vários meses.

O painel mensal por unidade mostra, separadamente para cada fundo: valor esperado, recebido, saldo pendente, data, comprovante e status `Pendente`, `Parcial`, `Pago`, `Atrasado`, `Isento`, `Aguardando identificação` ou `Aguardando confirmação`. A situação de um fundo não determina a situação do outro.

Uma transferência combinada é uma única transação financeira original com várias alocações analíticas; nunca duplicar a entrada total. Usar decimal monetário, nunca float. Suportar valor diferente, pagamento excedente, por terceiro, sem unidade, comprovante duplicado/sem contexto e contribuição ajustada.

Distinguir: comprovante recebido; pagamento identificado; pagamento lançado; pagamento confirmado; pagamento conciliado, se houver integração bancária. Comprovante não comprova crédito bancário. Se unidade, período ou rateio não for certo, encaminhar à revisão sem inventar distribuição.

## 7. Caixinha, despesas e auditoria

A Caixinha funciona como livro-caixa com saldo atual/inicial, arrecadado, gasto, contribuições esperadas/recebidas/pendentes, despesas, extrato, histórico anual e evolução. Toda saída registra valor, data, motivo/justificativa, categoria, serviço, prestador, responsável, autorização, comprovante, nota fiscal/fotos quando disponíveis, origem, mensagem original e saldos anterior/posterior.

Categorias: Limpeza de fossa, Caixa de gordura, Portão, Elétrica, Hidráulica, Jardinagem, Estrutura, Segurança, Material, Emergência e Outros. Não aceitar saída definitiva sem finalidade identificada. Se a informação estiver ausente, criar pendência de revisão e não consolidar movimento financeiro definitivo.

Toda movimentação é auditável e não pode ser apagada permanentemente. Corrigir por estorno, ajuste ou lançamento corretivo preservando registro original, responsável, data, motivo e histórico. A mesma transação nunca pode ser contada mais de uma vez.

## 8. Prestação de contas e exportação

Filtros: mensal, anual, período, fundo, categoria, tipo de despesa e prestador. Exibir saldo inicial, entradas, saídas, saldo final, contribuições esperadas/recebidas/pendentes, despesas por categoria, manutenções, comprovantes permitidos e gráficos. Preparar exportações PDF, CSV e XLSX e relatórios compartilháveis conforme permissões.

## 9. Operação condominial

### Manutenções

Registrar nome, categoria, descrição, data, valor, fundo, prestador/contato, comprovante, fotos, observações, responsável, status, periodicidade, última realização e próxima data. Status: `Necessária`, `Solicitada`, `Em orçamento`, `Aguardando aprovação`, `Agendada`, `Em andamento`, `Realizada`, `Paga`, `Cancelada`. Consultar histórico, frequência, custos, prestadores e pendências; manter calendário. Sugestões de data são identificadas como estimativas e não como agendamento oficial.

### Prestadores

Diretório com nome, empresa, telefone/WhatsApp, categoria, serviço, descrição, indicação/origem, data, mensagem, orçamentos, histórico de serviços, avaliações, documentos e observações. Categorias incluem eletricista, encanador, limpeza, fossa, caixa de gordura, jardinagem, poda, pintor, pedreiro, chaveiro, portão, dedetização, entulho, segurança e outros. Detectar duplicidades por nome, telefone e empresa e preservar histórico.

### Orçamentos

Registrar prestador, serviço, descrição, valor, data, validade, condições, anexo, status, observações e vínculo com manutenção/ocorrência. Status: `Necessário solicitar`, `Solicitado`, `Aguardando`, `Recebido`, `Em análise`, `Aprovado`, `Rejeitado`, `Contratado`, `Concluído`. Comparar preços, prestadores, condições e validade. Extrair PDF/imagem/texto apenas quando processamento estiver configurado e revisável.

### Ocorrências

Receber pelo app, WhatsApp autorizado, texto, foto, vídeo e áudio quando suportado. Campos: título, descrição, categoria, local, data, responsável, urgência, anexos, status, orçamentos/manutenção relacionada, histórico e mensagem original. Categorias incluem portão, iluminação, água/vazamento, limpeza, estrutura, segurança, barulho, jardinagem e outros. Status: `Aberta`, `Em análise`, `Aguardando orçamento`, `Aguardando aprovação`, `Agendada`, `Em andamento`, `Resolvida`, `Encerrada`. Detectar repetição e relacionar com item existente apropriado, evitando duplicidade.

### Comunicados e decisões

Comunicados podem ser criados, editados, publicados, agendados, arquivados, enviados pelo app/canal disponível e conter anexos. Categorias: manutenção, água, energia, limpeza, segurança, obras, aviso geral e emergência. Mensagem detectada pela IA poderá virar rascunho em português para aprovação; nunca publicar aviso oficial sem a autorização exigida.

Decisões registram assunto, descrição, data, participantes, proposta, resultado, votos, aprovado/rejeitado, origem, documentos e observações. Distinguir sugestão, opinião, discussão, proposta, consenso aparente e decisão formal. Discussão ambígua fica aguardando confirmação.

## 10. Orbia Inteligência, memória e revisão humana

Processar conteúdo recebido por canais autorizados: texto, fotos, comprovantes, PDFs, orçamentos, documentos, contatos, áudio/vídeo quando suportado. Classificar pagamento, comprovante, receita, despesa, caixinha, manutenção, ocorrência, prestador, orçamento, aviso, decisão/votação, documento, evento, compra, agendamento ou conversa irrelevante.

Extrair condomínio, usuário, unidade, data, valor, categoria, fundo, serviço, prestador, descrição, justificativa, status, prazo, anexo, referência e contexto. Pipeline: receber; validar origem; identificar tenant e usuário; processar/classificar; extrair; procurar contexto e registros; detectar duplicidade; avaliar confiança; criar/atualizar/propor; revisar quando necessário; registrar origem; atualizar módulo autorizado; notificar.

Confiança alta só automatiza categoria permitida; média cria rascunho; baixa pede esclarecimento; ambígua nunca efetua lançamento financeiro definitivo. Cada condomínio configura nível de automação. A Central de Revisão permite revisar, editar, confirmar, aprovar, rejeitar, ignorar, vincular ao registro existente e solicitar esclarecimento, sempre com usuário e ação auditados.

A memória organizacional relaciona mensagens, manutenções, prestadores, despesas, orçamentos, ocorrências, decisões, comprovantes, datas e unidades. Perguntas como “Quanto foi gasto com portão desde o ano passado?” produzem valor calculado a partir de registros reais, período, fontes e links. Ausência de dados resulta em mensagem explícita de que a informação ainda não foi registrada; não inventar nomes, números ou datas.

## 11. Canal de mensagem — Evolution API com n8n

**Escolha do produto:** integrar via Evolution API e n8n. Não usar/implementar a API oficial da Meta/WhatsApp Cloud para o conector do ORBIA. A configuração precisa aceitar a instância Evolution e os workflows n8n usados pela administradora. A chave Evolution fica preferencialmente no n8n; nunca é enviada ao navegador ou commitada.

Fluxo de entrada: WhatsApp → Evolution → webhook/workflow n8n → webhook autenticado ORBIA → validação da origem, mapeamento de instância para tenant/usuário no servidor, idempotência, classificação e registro/revisão. Fluxo de saída: ORBIA → webhook n8n autenticado → n8n chama Evolution → resposta/aviso WhatsApp. Workflows são responsabilidade/configuração externa; mostrar estado `pendente` até URL, segredos, instância e workflow funcionarem. Manter alternativa de importação/registro manual. Não capturar indiscriminadamente mensagens privadas.

O bot `Orbia Assistente` atende comandos extensíveis `/ajuda`, `/saldo`, `/caixinha`, `/pendencias`, `/pagamentos`, `/extrato`, `/manutencoes`, `/fossa`, `/gordura`, `/avisos`, `/contatos`, `/orcamentos`, `/ocorrencias`, `/resumo` e perguntas naturais. Toda resposta identifica condomínio/usuário, verifica permissão, consulta banco, calcula e apresenta resultado claro; sem dado, informa ausência de registro. Evitar spam por controles de frequência.

Ações sensíveis precisam de confirmação no contexto original, validade, autor autorizado, vínculo à solicitação e auditoria. Distinguir intenção, pedido, autorização, pagamento e conclusão. Erros de integração têm retry/reprocessamento seguro, logs e estado visível.

## 12. Segurança, privacidade e dados

Implementar autenticação, sessão, RBAC, isolamento multi-tenant, validação server-side, proteção de API e webhooks, armazenamento seguro de arquivos, limites de requisição, auditoria, gestão protegida de credenciais, retenção, exclusão segura e conformidade LGPD. Superadministrador não recebe acesso privado irrestrito. Coletar somente conteúdo autorizado e relevante.

Entidades relacionais previstas: `tenants`, `users`, `memberships`, `roles`, `permissions`, `units`, `residents`, `funds`, `contribution_rules`, `monthly_charges`, `payment_transactions`, `payment_allocations`, `receipts`, `expenses`, `expense_categories`, `fund_movements`, `maintenance_records`, `maintenance_schedules`, `suppliers`, `supplier_categories`, `quotes`, `occurrences`, `announcements`, `decisions`, `documents`, `messages`, `message_attachments`, `ai_processing_records`, `ai_review_queue`, `notifications`, `approvals`, `audit_logs`, `integrations`, `integration_configs` e `automation_runs`. Todas as entidades do condomínio carregam associação segura com `tenant_id`, relações, índices, restrições e migrations.

## 13. Telas do produto

O produto completo prevê: login e recuperação; dashboard; financeiro; fundos; caixinha; contribuições; pagamentos; despesas; extrato; prestação de contas; manutenções; calendário; prestadores; orçamentos; ocorrências; comunicados; decisões; documentos; Inteligência ORBIA; Central de Revisão IA; bot WhatsApp; notificações; moradores; unidades; configurações do condomínio; usuários/permissões; automação; integrações; administração SaaS.

Cada tela deve ter navegação clara, estados carregando/vazio/erro/sem permissão e conteúdo adaptado ao perfil. A primeira fase pode implementar grupos de telas por etapas, sem declarar funcionalidades não implementadas como prontas.

## 14. Fases e critérios de aceitação

**Fase 1 — Fundação:** identidade, design system, autenticação, multi-tenant, condomínios, unidades, moradores, papéis, dashboard básico, banco, migrations e auditoria.

**Fase 2 — Financeiro:** fundos, Condomínio, Caixinha, contribuições, pagamentos, comprovantes, despesas, extratos, pendências, prestação de contas e relatórios.

**Fase 3 — Operação:** manutenções, histórico, calendário, prestadores, orçamentos, ocorrências, comunicados, decisões e documentos.

**Fase 4 — Inteligência:** ingestão, classificação, extração, contexto/memória, duplicidades, revisão humana e rastreabilidade.

**Fase 5 — Evolution+n8n:** entrada e saída, consultas, comandos, respostas, aprovação, alertas, workflows, logs e reprocessamento.

**Fase 6 — SaaS comercial:** planos, limites, administração global, onboarding, métricas, preparação para cobrança, monitoramento e escalabilidade.

O produto completo só será considerado funcional quando for possível criar condomínio/unidades/moradores, configurar contribuições e fundos, registrar pagamentos e despesas, consultar saldo e histórico, separar a Caixinha, registrar manutenção/prestador/orçamento/ocorrência/comunicado, importar ou receber informação por integração compatível, propor registros de teste via IA, detectar duplicidade, responder consultas/comandos permitidos, solicitar confirmação, registrar logs, isolar tenants, aplicar permissões, funcionar em celular e nunca misturar dados DEMO com reais.

Cobrir comportamento de pagamento completo, parcial, combinado, fundo individual pago com outro pendente, múltiplos meses, atrasos, excedentes, terceiros, comprovante duplicado, saída de ambos os fundos, estorno, correção, IA com baixa confiança/ambiguidade/duplicidade, webhook repetido, usuário sem permissão e tentativa de acesso cross-tenant.

## 15. Limitações e instruções de implementação

Separar o que está implementado, o que depende de credenciais e o que pertence a fases futuras. Não inventar integração conectada, dados reais ou autorizações. Não se limitar a telas simuladas. Não exigir formulários longos de moradores. Não apagar requisitos de produto ao limitar o MVP; registrar claramente a sequência de entrega. Manter módulos independentes e a arquitetura preparada para diversos tenants e para a integração Evolution API+n8n escolhida pela usuária.
