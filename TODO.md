# TODO — ORBIA

Os estados abaixo refletem entregas com evidência no projeto. `Aberto` significa não concluído; não marcar como concluído antes de a funcionalidade correspondente existir e estar ligada ao fluxo real.

## Estado da primeira versão — 19/11/2026

Núcleo implementado: login Manus, tenants/memberships, cadastro de unidade/primeiro morador, dashboard, dois fundos, ledger com alocações, despesas/revisão, registros operacionais, triagem manual e webhook preparado. Evidências: 14 testes aprovados, build de separação aprovado, health pronto e três migrations aplicadas. Nenhum dado fictício foi inserido.

Não confundir critérios de produto completo abaixo com esta entrega parcial. Continuam abertos: contribuições/cobranças, comprovantes/uploads, relatórios, estornos, gestão de usuários, visão individual do morador, documentos, calendário, decisões, IA/bot e saída n8n. A autenticação completa do titular e a conexão real de Evolution/n8n ainda exigem validação interativa/configuração externa.

A revisão independente identificou idempotência opcional, alocação parcial opaca e fila sensível com autorização ampla; foram corrigidos. O limitador é básico por processo; HMAC, rotação/segredos individuais e operação distribuída permanecem futuros.

## 1. Fundação SaaS, identidade, autenticação e permissões — Aberto
- [ ] O produto se chama ORBIA e usa o slogan “Seu condomínio, conectado e inteligente.” Deve funcionar para condomínios com 2, 5, 10, 50, 100 ou mais unidades, sem limite fixo no código.
- [ ] Cada condomínio (tenant) tem nome, logo, endereço, configurações, unidades, moradores, usuários, administradores, fundos, registros, documentos, integrações e configurações próprios.
- [x] Um usuário pode pertencer a mais de um condomínio e ter permissões diferentes em cada um.
- [x] Toda consulta e mutação tenant-scoped valida no servidor a sessão, a membership, o tenant autorizado e as permissões; o tenant não é confiado apenas por um valor enviado pelo frontend.
- [ ] Implementar perfis de superadministrador da plataforma sem acesso irrestrito automático aos dados privados, administrador do condomínio, síndico, financeiro, conselho, morador e funcionário. Permissões podem distinguir consultar, criar, editar, aprovar, cancelar, excluir/arquivar, publicar, exportar e visualizar dados financeiros.
- [ ] Morador consulta apenas dados individuais e coletivos autorizados; não expor inadimplência individual dos outros sem regra/permissão explícita.
- [ ] Autenticação e sessão válidas no Preview; interfaces de login/logout e estados sem sessão não fingem usuário autenticado. Registrar a dependência do login Manus e o caminho futuro para provedor externo antes do lançamento SaaS independente.
- [ ] Preparar estrutura comercial futura para Orbia Start, Gestão, Inteligência e Pro, com limites futuros de unidades, usuários, armazenamento, IA, integrações, recursos, relatórios e automação; cobrança não precisa ser implementada agora.

## 2. Unidades, moradores e dashboard — Aberto
- [ ] Cadastrar casas, apartamentos, blocos e tipos diferentes de unidade; identificar unidade, bloco, proprietário, inquilino/morador, contatos, telefone, e-mail, status, observações e histórico.
- [ ] Permitir mais de um morador por unidade, proprietário e inquilino e morador temporário quando aplicável. Cada unidade tem histórico financeiro próprio.
- [x] O dashboard adapta-se a perfil e quantidade de unidades e apresenta resumo financeiro, operacional e de inteligência sem revelar dados não autorizados.
- [ ] O resumo financeiro contém saldo por fundo e total, receitas/despesas do mês, contribuições previstas/recebidas/pendentes; o operacional contém ocorrências abertas/urgentes, manutenções pendentes/próximas e orçamentos em análise.
- [ ] O resumo de inteligência diferencia mensagens processadas, informação extraída, registros em confirmação/revisão, incompletos, duplicidades possíveis e falhas de automação.
- [ ] Filtros de mês, ano e período; gráficos de receitas/despesas, evolução do saldo, gastos por categoria e histórico mensal quando houver dados; sem fabricar números para preencher gráficos.

