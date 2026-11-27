# Revisão jurídica e de conteúdo da saga v2

> **Status:** PROPOSTA, sempre ligada no runtime desde a IMPL-0037; a revisão jurídica e de conteúdo continua
> **PENDENTE**. Checklist, não parecer jurídico.
> **Atualizado em:** 2026-11-26.
> **Fonte de verdade:** `packages/shared/src/game/quests-v2/`, `content/proposals/quests-v2/`,
> `apps/client/src/scene/gen/quest-v2/`, `apps/client/src/scene/gen/cosmetics-v2.ts` e
> `docs/reference/cosmetics-style.md`.

## 1. Escopo e método

A revisão cobre as 484 entradas do manifesto da saga (330 narrativas dos Livros I a X, 120 marcos, 18 do epílogo,
12 do pós-jogo e 4 missões rápidas), as 330 falas de oferta e entrega, os 80 NPCs de quest, os 40 props de livro,
os 10 props de saga e os 60 cosméticos dos livros. O epílogo v1 foi conferido como catálogo existente, sem edição.

Método: leitura do cânone e dos textos, varredura por termos proibidos com `rg`, conferência dos testes de
acessibilidade e de orçamento já existentes e execução de `node content/proposals/quests-v2/validate-slice.mjs
--all` depois da correção do modo `--all`. A revisão não substitui leitura humana do jurídico nem aprovação do dono
do produto; é um checklist reproduzível.

Comandos principais (executados em 2026-11-26):

```bash
rg -n "Rudolph|Grinch|Frozen|Elf on the Shelf|Tetris|Pop It|Gemini|R\$|doe para ganhar|urgente|última chance|streak|diária|loot box|compre|preço|checkout|—" \
  content/proposals/quests-v2 packages/shared/src/game/quests-v2 \
  apps/client/src/scene/gen/quest-v2 apps/client/src/scene/gen/cosmetics-v2.ts
rg -ni "susto|medo|culpa|vergonha|morte|matar|sangue|violência|álcool|cerveja|vinho|namoro|beijo|aposta|sorte|prêmio|dinheiro|pagamento|comprar|vender|preço|desconto|promoção" \
  content/proposals/quests-v2 packages/shared/src/game/quests-v2 \
  apps/client/src/scene/gen/quest-v2 apps/client/src/scene/gen/cosmetics-v2.ts
node content/proposals/quests-v2/validate-slice.mjs --all
```

Resultado em 2026-11-26: `OK all: manifest=484 entries=11400 XP`. `pnpm check` também passou (typecheck, testes e
build). A prova de navegador da fatia 14 fica no PR que acompanha este relatório.

## 2. Checklist e resultados

| Item do checklist | Resultado | Evidência e decisão |
|---|---|---|
| Promessa de impacto real, valor arrecadado, número, meta ou resultado social | **Sem achado** | Nenhuma entrada promete valor, arrecadação ou resultado. A doação é explicada, nunca quantificada como conquista. |
| Recompensa por doar, comprar, convidar ou ficar online | **Sem achado** | XP e cosméticos vêm de missões, marcos e conclusão de minijogo. `Donation.tsx` registra a leitura do painel, não o pagamento. Não há missão de convite, sequência ou tempo online. |
| ONG, doador, parceiro ou pessoa real inventada | **Sem achado** | O elenco é fictício e está listado no cânone. Nenhuma ONG real, CNPJ, doador ou parceiro aparece nos textos. |
| Marca, personagem, letra, arte ou trecho de terceiro | **Sem achado** | A varredura de marcas e personagens não retornou acertos em conteúdo narrativo v2. Os links de `content/proposals/quests-v1/object-references.md` são referências de pesquisa, não assets embarcados. |
| Alegação médica, jurídica, financeira ou de saúde | **Sem achado** | Nenhuma entrada diagnostica, prescreve, promete cura, rendimento ou resultado jurídico. A receita sem açúcar de `b01-s5` é narrativa e não é conselho alimentar. |
| Pressão, urgência, medo, culpa, FOMO, aposta, loot box ou sorte | **Correção aplicada (baixa)** | “Medo” aparece como sentimento a superar (Pip, sino pequeno, Brasa, a Longa Noite), não como pressão para agir. “Susto” em `b01-s4` foi trocado por “com a ventania”. Não há aposta, loot box, sorteio com recompensa, contagem regressiva ou oferta por tempo limitado. O jogo da memória embaralha cartas, mas o resultado depende da memória e não sorteia prêmio. |
| Dado pessoal, texto livre, chat ou IA em tempo de jogo | **Sem achado** | Diálogo é texto fixo em pt-BR; não há campo livre, chat com jogador, LLM em tempo de jogo nem coleta de dado pessoal na saga. |
| Conteúdo inadequado para crianças: violência, susto, romance, álcool, morte em cena | **Correção aplicada (baixa)** | Não há violência, álcool, morte em cena nem romance. A única ocorrência de “susto” foi corrigida. “Cartas de amor” no epílogo v1 foi registrada como risco baixo aceito: é uma metáfora de carta antiga, não uma cena romântica, e o epílogo é catálogo existente. |
| Acessibilidade: objetivo claro, sem cor como único sinal, sem cronômetro, pausa, resumo e pular após três tentativas | **Conforme** | Os minijogos declaram `timed: false`, três dificuldades e `skipAfterAttempts: 3` em `minigames.ts`; `StoryGamePanel.tsx` mostra regra, dica, pausa, status textual e “Pular minijogo”. Os marcadores de NPC usam `?`, `!` e `...`, nunca só cor. Os objetivos dizem verbo e lugar. |
| Nomes, ids, números e siglas preservados | **Conforme** | O manifesto mantém 484 ids e 11.400 XP. `validate-slice.mjs --all` confere ids, contagens, pré-requisitos, regiões, XP, props e cosméticos. |
| Cosméticos premium sem preço, compra ou checkout | **Conforme, com nota ao dono** | Os 60 cosméticos dos livros usam `unlock.kind: "paid"` em 30 itens; não há preço, checkout, botão de compra ou equipar. O rótulo “Visual pago” e a palavra `paid` são catálogo e prévia. O dono deve confirmar o rótulo antes de ligar a v2. |
| Missões sempre ligadas, decisão registrada | **Conforme, com nota ao dono** | Desde a IMPL-0037 não há bandeira: o runtime está ligado em produção e homologação. A revisão jurídica e de conteúdo continua **PENDENTE** e o dono deve aprová-la antes de tratar a saga como conteúdo aprovado. |

