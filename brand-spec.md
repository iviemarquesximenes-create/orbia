# ORBIA — identidade Jade + Lima

## Essência e linguagem

ORBIA é o aplicativo para cuidar das finanças, da rotina e da comunidade do condomínio com clareza. A identidade aprovada em 19/11/2026 às 02h51 substitui o verde profundo anterior: **jovial, próxima e confiável**. O slogan permanece “Seu condomínio, conectado e inteligente.” O nome, as regras de negócio, a rastreabilidade e os dados reais foram preservados.

A linguagem de interação é inspirada nas referências de aplicativo financeiro enviadas pela usuária, sem copiar a marca Itaú nem sugerir que ORBIA seja uma conta bancária. Textos curtos orientam ações: “Qual valor foi recebido?” e “Confira antes de concluir”. Comprovante não equivale a conciliação; solicitações e rascunhos continuam sujeitos às decisões autorizadas.

## Sistema visual

| Papel | Cor |
|---|---|
| Jade proprietário: topo e destaque | `#00B875` |
| Verde funcional: botões com texto branco | `#007D55` |
| Verde profundo: suporte | `#005D40` |
| Lima: seleção e pequenos acentos | `#D9F650` |
| Texto sobre jade/lima | `#122A23` |
| Texto secundário | `#5D6E66` |
| Fundo | `#F4F6F5` |
| Superfície | `#FFFFFF` |
| Borda | `#E1E7E4` |

Manrope é a fonte de interface e valores; IBM Plex Mono fica restrita a referências técnicas. Espaçamento em múltiplos de 8 px, cards de 20–24 px e controles principais de 56 px. Cor semântica sempre vem acompanhada de texto. Sem gradientes, números fictícios, emoji substituindo ícones ou fotos decorativas. Transições curtas respeitam movimento reduzido.

## Logomarca

O símbolo original é um O aberto, arredondado e conectado, em jade com ponto lima: encontro e entrada. O nome acompanha o símbolo como texto acessível; no login, o wordmark usa “orbia.” com ajuste tipográfico próprio.

O ativo local `frontend/assets/orbia-jade.webp` é servido em `/assets/orbia-jade.webp` no login, na navegação e no favicon, sem depender de armazenamento externo.

## Aplicação responsiva

No mobile, o topo jade reúne condomínio e conta; cinco destinos ficam na navegação inferior: Início, Financeiro, Unidades, Operação e Menu. Condomínios e filtros usam painéis inferiores. Criações não ficam expostas nas listas: abrem formulário em tela cheia, com passos curtos, voltar, revisão editável, confirmação e retorno. Datas, e-mail e telefone conservam controles nativos e teclados apropriados; valores financeiros não são convertidos com ponto flutuante.

No desktop, a sidebar branca, a grade, os cards e as tabelas mantêm densidade de gestão. Formulários usam modal central de 680 px, não um telefone esticado. Folhas separadas: `orbia.css` (tokens/base), `shell.css`, `components.css`, `pages.css` e `flows.css`.

O primeiro rascunho do login mobile foi aprovado às 03h04. Evidências visuais locais: `/home/ubuntu/.addon-screenshots/wdp_810ee8e2b1956cda938499a1/20261119-060408-kVacHQ/0-login_html.png` (390 × 844) e `/home/ubuntu/.addon-screenshots/wdp_810ee8e2b1956cda938499a1/20261119-060610-tiyK9w/0-login_html.png` (1280 × 800). Esses screenshots são registros de revisão, não assets carregados pelo site.
