# Guia de estilo dos cosméticos

> **Status:** PROPOSTA, anexado à saga das Longas Noites (PEN-025). **Atualizado em:** 2026-11-22.
> **Fonte de verdade:** `packages/shared/src/game/cosmetics.ts`, `packages/shared/src/game/cosmetics-v2.ts`,
> `apps/client/src/scene/gen/cosmetics/`, `apps/client/src/scene/gen/cosmetics-v2.ts` e os
> `content/proposals/quests-v2/book-NN/cosmetics.csv`. Nada aqui é preço, compra ou promessa de venda.

## 1. Alcance

O catálogo tem 160 itens: 100 da v1, preservados como prefixo, e 60 dos livros, 6 por livro. Em cada livro, 3 são
gratuitos (2 marcos e 1 missão) e 3 são premium de catálogo. Cada slot termina com 16 itens: 10 da v1 e 6 dos
livros. A ordem por slot é contrato de rede: anexar ao fim, nunca reordenar, nunca inserir antes de um item de
livro. Premium é `unlock.kind: "paid"`, sem preço, sem checkout, sem compra e sem equipar. Jogar e doar continuam
separados.

## 2. Paleta e materiais

- Toda cor vem de `PALETTE` (`P`) ou de `V` em `apps/client/src/scene/gen/palette.ts`. Nenhum hexadecimal solto.
- `emissive` só para papéis de brilho: chama, janela, estrela, fio, aurora. O brilho não substitui a forma.
- Sem textura, texto, número, logo, marca ou personagem protegido. O modelo é voxel inteiro, sem detalhe pintado.
- Nome em pt-BR, curto e concreto. Id em inglês, kebab-case, estável para sempre.
- O item é uma camada sobre o avatar existente, não um avatar novo.

## 3. Orçamento e forma

- Limite por camada: 40 voxels e 140 faces, medidos por `measure` em `apps/client/src/scene/gen/budget.ts`.
- Coordenadas inteiras, na base do avatar; a âncora `attach` é um ponto nomeado em unidades de voxel.
- Um detalhe de um voxel tem pelo menos 0,20 u. Nada abaixo disso.
- A silhueta precisa ser legível no retrato e no avatar em jogo. Não cobrir os olhos, a boca ou o contorno do rosto.
- O alvo é `body` para as oito camadas do corpo e `armLeft`/`armRight` para as mãos. Não inventar um quarto alvo.
- Cada item é fixo. Não há variação por semente em cosmético; o snapshot de cada livro é a prova de estabilidade.

## 4. Dez slots

| Slot | Alvo | Âncora de exemplo | Regra de colocação |
|---|---|---|---|
| `helmet` | body | `[0, 9, 0]` | Acima da cabeça, sem cobrir os olhos. |
| `blouse` | body | `[0, 3, 0]` | Pinta o torso e as mangas; não cria saia. |
| `pants` | body | `[0, -3, 0]` | Pinta as pernas; não vira vestido. |
| `dress` | body | `[0, 0, 0]` | Torso e saia; substitui blusa e calça. |
| `shoes` | body | `[0, -3, 0]` | Dois sapatos espelhados nos pés. |
| `back` | body | `[0, 3, -1]` | Atrás dos ombros, no máximo 2 voxels além da largura do corpo. |
| `face` | body | `[0, 6, 2]` | Bochechas e testa; nunca uma máscara inteira. |
| `handLeft` | armLeft | `[0, -3, 0]` | Item seguro na mão esquerda. |
| `handRight` | armRight | `[0, -3, 0]` | Item seguro na mão direita. |
| `special` | body | `[0, 5, 0]` | Aura ou companheiro; não cobre o avatar. |

As âncoras são exemplos dos modelos já entregues. As 60 camadas dos livros mantêm suas âncoras atuais; este guia
não muda nenhum modelo.

## 5. Premium

- `unlock.kind: "paid"` é o único marcador. O objeto não tem `price`, `purchase`, `currency` ou botão de compra.
- Item pago nunca é desbloqueado, vestido, salvo no look nem enviado na presença. `isUnlockedIn` é sempre falso e
  `sanitizeLookIn` volta ao padrão do slot.
- O repositório mantém `SHOW_PAID_PREVIEWS = false` em `apps/client/src/ui/Wardrobe.tsx` (IMPL-0027, PEN-022): a
  vitrine de itens pagos fica oculta até a decisão do produto sobre o público menor de idade. O cânone da saga fala
  em mostrar "Visual pago" com prévia; a decisão do repositório vence e a diferença fica registrada no PR. Se o dono
  liberar a vitrine, o rótulo é "Visual pago" e o cartão é prévia, nunca compra.
- Doação não dá cosmético, XP, missão ou vantagem. Nenhum item é recompensa de doação.

## 6. Auditoria

O teste `apps/client/src/scene/gen/cosmetics-v2.audit.test.ts` lê os dez `cosmetics.csv` e prova:

- 6 linhas por livro, 60 no total, 3 grátis e 3 premium por livro.
- O id, o slot, o nome e o `premium` de cada linha batem com o módulo do livro; o `recompensa` grátis é o
  `unlock.missionId`; o pago é exatamente `{ kind: "paid" }`.
- O orçamento de cada linha é 40/140 e todo item tem modelo em `COSMETIC_MODELS_V2` dentro do mesmo limite.
- O catálogo tem 160 itens, o prefixo v1 é exatamente `COSMETICS` e cada slot tem 16 itens na ordem de livro.
- Nenhum pago desbloqueia ou equipa; não existe campo de preço.

O validador de fatia confere os mesmos 60 CSVs e os dez props:

```bash
node content/proposals/quests-v2/validate-slice.mjs --kind=art
```

## 7. Checklist

- [ ] Cor veio de `P`/`V`, sem hexadecimal solto.
- [ ] Nome em pt-BR e id em inglês kebab-case.
- [ ] Camada em 40/140 e detalhe mínimo de 0,20 u.
- [ ] Alvo `body`, `armLeft` ou `armRight` e âncora `attach`.
- [ ] Silhueta legível e rosto livre.
- [ ] Nenhum texto, logo, marca ou personagem protegido.
- [ ] Premium é `{ kind: "paid" }`, sem preço e sem compra.
- [ ] O item não é recompensa de doação.
- [ ] Slot e ordem de livro preservados; nada reordenado.
- [ ] Snapshot do livro atualizado e auditado.
