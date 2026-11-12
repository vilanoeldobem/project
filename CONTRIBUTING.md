# Contribuindo com a Vila Noel do Bem

> **Atualizado em:** 2026-11-10 · Aplica-se a pessoas e a agentes de código. As regras não negociáveis para
> agentes estão em [`AGENTS.md`](AGENTS.md) e prevalecem em caso de conflito.

## Antes de começar

1. Leia [`docs/README.md`](docs/README.md) para saber onde cada coisa está documentada.
2. Leia [`docs/specs/README.md`](docs/specs/README.md): o produto é definido no repositório
   `vilanoeldobem/docs`. Toda mudança de produto cita a decisão relacionada (`DEC-NNN`) ou a pendência (`PEN-NNN`).
3. Consulte [`ROADMAP.md`](ROADMAP.md) e o cartão correspondente no acompanhamento (Kanban/Gantt): trabalho fora
   do marco corrente precisa de justificativa.
4. Distinga **CONFIRMADO**, **PROPOSTA**, **HIPÓTESE** e **PENDENTE**. Não implemente proposta como se fosse decisão.

## Ambiente

Node.js ≥ 22, pnpm 10 (`packageManager` na raiz), Chrome instalado (verificação visual) e `wrangler` (vem
como dependência). Passo a passo em [`docs/getting-started.md`](docs/getting-started.md).

## Gates obrigatórios

Todos devem passar antes de considerar qualquer mudança pronta:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Mudanças visíveis na interface também passam por `node apps/client/scripts/verify.mjs http://localhost:8799`
(desktop 1440×900 e celular 390×844), com API, servidor e jogo rodando localmente
([getting-started](docs/getting-started.md)); mudanças no painel administrativo, por `node apps/dash/scripts/verify.mjs`.
Resultados são relatados como são: se algo falhou, diga o quê e com que saída.

## Fluxo de mudança

1. Mudanças pequenas e focadas; uma preocupação por PR. Branch a partir de `main` (`feat/…`, `fix/…`, `docs/…`).
2. Código novo vem com testes ao lado do código (lógica pura em `packages/shared/src/**/*.test.ts`; API em
   `apps/api/src/*.test.ts`; servidor em `apps/server/src/*.test.ts`).
3. Atualize a referência afetada em `docs/reference/` **no mesmo PR**.
4. Adicione uma linha em `[Unreleased]` do [`CHANGELOG.md`](CHANGELOG.md) descrevendo o efeito para quem usa
   (*Added*, *Changed*, *Deprecated*, *Removed*, *Fixed*, *Security*).
5. Decisão técnica nova ou revertida → ADR em `docs/decisions/` (`IMPL-NNNN`, MADR simplificado).
6. Pergunta que só o dono do produto pode responder → linha em `docs/decisions/open-questions.md`; não decida por ele.
7. Revisão de outro integrante antes de entrar na `main` (proposta do README da documentação, a alinhar com a equipe).

## Regras de produto e arquitetura (resumo)

- Nenhum botão de doação ou compra simula pagamento concluído (IMPL-0002).
- Indicador sem fonte verificável é `null` na API e "—" na tela (DEC-027).
- Missões e XP idempotentes por id de evento; doação sozinha não dá XP (DEC-042).
- Um Worker por app ([IMPL-0009](docs/decisions/0009-split-client-api-server-shared.md)); apps nunca importam uns
  dos outros e o código comum fica em `packages/shared` (puro). D1 é o único banco persistente do servidor; os bytes dos arquivos de ONG ficam num bucket R2 privado (IMPL-0017).
- Migrations em `migrations/NNNN_nome.sql` são imutáveis depois de aplicadas no remoto.
- Nunca registrar em log dados pessoais, e-mails, tokens ou documentos de ONGs. Nada de credenciais no repositório.

## Mensagens de commit e títulos de PR

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/pt-br/v1.0.0/):
`tipo(escopo): descrição no imperativo`. Tipos: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`,
`ci`, `chore`. Escopos: `client`, `api`, `server`, `shared`, `site`, `dash`, `scene`, `ui`, `game`, `db`, `docs`, `release`. Quebras de contrato
(API, schema) levam `!` e rodapé `BREAKING CHANGE:`. O corpo explica o porquê e cita `DEC-`/`PEN-`/`IMPL-`.

```text
feat(game): add Jogo da Velha minigame

Second game from the catalogue (P09, DEC-034). Completion feeds the
"Brincar" track; no link to donations.

Refs: DEC-034, doc 23 D24
```

## Proibido sem autorização humana explícita

`git push` direto na `main`, `git reset --hard`, `git clean`, deploy de produção, migrations remotas, criação
ou remoção de recursos Cloudflare, alteração de secrets, integração de pagamento/OAuth.

## Checklist de revisão

- [ ] Gates verdes e verificação visual executada quando a interface mudou
- [ ] Testes cobrem o comportamento novo e o caso de erro
- [ ] Referência em `docs/reference/` atualizada
- [ ] `CHANGELOG.md` em `[Unreleased]` atualizado
- [ ] ADR criado/atualizado se houve decisão técnica
- [ ] Decisões de produto citadas (`DEC-`/`PEN-`); nenhuma proposta apresentada como aprovada
- [ ] Nenhum segredo, dado pessoal ou dado fictício de produção
- [ ] Commit e título do PR em Conventional Commits, em inglês
- [ ] Código (inclusive comentários) em inglês; documentação e textos de interface em pt-BR

## Idioma ([IMPL-0004](docs/decisions/0004-english-code-portuguese-docs.md))

| O quê | Idioma |
|---|---|
| Conversa com agentes de código (pedidos e respostas), `AGENTS.md`, `CLAUDE.md`, `tasks/todo.md` | inglês (en-US) |
| Código: identificadores, comentários, testes, schema, estados, ids, chaves de API, logs, scripts | inglês (en-US) |
| Commits e títulos de PR | inglês (en-US) |
| Documentação: `docs/`, README, CONTRIBUTING, CHANGELOG, ROADMAP, modelo de PR | português (pt-BR) |
| Textos de interface e campos `label`/`note` da API | português (pt-BR) |

A grafia do produto é "Vila Noel do Bem". Não use nomes de outros produtos, empresas ou projetos no repositório.