## 3. Correções aplicadas

| Arquivo | Antes | Depois | Motivo |
|---|---|---|---|
| `packages/shared/src/game/quests-v2/books/book-01.ts` | `Então ele só perdeu a voz de susto.` | `Então ele só perdeu a voz com a ventania.` | Remover “susto” do texto para crianças, mantendo o sentido. |
| `packages/shared/src/game/quests-v2/books/book-01.ts` | `Dona Filó contou que o gato perdeu a voz de susto.` | `Dona Filó contou que o gato perdeu a voz com a ventania.` | Mesma correção no texto de conclusão da interação `talk-filo-cat`. |
| `content/proposals/quests-v2/book-01/dialogues.csv` | `perdeu a voz de susto` | `perdeu a voz com a ventania` | Manter o CSV espelhando o módulo. |

Nenhum teste assertava a frase antiga. O restante do conteúdo v2 não exigiu correção.

## 4. Riscos residuais e decisões do dono

| Risco | Gravidade | Decisão |
|---|---|---|
| “Patuá da sorte” e “sorte não se carrega, se planta” no epílogo v1 | Baixa | Narrativa, sem mecânica de sorte, aposta ou recompensa aleatória. Não editar o catálogo v1; o dono pode renomear antes de produção se preferir. |
| “Cartas de amor” em `story-page-delivery` (v1) | Baixa | Metáfora de carta antiga, sem cena romântica. Não editar o catálogo v1. |
| “Comprou a passagem” em `b05-c1-02` | Baixa | _Backstory_ de um passageiro, sem preço, checkout ou chamada para comprar. Não é oferta comercial. |
| “Medo” como tema recorrente | Baixa | Emoção de personagens que a história ajuda a superar; não é pressão, ameaça ou urgência. |
| Rótulo “Visual pago” / `unlock.kind: "paid"` | Baixa | Catálogo e prévia, sem compra. O dono e o jurídico devem confirmar o rótulo antes de ligar a v2. |
| Marcos sem contadores e props de estado sem desenho | Média (produto, não jurídico) | Fora desta revisão; registrado em `docs/reference/quests-v2.md` §7 como lacuna de código. Não afeta texto, marca ou dado pessoal. |

Nenhum risco alto ou crítico foi encontrado. Nenhuma ONG, doador, marca, personagem protegido, número ou promessa
social foi inventado. Nenhum pagamento, preço, checkout, loot box, aposta ou recompensa por doação existe no
conteúdo da saga.

## 5. O que este documento não é

Este documento é um checklist técnico de conteúdo e de produto. Não é parecer jurídico, não interpreta LGPD, ECA
Digital, direito do consumidor ou direito autoral e não autoriza publicação. O runtime está sempre ligado desde a
IMPL-0037, mas o dono do produto e o jurídico devem aprovar o catálogo, os XP, os cosméticos premium de catálogo e os
textos desta revisão antes de tratar a saga como conteúdo aprovado.
