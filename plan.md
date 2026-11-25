# Plano de implementação — ORBIA

## Objetivo e escopo

Construir uma primeira versão funcional do ORBIA, um SaaS multi-tenant de gestão condominial para condomínios de diferentes tamanhos. A experiência prioriza administradores, síndicos e responsáveis financeiros, mas adapta acesso e navegação para moradores. O MVP entregará fundação segura, unidades/moradores, dashboard, fundos e lançamentos financeiros básicos, manutenções, prestadores/orçamentos, ocorrências, comunicados e uma base de revisão/auditoria.

A plataforma será útil sem integrações externas. IA, Evolution API e n8n terão fronteiras e estados de configuração visíveis; não serão simulados como operacionais quando faltarem credenciais, workflows ou validação do ambiente. Dados demonstrativos, se incluídos, terão o tenant e a interface marcados explicitamente como `DEMO`.

## Requisitos aprovados e regras de negócio

- Cada registro do condomínio será vinculado a um tenant e toda autorização será aplicada no servidor. Um usuário pode pertencer a vários condomínios com papéis diferentes.
- Os fundos Condomínio e Caixinha permanecem independentes. Contribuições e pagamentos são acompanhados por fundo e unidade.
- Uma transferência é uma transação de origem única que pode ter várias alocações; o total recebido nunca será duplicado. Valores monetários usam `DECIMAL`, não ponto flutuante.
- Comprovante recebido não confirma dinheiro no banco. Pagamento ou despesa ambíguos, despesa sem justificativa e ação sensível ficam em revisão/aprovação.
- Lançamentos financeiros não são apagados. Estorno, ajuste ou correção preservam autor, data, justificativa e vínculo com o registro original.
- Manutenção planejada não é manutenção concluída; data sugerida não é data confirmada. Discussão não é decisão formal.
- Preservar origem, anexos disponíveis, histórico de edição e trilha de auditoria. Reprocessamento precisa ser idempotente.
- A integração de mensagens desejada é **Evolution API através do n8n**, não a API oficial da Meta/WhatsApp Cloud. O frontend não terá chaves. Eventos e credenciais não configurados serão apresentados como pendentes; o núcleo do produto não dependerá deles.
- Login inicial de desenvolvimento usa a identidade Manus, com autenticação e autorização no backend. A dependência e o ponto futuro de troca por um provedor externo devem ficar documentados para o SaaS comercial.

## Abordagem técnica

O projeto é um servidor Node.js 22/Express que hospeda arquivos estáticos e uma API `/api`. O PostgreSQL gerenciado pelo Supabase é acessado exclusivamente pelo backend. O stack é JavaScript sem JSX para cumprir a separação pedida. O gerenciador será pnpm 11.25.0, versão presente no ambiente, com política `allowBuilds` explícita e dependências fixadas por lockfile.

### Fronteiras de código

- `frontend/`: arquivos `.html` apenas com marcação semântica; `frontend/css/` para todo CSS; `frontend/js/` para todo JavaScript do navegador; `frontend/assets/` para marca e ícones. Não inserir `<style>`, handlers inline ou blocos de lógica dentro de páginas HTML; `<script src="…">` apenas referencia arquivos JavaScript externos. Não usar JSX.
- `backend/`: Express, rotas, middlewares de autenticação/tenant/permissões, serviços, repositórios SQL, integração, auditoria e tratamento de erros. Não incluir HTML/CSS de interface nesse diretório.
- `database/supabase/`: schema PostgreSQL versionado e políticas RLS; `database/legacy-mysql-migrations/` preserva migrations históricas não usadas pela API atual. `database/seeds/` só terá dados DEMO opt-in e claramente identificados.
- `docs/`: especificação mestre revisada, análise de riscos, pesquisa de integração e contrato de API.
- `frontend/manus-routes.json`: inventário sincronizado de rotas de página servidas.

### Banco e autorização

O schema relacional começa por tenants, users/memberships/roles, units/residents, funds, contribution rules/charges, payment transactions/allocations, receipts, expenses, fund movements, maintenance records/schedules, suppliers, quotes, occurrences, announcements, documents, decisions, AI review records, approvals, notifications, integrations e audit logs. Todas as tabelas tenant-scoped carregam `tenant_id`, FKs e índices apropriados. Middleware deriva o tenant permitido da sessão e da membership no servidor; não aceita tenant arbitrário enviado pelo navegador. Operações de ledger são transacionais e preservam a entrada original e as alocações.

### Contratos de integração