## 3. Fundos, contribuições, pagamentos, despesas e trilha financeira — Aberto
- [ ] Iniciar com dois fundos independentes: “Condomínio” para despesas ordinárias e “Caixinha” como reserva coletiva. Cada fundo tem saldo, receitas, despesas, extrato, histórico, relatórios, regras e contribuições previstas; permitir novos fundos.
- [ ] Cada condomínio configura valor mensal, fundo de destino, unidade, vencimento, frequência, início, ajustes, isenções, valores diferenciados e histórico de alterações.
- [ ] Permitir pagamentos separados ou juntos em uma única transferência, parciais, atrasados, antecipados, por terceiros e de vários meses. Calcular valor esperado por mês e unidade.
- [ ] Por unidade, exibir esperado, recebido e pendente separadamente para cada fundo, total esperado/recebido/pendente, data, comprovante e status. Status: Pendente, Parcial, Pago, Atrasado, Isento, Aguardando identificação e Aguardando confirmação.
- [ ] Não tratar condomínio e caixinha como uma obrigação única. Um fundo pode estar pago enquanto o outro está parcial ou pendente.
- [ ] Uma transação recebida uma vez pode ter várias alocações analíticas por fundo; o total original nunca é duplicado. Suportar valor diferente, excedente, terceiro, sem unidade identificada, comprovante duplicado/sem contexto e ajuste de contribuição.
- [ ] Diferenciar comprovante recebido, pagamento identificado, pagamento lançado, pagamento confirmado e pagamento conciliado. Um comprovante enviado por morador não confirma recebimento bancário.
- [x] Não inventar unidade, mês de referência, distribuição ou valor quando pagamento é ambíguo; encaminhar para revisão humana.
- [ ] Cada despesa/retirada da Caixinha tem valor, data, motivo/justificativa, categoria, serviço, prestador, responsável, autorização, comprovante, nota/foto quando disponível, origem, mensagem original e saldo anterior/posterior. Não aceitar movimento definitivo sem motivo identificado.
- [x] Categorias incluem Limpeza de fossa, Caixa de gordura, Portão, Elétrica, Hidráulica, Jardinagem, Estrutura, Segurança, Material, Emergência e Outros.
- [ ] Valores monetários usam DECIMAL apropriado, nunca float. Não apagar movimento financeiro permanentemente; corrigir com estorno/ajuste/lançamento corretivo mantendo original, usuário, data, motivo e histórico.
- [ ] Idempotência e detecção de duplicidade impedem que o mesmo comprovante, mensagem ou transação seja contabilizado mais de uma vez.

## 4. Prestação de contas, extratos e relatórios — Aberto
- [ ] Extrato e prestação de contas têm filtros mensal, anual, período, fundo, categoria, tipo de despesa e prestador.
- [ ] Exibir saldo inicial, entradas, saídas, saldo final, esperado/recebido/pendências, despesas por categoria, manutenções e comprovantes permitidos ao perfil.
- [ ] Preparar exportação PDF, CSV e XLSX e relatórios compartilháveis respeitando permissões; não exportar dados de tenants diferentes.

