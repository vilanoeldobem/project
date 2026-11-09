<!-- Título em inglês, Conventional Commits — ex.: feat(game): add tic-tac-toe minigame. Corpo em pt-BR. -->

## O quê e por quê

<!-- Efeito para quem usa a Vila. Uma preocupação por PR. -->

## Referências

- Decisões/pendências do produto: <!-- DEC-NNN, PEN-NNN (vilanoeldobem_docs: docs/decisions/registro-de-decisoes.md) -->
- Cartão do acompanhamento: <!-- ex.: D03 -->
- ADR: <!-- IMPL-NNNN, se houver -->

## Status do que foi implementado

<!-- Marque o que é CONFIRMADO e o que é PROPOSTA/HIPÓTESE implementada de forma provisória. -->

## Validação

<!-- Cole a saída real. Se algo falhou ou não foi verificado, diga. -->

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `node apps/web/scripts/verify.mjs` (se a interface mudou) — capturas desktop e celular anexadas
- [ ] Migrations aplicadas no D1 local (se houver)

## Checklist

- [ ] Nenhum botão de doação/compra simula pagamento concluído
- [ ] Nenhum número público sem fonte verificável (exibir "—")
- [ ] Nenhum dado pessoal, segredo ou dado fictício de produção
- [ ] Nenhuma migration existente foi alterada
- [ ] Código e comentários em inglês; documentação e textos de interface em pt-BR
- [ ] `docs/reference/` atualizado no mesmo PR
- [ ] `CHANGELOG.md` → `[Unreleased]` atualizado
- [ ] ADR criado se houve decisão técnica; pergunta de produto em `open-questions.md`
