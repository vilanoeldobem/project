<!-- Título em inglês, Conventional Commits — ex.: feat(game): add tic-tac-toe minigame. Corpo em pt-BR. -->

## O quê e por quê

<!-- Efeito para quem usa a Vila. Uma preocupação por PR. -->

## Referências

- Decisões/pendências do produto: <!-- DEC-NNN, PEN-NNN (vilanoeldobem/docs: docs/decisions/registro-de-decisoes.md) -->
- Cartão do acompanhamento: <!-- ex.: D03 -->
- ADR: <!-- IMPL-NNNN, se houver -->

## Status do que foi implementado

<!-- Marque o que é CONFIRMADO e o que é PROPOSTA/HIPÓTESE implementada de forma provisória. -->

## Validação

<!-- Cole a saída real. Se algo falhou ou não foi verificado, diga. -->

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `node apps/client/scripts/verify.mjs http://localhost:8799` (se o jogo mudou) — capturas desktop e celular anexadas
- [ ] `node apps/site/scripts/verify.mjs` (se o site mudou)
- [ ] `sh scripts/smoke-api.sh http://localhost:8787 http://localhost:8788 http://localhost:8799` (se API, servidor ou hosts mudaram)
- [ ] Migrations aplicadas no D1 local (se houver)

## Checklist

- [ ] Nenhum botão de doação/compra simula pagamento concluído
- [ ] Nenhum número público sem fonte verificável (exibir "—")
- [ ] Nenhum dado pessoal, segredo ou dado fictício de produção
- [ ] Nenhuma migration existente foi alterada
- [ ] Nenhum app importa outro; código comum em `packages/shared` (puro)
- [ ] Host trocado? `endpoints.ts` e `ALLOWED_ORIGINS` da API e do servidor mudaram juntos
- [ ] Código e comentários em inglês; documentação e textos de interface em pt-BR
- [ ] `docs/reference/` atualizado no mesmo PR
- [ ] `CHANGELOG.md` → `[Unreleased]` atualizado
- [ ] ADR criado se houve decisão técnica; pergunta de produto em `open-questions.md`