## 5. Manutenções, prestadores, orçamentos, ocorrências e decisões — Aberto
- [ ] Manutenção registra nome, categoria, descrição, data, valor, fundo, prestador/contato, comprovante, fotos, observações, responsável, status, periodicidade, última realização e próxima data prevista.
- [ ] Status de manutenção: Necessária, Solicitada, Em orçamento, Aguardando aprovação, Agendada, Em andamento, Realizada, Paga e Cancelada. Consultar histórico, custos e próximas datas; estimativas são identificadas como estimadas.
- [ ] Prestadores registram nome, empresa, telefone/WhatsApp, categoria/serviço, quem indicou, data, mensagem de origem, orçamentos, histórico de serviços, avaliações, documentos e observações. Detectar duplicidade por nome/telefone/empresa sem apagar histórico existente.
- [ ] Orçamentos registram prestador, serviço, descrição, valor, data, validade, condições, anexo, status, observações e vínculo a manutenção/ocorrência; permitir comparar preços, prestadores, condições e validade.
- [ ] Ocorrências podem ser registradas por app, texto, foto, vídeo e áudio quando suportado; têm título, descrição, categoria, local, data, responsável, urgência, anexos, status, orçamento/manutenção relacionada, histórico e mensagem de origem. Detectar repetição e relacionar com ocorrência aberta apropriada.
- [ ] Estados de ocorrência: Aberta, Em análise, Aguardando orçamento, Aguardando aprovação, Agendada, Em andamento, Resolvida e Encerrada.
- [ ] Comunicados podem ser criados, editados, publicados, agendados, arquivados, anexados e enviados pelo canal disponível. Publicação oficial requer a autorização definida pelo condomínio.
- [ ] Decisões registram assunto, descrição, data, participantes, proposta, resultado, votos quando houver, resultado formal, origem, documentos e observações. Diferenciar sugestão, opinião, discussão, proposta, consenso aparente e decisão formal; discussão ambígua não vira aprovação automática.

## 6. Documentos, notificações, pesquisa e rastreabilidade — Aberto
- [ ] Central de documentos aceita comprovantes, notas fiscais, orçamentos, contratos, atas, comunicados, fotos e documentos administrativos; permite upload, visualização, download, classificação, tags, busca, vínculo a registros, controle de acesso e histórico.
- [ ] Documentos recebidos via integração só são vinculados após validação; anexos respeitam tenant e permissão.
- [ ] Notificações cobrem pagamento identificado/pendente, despesa, solicitação de aprovação, manutenção agendada/concluída, ocorrência nova/atualizada, orçamento, aviso, documento e falha de automação; usuário controla preferências.
- [ ] Busca global/natural pode localizar manutenções, despesas, prestadores, orçamentos, comunicados, ocorrências, decisões, documentos e pagamentos, com datas, links aos registros e checagem de permissão.
- [ ] Toda informação gerada por IA mantém mensagem original, remetente, data, canal, grupo, arquivo/ID, processo, resultado, confiança e histórico de revisão.

## 7. Orbia Inteligência e Central de Revisão — Aberto
- [ ] Classificar texto/arquivo/imagem/PDF/comprovante/orçamento/contato como pagamento, comprovante, receita, despesa, caixinha, manutenção, ocorrência, prestador, orçamento, aviso, decisão/votação, documento, evento, compra, agendamento ou conversa irrelevante, quando um modelo real estiver configurado.
- [ ] Extrair condomínio, usuário, unidade, data, valor, categoria, fundo, serviço, prestador, descrição, justificativa, status, prazo, anexos, referência e contexto sem inventar valor, data, pessoa ou autorização.
- [ ] Fluxo valida origem/tenant/usuário, classifica, extrai, procura registros relacionados, detecta duplicidade, avalia confiança, cria/atualiza/propoõe, solicita revisão quando necessário, registra origem e resultado.
- [ ] Confiança alta só automatiza categoria permitida; média cria rascunho; baixa pede esclarecimento; ambiguidade nunca confirma movimento financeiro definitivo.
- [ ] Central de Revisão IA permite revisar, editar, confirmar, aprovar, rejeitar, ignorar, relacionar com existente ou solicitar esclarecimento, registrando quem fez o quê e quando.
- [ ] Respostas de consulta vêm do banco e links reais; se não houver registro, responder que não foi encontrado. Não simular IA ligada ao banco quando estiver sem credenciais/modelo.

