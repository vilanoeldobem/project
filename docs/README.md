# Documentação técnica — Vila Noel do Bem

> **Status:** Implementado (0.2.0) · **Versão do software:** 0.2.0 · **Schema D1:** v3 ·
> **Atualizado em:** 2026-11-08
> **Fonte de verdade:** código em `apps/web/` e `migrations/`; produto em `vilanoeldobem_docs`

Organizada segundo [Diátaxis](https://diataxis.fr/): cada documento responde a um tipo de pergunta.

| Tipo | Pergunta | Onde |
|---|---|---|
| Tutorial | "Como começo?" | [`getting-started.md`](getting-started.md) |
| Guia (how-to) | "Como faço X?" | [`guides/`](guides/) |
| Referência | "Como exatamente funciona X?" | [`reference/`](reference/) |
| Explicação | "Por que é assim?" | [`explanation/`](explanation/), [`decisions/`](decisions/README.md) |
| Especificação | "O que o produto deve ser?" | [`specs/`](specs/README.md) → repositório de documentação |
| Registro | "O que foi entregue e como?" | [`implementation/`](implementation/) |

## Índice

**Tutorial**
- [getting-started.md](getting-started.md) — instalar, rodar a Vila localmente com Worker e D1, verificar.

**Guias**
- [guides/development.md](guides/development.md) — ciclo de desenvolvimento, gates, receitas, checklist de PR.
- [guides/deploy.md](guides/deploy.md) — publicar na Cloudflare (conta do projeto), D1 remoto, rollback.

**Referência**
- [reference/architecture.md](reference/architecture.md) — componentes, fluxo de dados, estrutura de pastas.
- [reference/api.md](reference/api.md) — rotas `/api/*`, respostas e erros.
- [reference/environment.md](reference/environment.md) — hora real de São Paulo, clima procedural, efeitos e presets.
- [reference/storage.md](reference/storage.md) — schema D1, migrations, estados.
- [reference/versioning.md](reference/versioning.md) — SemVer, schema, changelog e release.

**Explicação**
- [explanation/design-principles.md](explanation/design-principles.md) — princípios e onde aparecem no código.
- [explanation/domain-model.md](explanation/domain-model.md) — entidades, invariantes, glossário.
- [decisions/README.md](decisions/README.md) — ADRs `IMPL-NNNN` e [perguntas abertas](decisions/open-questions.md).

**Registro**
- [implementation/slice-01-report.md](implementation/slice-01-report.md) — entrega da 0.1.0.

## Status por área (2026-11-08)

| Área | Status | Referência |
|---|---|---|
| Praça 3D, avatar, câmera | Parcial (estudo de câmera, G12) | [architecture](reference/architecture.md) |
| Vila nevada, dia/noite real, clima compartilhado | Implementado — arte nevada confirmada (OQ-07); DEC pendente (IMPL-0006) | [environment](reference/environment.md) |
| Terrenos e casas de ONG | Parcial (leitura; sem cadastro) | [storage](reference/storage.md) |
| Missões e XP | Parcial (local, sem servidor) | [domain-model](explanation/domain-model.md) |
| Doações | Não implementado (bloqueado, IMPL-0002) | [0002](decisions/0002-donations-disabled-until-partner-contract.md) |
| Contas, admin, chat, avatar, skins, badges | Planejado | [ROADMAP](../ROADMAP.md) |

## Convenções desta documentação

- Documentação em pt-BR; código, comandos e saídas em inglês; conversa com agentes em inglês ([IMPL-0004](decisions/0004-english-code-portuguese-docs.md)).
- Todo documento começa com o bloco **Status / Versão / Atualizado em / Fonte de verdade**.
- Status de funcionalidade: *Implementado*, *Parcial*, *Planejado (marco)*, *Não implementado*. Nunca descrever como
  existente algo que só está na especificação.
- Código e documento divergentes: o código vence e o documento é corrigido no mesmo PR.
- Citações: decisões do produto `DEC-NNN`, pendências `PEN-NNN`, propostas `PRP-NNN` (repositório de
  documentação); ADRs deste repositório `IMPL-NNNN`; perguntas abertas `OQ-NN`.