- Evolution/n8n entra por adaptador. Um endpoint de webhook validará token/HMAC configurado, payload, origem e chave de idempotência; não confiará em `tenant_id` livre do evento. Mensagens recebidas criam registros de origem e itens de revisão, sem confirmar automaticamente movimentos financeiros.
- O serviço de saída para Evolution permanecerá desabilitado até existirem URL, credencial e configuração de instância válidas. Segredos só no servidor e nunca em commits ou HTML. Os endpoints externos serão documentados.
- Não incluir automação efetiva, envio de mensagens ou leitura indiscriminada de conversas em ausência de configuração. A integração continuará substituível.

## Estrutura do projeto

```text
orbiaapp/
├── frontend/
│   ├── index.html                 # Dashboard
│   ├── pages/                     # HTML estático para módulos
│   ├── css/                       # Tokens, base, layout e componentes responsivos
│   ├── js/                        # Navegação, API client e lógica de interface
│   ├── assets/                    # Logotipo e ícones exportados
│   └── manus-routes.json          # Rotas HTML do Preview
├── backend/
│   ├── src/
│   │   ├── app.js                 # Middleware e montagem das rotas
│   │   ├── server.js              # Startup e readiness
│   │   ├── routes/                # REST endpoints
│   │   ├── middleware/            # Sessão, membership, tenant, RBAC, validação
│   │   ├── services/              # Domínio financeiro, manutenção, Evolution/n8n
│   │   ├── repositories/          # Consultas PostgreSQL parametrizadas
│   │   └── lib/                   # Configuração, erros e helpers
│   └── test/                      # Testes de domínio e autorização
├── database/
│   ├── supabase/                  # Schema PostgreSQL e políticas RLS
│   ├── legacy-mysql-migrations/   # Histórico, não usado pela aplicação
│   └── seeds/                     # Dados DEMO opt-in
├── docs/
│   ├── revised-master-prompt.md
│   ├── risk-review.md
│   ├── evolution-n8n.md
│   └── api.md
├── package.json                   # Scripts e packageManager pinado
├── pnpm-lock.yaml
├── pnpm-workspace.yaml            # Política de scripts de instalação
├── Dockerfile                     # Runtime publicado quando configurado
├── .env.example                   # Somente nomes e valores fictícios de exemplo
├── .gitignore
├── plan.md
└── TODO.md
```

## Direção visual aprovada — identidade e redesign

**Design Read:** app web de gestão condominial para síndicos, administradores, financeiro, moradores e funcionários; SaaS B2B de serviço comunitário; redesign preservando identidade e arquitetura, com linguagem de aplicativo financeiro preciso, profissional, acolhedor e jovial. Dials: variação visual 5/10, movimento 3/10, densidade 6/10 desktop e 4/10 mobile, assets 3/10 e fidelidade de marca 9/10.

**Movimento e princípios:** interface editorial para sistemas de serviço, unindo precisão de livro-caixa a uma sensação residencial acolhedora. 1) Clareza financeira antes de decoração; 2) contexto e origem sempre visíveis; 3) densidade progressiva por perfil; 4) uma identidade própria, sem ruído de painel genérico.

**Paleta:** verde profundo `#15534C` como cor proprietária e de ação; grafite `#202B29` para texto; superfícies `#FFFFFF` e fundo fresco `#F2F6F3`; verde suave `#B8D9CC` e mint `#EEF7F1` para destaque positivo; âmbar `#D69A52` para atenção; vermelho `#B95049` apenas para erros; borda `#E3EBE5`. Paleta reforça confiança e proximidade sem usar gradientes decorativos.

**Tipografia:** Manrope para títulos e interface, com fallback sans-serif robusto; IBM Plex Mono apenas para IDs, referências e valores que exijam alinhamento. Hierarquia clara e corpo confortável em telas móveis.

**Layout responsivo:** desktop preserva navegação lateral persistente, cabeçalho com tenant/perfil, painéis em colunas e tabelas de gestão. Mobile funciona como app bancário: barra superior fixa com marca, condomínio selecionável e acesso de conta; navegação inferior fixa com cinco rotas principais; configurações/saída na área de conta; conteúdo de rolagem independente, safe-area e ações importantes ao alcance do polegar. O tab ativo tem indicador visual e nome legível. Não reduzir o desktop a uma tela esticada de celular, nem comprimir o app móvel em um dashboard desktop.