## 8. Evolution API + n8n (canal escolhido) — Aberto
- [x] Usar Evolution API com orquestração n8n conforme solicitação expressa. Não implementar a API oficial da Meta/WhatsApp Cloud API como provedor ORBIA.
- [ ] Receber mensagens/arquivos, identificar condomínio/usuário no servidor, interpretar e propor/atualizar registros conforme confiança e permissões; enviar consultas, avisos, alertas e solicitações de confirmação somente quando Evolution e n8n estiverem realmente configurados.
- [ ] O sistema continua funcionando sem WhatsApp; entrada manual e upload permanecem disponíveis. Exibir status “pendente de configuração” quando URL, chave, instância ou workflow não forem fornecidos/validados.
- [ ] Webhooks autenticados, payload validado, tenant não confiado ao evento, idempotência, logs, retries, timeout, erro, monitoramento, reprocessamento e histórico de execução.
- [ ] Não armazenar indiscriminadamente conversas privadas; processar apenas canais/mensagens autorizados e registrar origem.
- [ ] Bot Orbia Assistente aceita `/ajuda`, `/saldo`, `/caixinha`, `/pendencias`, `/pagamentos`, `/extrato`, `/manutencoes`, `/fossa`, `/gordura`, `/avisos`, `/contatos`, `/orcamentos`, `/ocorrencias` e `/resumo`, além de perguntas naturais; toda resposta consulta dados reais e respeita permissões.
- [ ] Pedido sensível por mensagem vira solicitação com autor, validade, origem, fundo/valor/motivo e estado de aprovação; somente usuário autorizado confirma; distinguir intenção, solicitação, autorização, pagamento e conclusão.
- [ ] Workflows n8n previstos cobrem entrada Evolution, identificação de condomínio/usuário, IA, pagamentos/comprovantes, fundos, manutenção, prestadores, orçamentos, ocorrências, comunicados/decisões, consultas/comandos, aprovação, envio de mensagens, relatórios, alertas, revisão humana, erros e reprocessamento.

## 9. Segurança, API, UX móvel e qualidade de dados — Aberto
- [ ] Implementar autenticação/sessão, RBAC, validação server-side, rate limiting, proteção de API/webhooks/arquivos, segredos fora do código e do frontend, logs, retenção e princípios LGPD.
- [ ] A API entre interface/backend/banco/Evolution/n8n valida identidade, tenant e permissão. Documentar endpoints de autenticação, tenants, unidades, moradores, fundos, contribuições, pagamentos, comprovantes, despesas, manutenções, prestadores, orçamentos, ocorrências, comunicados, decisões, documentos, IA, aprovações, notificações e relatórios.
- [ ] O sistema é mobile-first, com navegação simples, botões fáceis de tocar, formulários curtos, upload de câmera/comprovante e acesso rápido a saldos, pagamentos, pendências, manutenções, avisos e ocorrências; preparar PWA quando suportado.
- [ ] Implementar os estados importantes de interface: vazio, carregando, sucesso, erro, sem permissão e integração pendente. Nunca utilizar dado fictício como registro real; qualquer seed de demonstração identifica tenant e dados como `DEMO`.
- [ ] Usuários não acessam outro tenant; erros, reprocessamento e retrys não duplicam pagamentos/mensagens; logs não incluem segredos.

## 10. Princípios globais — Aberto
- [x] Nunca misturar fundo Condomínio e Caixinha.
- [x] Nunca contar pagamento duas vezes nem tratar comprovante como confirmação bancária.
- [x] Nunca consolidar despesa sem motivo identificado/revisão; nunca inventar valor, data, prestador ou autorização.
- [x] Nunca registrar discussão ambígua como decisão formal nem marcar serviço planejado como realizado.
- [x] Nunca executar ação sensível sem permissão; nunca confiar só no frontend; nunca permitir acesso entre tenants.
- [ ] Nunca apagar movimentação financeira sem histórico; preservar origem, auditoria, idempotência e revisão humana.
- [ ] Respeitar configuração de cada condomínio e manter valor útil do sistema mesmo sem Evolution/n8n/IA.

