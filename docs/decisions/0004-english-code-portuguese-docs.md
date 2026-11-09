# IMPL-0004: Código e conversa com agentes em inglês (en-US); documentação em português (pt-BR)

**Status:** Aceita (0.2.0, 2026-11-08)
**Data:** 2026-11-08
**Fontes:** pedido do responsável técnico (Augusto, 2026-11-08); Código: `apps/web/`, `migrations/0003_english_schema.sql`,
`AGENTS.md`, `CLAUDE.md`

## Contexto

A 0.1.0 misturava idiomas no código: comentários em português, identificadores de domínio (`ongs`, `disponivel`,
`praca-01`, `explorar-presentes`) e chaves de API (`ongs_aprovadas`). Isso dificulta leitura, busca e o trabalho com
agentes de código, que conversam com a equipe em inglês.

## Decisão

| Superfície | Idioma |
|---|---|
| Conversa com agentes (entrada e saída), `AGENTS.md`, `CLAUDE.md`, `tasks/todo.md` | **en-US** |
| Código: identificadores, comentários, testes, nomes de tabela/coluna, valores de estado, ids, chaves de API, códigos de erro, logs, scripts | **en-US** |
| Mensagens de commit e títulos de PR | **en-US** (Conventional Commits) |
| Documentação (`docs/`, `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `ROADMAP.md`, modelo de PR) | **pt-BR** |
| Textos de interface (UI copy) e campos `label`/`note` da API exibidos ao usuário | **pt-BR** |

Glossário de domínio (pt-BR → código): ONG → `ngo`; terreno → `lot`; praça → `plaza`; presente → `gift`;
disponível → `available`; candidatura enviada → `application_sent` / `submitted`; em análise → `under_review`;
ajustes solicitados → `changes_requested`; publicada(o) → `published`; rejeitada → `rejected`; trilhas
Explorar/Brincar/Conhecer causas → `explore`/`play`/`causes`.

Migração do schema: `0003_english_schema.sql` recria `ongs` → `ngos` e `lots` com estados e ids em inglês,
preservando os dados. `0001`/`0002` tiveram **somente comentários** traduzidos (SQL idêntico, conferido por diff).

## Alternativas consideradas

- **Manter termos do domínio em português no código** — rejeitada: mistura idiomas e contraria o pedido.
- **Traduzir também a documentação** — rejeitada: a equipe de produto (Bernard) e o repositório de documentação são pt-BR.

## Consequências

- Positivas: código consistente; agentes e pessoas usam os mesmos termos; glossário único.
- Negativas: mudança incompatível na API (`ong_*` → `ngo_*`, chaves de indicadores, estados) e progresso local
  reiniciado (`vila.progress.v1` → `v2`) — por isso a versão 0.2.0.
- Verificação: `rg -n "[ãõçáéíóúâêô]" apps/web/src apps/web/worker` só deve encontrar textos de interface.

## Relacionados

[reference/storage.md](../reference/storage.md) · [reference/api.md](../reference/api.md) · [AGENTS.md](../../AGENTS.md)