**Formulários mobile:** campos em coluna única, rótulos visíveis acima, áreas de toque de pelo menos 48 px, inputs de texto com 16 px para evitar zoom automático no iOS, valores monetários em destaque, teclado semântico por tipo, seletor nativo para data/telefone/e-mail, agrupamento em blocos curtos, mensagens de validação junto do campo e botão principal amplo. Alocações financeiras empilham fundo, mês e valor; nenhuma tabela deve obrigar a rolagem horizontal para ler pagamentos essenciais. Desktop mantém grades compactas, múltiplas colunas e tabelas convencionais.

**Login responsivo:** desktop conserva composição editorial dividida; mobile compacta a narrativa e prioriza acesso e botão de autenticação sem exigir rolagem longa.

**Assinaturas:** símbolo ORBIA com anéis de conexão formando uma moradia abstrata (gerar ativo de marca; não usar logo de template); trilhas finas que indicam histórico e origem; pequenos selos de estado com cor semântica e texto explícito. Avatar do assistente usa o mesmo símbolo, sem personagem genérico.

**Interação e movimento:** transições de 160–220 ms, feedback de foco/hover/press e estados de carregamento/vazio/erro; reduzir movimento por `prefers-reduced-motion`; confirmação antes de ações irreversíveis; formulários progressivos e curtos; nenhuma animação essencial à compreensão.

**Essência e voz:** “A gestão do condomínio em ordem, com o histórico à vista.” Personalidade: confiável, clara, próxima. Chamadas diretas e úteis, por exemplo: “Veja o que mudou neste mês” e “Toda movimentação tem origem e histórico”.

## Fases de entrega

1. **Fundação e MVP:** estrutura, login Manus real, tenant/membership/RBAC, criação/seleção de condomínio, unidades/moradores, dashboard sem números falsos, fundos, pagamentos/alocações, despesas auditáveis, manutenções, prestadores/orçamentos, ocorrências/comunicados e revisão manual. Entregar páginas utilizáveis e endpoints persistentes.
2. **Expansão operacional:** documentos/anexos, calendário avançado, decisões, busca global, relatórios/exportações e preferências de notificação.
3. **Inteligência controlada:** ingestão manual/por webhook, classificação, extração com confiança, detecção de duplicidade, proposta de registros e revisão humana.
4. **Evolution + n8n:** configurar instância e workflows do cliente; receber eventos autorizados, comandos e perguntas; consultas com RBAC; envio de respostas e notificações conforme aprovação. Requer credenciais e workflows n8n acessíveis.
5. **SaaS comercial:** onboarding self-service, planos/limites, provedor de identidade externo quando escolhido, monitoramento e política de retenção.

Nenhuma fase posterior será descrita como concluída se não estiver implementada e configurada. A implementação deve preservar os requisitos do produto completo; reduzir escopo do MVP não elimina os módulos posteriores.

## Riscos de produto a refletir na implementação

- Escopo extenso: priorizar núcleo com ledger e RBAC, sem empilhar telas sem comportamento real.
- Autenticação Manus atende Preview e desenvolvimento, mas precisa de avaliação/troca antes de vender o SaaS para moradores sem conta Manus.
- Instância Evolution, rede pública e workflows n8n pertencem ao ambiente da usuária; validar alcance e credenciais só quando forem fornecidos. A Evolution API documenta webhooks e credenciais sensíveis; chaves não entram no código nem no navegador.
- Dados de movimentação devem suportar auditoria, idempotência e alocações sem duplicação.
- Desenvolvimento e produção compartilham o banco gerenciado do projeto; migrations são aditivas e seed é opt-in, sem sobrescrever dados do usuário.
- O sistema deve declarar com clareza quais integrações estão aguardando configuração e quais ações exigem aprovação.

## Registro de redesign — 19/11/2026

**Modo:** Redesign · Preserve. **Preservar:** símbolo e verde ORBIA, tipografia, conteúdo em português, rotas, IDs/âncoras, nomes e ordem dos campos, semântica acessível, regras/autorizações, callbacks JS e dados reais. **Melhorar:** hierarquia e vitalidade controlada; casca mobile nativa com tab bar inferior, seletor do condomínio no topo, área de conta e safe-area; formulários verticais e fáceis de tocar; listas financeiras sem scroll lateral; desktop com sidebar e densidade informativa própria. **Remover:** drawer lateral como única navegação de celular, inputs de 42 px/11 px no mobile, colunas comprimidas e tabela mínima de 650 px que força scroll horizontal no telefone. **Risco principal:** sobreposição da barra fixa e ocultação de conteúdo/ações em iPhone; compensar com `env(safe-area-inset-bottom)`, espaçamento de rolagem e manter acesso visível aos controles. **Fallback:** alterações mobile em overrides de breakpoint e componentes aditivos; restaurar folha anterior pelo commit se regressão visual/funcional.

