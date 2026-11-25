# ORBIA como aplicativo no celular

O PWA usa a mesma aplicação, autenticação e permissões do ORBIA. Quando adicionado à tela inicial em um navegador compatível, abre em modo aplicativo com ícone próprio; não é um pacote nativo da App Store e não adiciona biometria ou notificações push por si só.

## Instalar no iPhone

Abra o endereço publicado do ORBIA no Safari, não apenas dentro do navegador do aplicativo Manus. Toque em Compartilhar — dependendo da disposição do Safari, essa ação pode estar no menu da página. Escolha **Adicionar à Tela de Início**, mantenha **Abrir como App da Web** ativado se essa opção aparecer e toque em **Adicionar**. A ação depende da versão do iOS e do navegador. Abra o ORBIA pelo ícone criado; o iPhone pode solicitar novo login nesse ambiente.

O botão de instalação dentro do ORBIA oferece essa orientação; não tenta disparar um prompt inexistente no Safari. Em navegadores que expõem `beforeinstallprompt`, usa o pedido nativo somente após o toque da pessoa. Em outros, orienta o menu do navegador. O aplicativo não afirma detectar uma instalação em outro navegador ou perfil. No modo `standalone`, esconde os botões de instalar.

## Privacidade e conexão

O service worker guarda apenas `/offline.html`, `/css/offline.css` e `/assets/pwa/icon-192.png`, todos públicos e sem dados de pessoas ou condomínios. As demais páginas e APIs dependem de internet. Nenhum saldo, sessão, token, documento, histórico ou formulário é armazenado no cache do service worker; nenhum POST é reenviado em segundo plano. A preferência de condomínio já existente no `sessionStorage` não é uma nova persistência de dados do PWA.

Navegações comuns tentam a rede e só exibem o aviso offline estático em falha de conexão. Respostas de erro de autenticação ou do servidor não são substituídas por dados em cache. As rotas da API, OAuth e infraestrutura são ignoradas pelo worker. Se o sistema remover o cache do aplicativo, um aviso textual genérico substitui a página offline, sem expor dados. As atualizações respeitam o ciclo natural de ativação, sem forçar recarga de formulários abertos. Fechar todas as janelas do ORBIA e abrir novamente permite ativar uma atualização pendente.

## Organização técnica

O manifesto `/manifest.webmanifest` pertence à aplicação, tem `id`, início e escopo `/`, tema Jade e display `standalone`. Todas as páginas declaram esse mesmo manifesto e os metadados Apple. Ícones PNG 192/512, maskable 512 e Apple touch 180 derivam da marca aprovada e têm fundo branco opaco. O worker raiz `/sw.js` é servido como JavaScript e revalidado. Cabeçalhos públicos de serving ficam no backend; interface, manifesto, worker, estilos e ícones ficam no frontend. Não há nova migration.

## Fontes consultadas em 19/11/2026

A Apple orienta Safari → Compartilhar → Adicionar à Tela de Início → Abrir como App da Web → Adicionar, com diferenças conforme a versão e disposição do navegador. [Guia oficial do iPhone](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).

A MDN descreve manifesto em todas as páginas, nome, ícones 192/512, `start_url`, `display`, HTTPS e instalação em modo standalone. Também confirma que o prompt disparado por `beforeinstallprompt` não é suportado no iOS. [Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