## 11. Entregáveis documentais — Concluído
- [x] `plan.md` registra arquitetura, separação de pastas, design, stack, fases, dependências e limitações.
- [x] `docs/revised-master-prompt.md` apresenta a especificação mestre revisada sem eliminar módulos futuros e inclui a escolha Evolution+n8n.
- [x] `docs/risk-review.md` prioriza riscos de segurança, financeiro, integrações, identidade, dados e operação com mitigação.
- [x] `docs/evolution-n8n.md` define contrato, variáveis/segredos necessários, fluxo de webhook, idempotência e status não configurado.
- [x] `docs/api.md` descreve endpoints efetivamente implementados e distingue-os de endpoints planejados.


## 12. Redesign responsivo: app financeiro jovem e profissional — Concluído (19/11/2026)
- [x] Deixar o design “mais jovial mas profissional e com cara de aplicativo como aplicativos de banco”, preservando o verde, símbolo e nome ORBIA; não copiar uma marca bancária específica.
- [x] Como o app “vai ser muito usado no celular”, fazer a navegação móvel parecer um aplicativo: barra superior com marca e seletor de condomínio, conta/perfil acessível, barra inferior fixa para rotas frequentes, áreas de toque confortáveis, safe-area do iPhone e conteúdo com rolagem sem ficar sob as barras fixas. Configurações e sair continuam alcançáveis no telefone.
- [x] Tornar os formulários adequados a celular: coluna única, campos e botões grandes, labels claras acima dos inputs, tamanho de entrada que evita zoom iOS, agrupamento curto, teclado correspondente ao tipo do campo, ações principais fáceis de alcançar, erros no contexto do campo. Não alterar nomes, ordem, validações ou comportamento financeiro protegidos.
- [x] Tabelas/listas financeiras são legíveis sem exigir scroll horizontal no celular e seguem tabelas mais densas/colunas no desktop; quando for seguro, apresentar cada registro móvel como cartão rotulado sem perder cabeçalhos semânticos.
- [x] Manter um layout de desktop “com cara de desktop”: sidebar fixa, cabeçalho, painéis em colunas e densidade de gestão próprias; não apenas esticar o layout do celular.
- [x] Adaptar o login mobile para acesso rápido sem scroll longo e conservar sua composição editorial no desktop.
- [x] Preservar todas as rotas, anchors, títulos, IDs, autenticação, papéis, acessibilidade, estados vazios e fluxos existentes. Continuar sem alterar backend ou misturar HTML, CSS e JavaScript; CSS em `frontend/css`, marcação em `.html`, lógica em `.js`, ícones em arquivos de asset.
- [x] Respeitar `prefers-reduced-motion`, contraste textual, foco visível, alvos táteis e áreas seguras do sistema. Nenhum dado fictício, função falsa ou ícone emoji.

**Nota de verificação:** os 14 testes, o checker, o build e o smoke HTTP foram aprovados; o login mobile foi capturado em 390 × 844. As páginas autenticadas não foram capturadas em navegador porque o Preview disponível não tinha sessão de teste; seus contratos foram revisados estaticamente, sem tocar no banco.