**Design Read:** app web multi-tela de gestão condominial usado frequentemente em celular; público de síndicos, financeiro, moradores e funcionários; linguagem de aplicativo financeiro confiável, com energia acolhedora e comunidade; modo preservação; variação visual 5/10, movimento 3/10, densidade informacional 6/10 desktop e 4/10 mobile com camadas, dependência de assets 3/10 e fidelidade à marca 9/10.

**Perguntas de posicionamento:** papel narrativo = saldo e próximas ações em primeiro plano; distância = telefone na mão (toque de 48 px) e laptop (densidade de gestão); temperatura = alegre, segura e humana; capacidade = 390 px sem zoom/scroll horizontal, desktop 1280 px com sidebar/grade e tabela.

**Sistema visual proposto:** verde proprietário `#15534C`, verde-escuro `#103D38`, superfície `#FFFFFF`, fundo suavemente fresco derivado do off-white, mint de marca `#B8D9CC` e tons apenas mais claros/escuros dessa família; âmbar `#D69A52` e coral `#B95049` permanecem semânticos. Manrope mantém identidade; IBM Plex Mono só para dinheiro/IDs. Base de espaçamento 4/8 px; cartões 18–22 px; controles mobile 52 px; bordas suaves, sombra curta, ícones de linha externos ao HTML inline; transições de 160–200 ms e respeitando movimento reduzido. Acento de energia vem de mint/contraste e composição, não de gradiente genérico ou alteração de logo.

## Referências técnicas consultadas

- Documentação Evolution API v2: configuração de webhooks, com eventos como `MESSAGES_UPSERT` e `CONNECTION_UPDATE`: https://evolution-74046672.mintlify.app/v2/en/configuration/webhooks
- Repositório oficial Evolution Foundation: arquitetura com múltiplos conectores, autenticação por `apikey` e suporte a Webhooks: https://github.com/evolution-foundation/evolution-api
- Nota de pesquisa inicial sobre WhatsApp: `/home/ubuntu/orbia_research.md` (a implementação não usará WhatsApp Cloud API oficial, conforme instrução posterior da usuária).

## Reestruturação completa — APROVADA em 19/11/2026 às 02h51

Esta seção substitui a direção visual anterior. Jade + Lima foi explicitamente aprovada pela usuária às 02h51. Modo **Redesign · Overhaul**: a usuária pediu explicitamente nova paleta mais vibrante, nova logomarca, login app-like e reestruturação completa baseada nas 18 referências do Itaú que enviou. Usar sua gramática de interação, sem copiar logotipo, cores proprietárias ou reproduzir serviços bancários inexistentes.

**Design Read:** aplicativo condominial financeiro, telefone na mão e estação desktop; experiência fintech humanista; variação 6/10, movimento 4/10, densidade 4/10 mobile e 7/10 desktop, assets 4/10, fidelidade 5/10 (nome e produto preservados, símbolo/paleta renovados por solicitação). Papel narrativo = ação e saldo primeiro; distância = toque 48–56 px / desktop 1280 px; temperatura = energizada e limpa; capacidade = uma tarefa por tela no telefone e gestão simultânea no desktop.

**Sistema proposto:** jade vibrante `#00B875`, verde profundo funcional `#007D55`, lima `#D9F650` somente como acento e texto escuro `#122A23`; branco `#FFFFFF`, fundo neutro `#F4F6F5`, borda `#E1E7E4`; sucesso/alerta/erro com texto explícito e contraste AA. Maioria da tela branca/neutra, cor concentrada no topo, estado ativo e ações. Manrope para a interface e valores destacados; IBM Plex Mono restrita a referências técnicas. Base 8 px; cartões 20–24 px, campos 12–16 px ou linha inferior no fluxo guiado, controles 56 px. Sombras curtas apenas para camadas/painéis. Transições 180–220 ms e preferência de movimento reduzido.

**Marca:** símbolo compacto de um O aberto/conectado que sugere encontro e uma entrada, jade com pequeno acento lima; desenho simples reconhecível a 24 px, sem detalhes finos, gradiente ou logo de banco. Ativo original por geração AI, wordmark ORBIA tratado tipograficamente no HTML. Usos: login, shell, favicon e metadados da plataforma.

**Reestruturação:** início com cabeçalho de conta/condomínio, atalhos grandes, fundos independentes e atividade; financeiro separa overview/extrato de entrada/saída, com filtros apenas sobre dados efetivamente carregados; rotinas apresentam listas e ações de criação sob demanda em vez de cinco formulários abertos. No mobile, formulários entram em jornada em tela cheia: etapas curtas, voltar/cancelar, labels visíveis, revisão editável antes do submit existente, feedback de sucesso/erro. Seleção de condomínio e filtros em painel inferior acessível quando aplicável; datas/telefone mantêm controles nativos. Desktop mantém sidebar, grades e tabelas e usa painel/modal confortável para entrada, sem virar app de celular esticado. Login elimina bloco editorial e prioriza marca, saudação curta e autenticação real existente.

**Preservar:** backend/API, RBAC, tenant scoping, migrations e dados reais, nomes/IDs dos formulários e campos, idempotência e semântica financeira. Reorganizar a apresentação não confirma banco, não publica comunicado automaticamente e não insere demonstrações. Revisão na interface não substitui autorização no servidor. Separação obrigatória HTML/CSS/JS e frontend/backend permanece.

**Organização:** manter `frontend/pages/`, controladores de domínio e `frontend/assets/`; substituir CSS acumulado por folhas organizadas (tokens/base, shell, componentes, páginas e fluxos); novo controlador de fluxos separado dos controladores financeiros/operacionais; templates HTML sem lógica inline. Versionar URLs de assets pelo conteúdo/build para impedir que cache antigo esconda alterações. Metadados da marca atualizados. Sem migration necessária.

**Risco e fallback:** fluxo guiado não pode disparar submit ao avançar nem perder dados ao voltar, e deve restaurar foco/rolagem ao fechar. Valores permanecem strings decimais. Histórico Git preserva a versão anterior; correção ou rollback por novo commit, sem reescrever main. Publicação desta nova versão está autorizada na resposta atual da usuária; não ativar auto-publish.

**Aprovação do rascunho:** a usuária viu o login Jade + Lima em 390 × 844 e respondeu às 03h04: “Sim, finalize e publique nessa linguagem”. O login desktop usa duas áreas complementares; o mobile usa uma composição vertical de aplicativo. A implementação mantém 11 formulários com os IDs e nomes de campos anteriores, migra as criações para diálogos e inclui hashes de conteúdo nas URLs de CSS/JS no build. Testes de DOM isolados não executam autenticação fictícia nem escrevem no banco compartilhado.

## Extensão PWA — 19/11/2026 às 03h18

A usuária solicitou tornar o ORBIA instalável no celular como aplicativo. Extensão da interface Jade + Lima, sem novo redesign: manifesto próprio em `/manifest.webmanifest`, identidade estável `/`, início `/`, escopo `/`, display `standalone`, ícones locais PNG 192/512, maskable e Apple touch 180, metadados Apple em todas as páginas. Os ícones são redimensionamentos/adequações técnicas do símbolo existente, sem criar outra marca. Manter HTML, CSS e JavaScript separados e frontend/backend separados.

O navegador registra `/sw.js` em escopo raiz somente em contexto seguro. O service worker não armazena APIs, respostas autenticadas, HTML das páginas de gestão, cookies, anexos, tentativas financeiras ou submissões; não fará background sync nem replay de POST. Cache estritamente limitado a página offline pública genérica, CSS offline e ícones públicos conhecidos. Navegação tenta a rede e, em falha, mostra aviso offline sem dados de condomínio, com ação de tentar novamente. Nenhuma promessa de consultar saldo ou cadastrar offline.

A interface de instalação aparece no login e nas configurações: usa o prompt nativo quando disponível e mostra instruções adaptadas quando não disponível. No iPhone, a instalação é uma ação da própria pessoa no menu do Safari; no modo instalado, esconder CTA de instalação e não simular instalação. Atualizações do service worker aguardam ativação natural para não interromper formulários em andamento; arquivos de worker/manifest/offline com revalidação. `application_owned` configura a plataforma a não injetar manifesto concorrente; ativar após a versão com links próprios estar entregue. O backend muda apenas cabeçalhos/serving dos recursos públicos PWA, não autenticação, RBAC, banco ou regras financeiras.

A publicação do suporte PWA foi perguntada separadamente, de forma não bloqueante, em 03h19. Não tratar a publicação anterior como autorização automática para esta versão.

**Evidência PWA:** contrato validado por testes de HTTP, DOM e VM (sem banco/rede do usuário), geração de cache por hash determinística e cabeçalhos de revalidação. Visibilidade atual do site consultada apenas para compatibilidade dos recursos públicos, sem alteração de acesso. O worker é registrado somente em contexto seguro top-level, não dentro do Preview em iframe. Nenhum prompt de notificação, permissão de câmera, localização ou background sync é adicionado pelo PWA.