## 13. Reestruturação completa baseada nas referências — Implementado; publicação pendente
- [x] Nova paleta com cores mais vibrantes e joviais, mantendo aparência clean, contraste legível e cores semânticas de status.
- [x] Refatorar logomarca ORBIA: símbolo original mais simples e jovem, aplicado no login, cabeçalho, ícone e metadados; não copiar a marca Itaú.
- [x] Refatorar login com cara de aplicativo, removendo a composição de site editorial; manter autenticação real Manus sem fingir senha, biometria ou conta conectada.
- [x] Reestruturar início, financeiro, unidades, rotinas, revisão e configurações com hierarquia clara, atalhos grandes, listas limpas e criação sob demanda, sem telas abarrotadas de formulários.
- [x] No mobile, formulários em etapas curtas, voltar/cancelar, teclado apropriado, revisão editável antes de envio, ação principal acessível e feedback contextual; avançar etapa não registra nada no banco.
- [x] Seleção de condomínio/filtros em painéis inferiores acessíveis quando aplicável; extrato com filtros úteis somente para dados disponíveis e sem números inventados.
- [x] Desktop com sidebar, grades/tabelas e painel de entrada adequado a desktop; mobile com navegação inferior e safe-area, sem scroll horizontal obrigatório.
- [x] Preservar campos/IDs, autenticação, permissões, escopo de condomínio, regras financeiras, revisão/aprovação e idempotência. Não misturar frontend/backend nem CSS/HTML/JS; não inserir dados de teste no banco compartilhado.
- [ ] Corrigir atualização de assets com URLs versionadas para que cache não esconda o novo layout; guardar versão validada e publicar, conforme autorização de 02h45.

**Evidência de implementação:** símbolo gerado concluído e aplicado; login mobile 390 × 844 aprovado pela usuária e desktop 1280 × 800 capturado; 23 testes (14 de backend e 9 de DOM isolado) e build aprovados. Todos os IDs anteriores e conjuntos de nomes de campos dos 11 formulários foram comparados com `HEAD` e preservados. Backend, migrations e dados existentes não foram alterados; nenhum registro de teste foi inserido. Os hashes de CSS/JS e do sprite SVG estático/dinâmico já são gerados no build. Publicação só será confirmada após o resultado da plataforma.

**Revisão independente:** corrigidos refresh pós-POST (sucesso permanece mesmo que atualização da lista falhe), carregamento tardio dos fundos nas linhas de alocação já abertas e versionamento do sprite SVG. A chave idempotente financeira é liberada apenas depois da resposta de sucesso do POST, nunca após falha de envio; falha posterior no refresh não oferece reenvio e orienta a recarregar a lista. Testes de regressão isolados cobrem os dois primeiros casos.

## 14. Instalação PWA no celular — Implementado; publicação aguardando autorização
- [x] Manifesto próprio válido com nome ORBIA, identidade estável, escopo/início na raiz, tema Jade e exibição standalone; todas as páginas declaram o mesmo manifest e metadados Apple.
- [x] Ícones reais locais em PNG 192/512, maskable e Apple touch 180 derivados da marca aprovada, sem deformar nem cortar o símbolo.
- [x] Service worker registrado em contexto seguro e escopo raiz; página offline pública com orientação honesta de reconexão, sem guardar dados financeiros, sessões, documentos, HTML de gestão ou requisições de escrita.
- [x] Ação de instalar no login/configurações: prompt nativo quando disponível, instruções Safari no iPhone e fallback claro nos demais navegadores; não simular instalação nem manter CTA quando estiver em modo instalado.
- [x] Revalidação de worker/manifest e atualização sem interromper formulário aberto; manter camadas separadas, login real, papéis e regras financeiras existentes.
- [ ] Checkpoint validado e instruções de instalação entregues. Publicar somente se houver resposta autorizando esta atualização.

**Evidência técnica:** 38 testes aprovados (15 backend/HTTP, 9 fluxos, 5 instalação UI e 9 worker). Manifest e worker respondem HTTP 200 localmente com MIME e revalidação apropriados, worker permite escopo raiz. PNGs validados pelo cabeçalho e ícone Apple inspecionado; build determinístico e checker de separação aprovados. Sem novas dependências, migrations ou dados de teste no banco. Instalação física no iPhone requer a ação da usuária no Safari; não foi simulada como executada.

**Revisão independente concluída:** nenhum problema aberto identificado no escopo PWA. Revisados cache restrito, fluxo de instalação iOS/nativo, metadados em oito rotas, ícones, headers, hash de atualização determinístico e preservação do foco. Os 14 testes isolados PWA passaram; aceitação no aparelho físico não foi simulada. A versão será salva em checkpoint com esta evidência; publicação permanece condicionada à resposta ao cartão de autorização.
