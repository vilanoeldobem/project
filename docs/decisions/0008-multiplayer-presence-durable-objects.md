# IMPL-0008: Multiplayer de presença com Durable Objects e WebSocket

**Status:** Aceita pelo responsável técnico (2026-11-10) — em produção desde 2026-11-10 (`vilanoeldobem-server` 9c92585f)
**Data:** 2026-11-10
**Fontes:** pedido do responsável técnico em 2026-11-10 ("go ahead with multiplayer, make it work using Cloudflare");
IMPL-0006 (alternativa adiada: Durable Object + WebSocket), IMPL-0007 (simulação pura em passo fixo);
código: `apps/web/worker/room.ts`, `apps/web/worker/room-do.ts`, `apps/web/src/net/`, `apps/web/src/scene/RemotePlayers.tsx`

## Contexto

A Vila era só para uma pessoa por vez: cada visitante via a mesma hora e o mesmo clima (IMPL-0006), mas nunca os
outros visitantes. O público inclui menores (ECA Digital, LGPD): qualquer interação entre pessoas precisa coletar o
mínimo e não abrir canal de contato.

## Decisão

1. **Escopo: presença.** Ver os outros andando na praça e ser visto. Sem nomes, sem chat, sem texto livre, sem
   emotes ou interação entre avatares, sem estado de jogo compartilhado (missões, XP e presentes continuam locais).
2. **Durable Object `VillageRoom`** (classe com SQLite, migration `v1-village-room`): uma instância por sala
   (`plaza-0` … `plaza-7`), até 40 visitantes cada. Presença só em memória; **nada é gravado** (D1 segue o único
   armazenamento persistente; regra atualizada no AGENTS.md).
3. **WebSocket com API de hibernação:** `GET /api/room?i=N` (mesma origem obrigatória). A sala transmite a 10 Hz só
   enquanto há alguém; sem ninguém, para o timer e hiberna. `"ping"`/`"pong"` respondido pelo runtime sem acordar.
4. **Sala autoritativa para o que os outros veem:** pose saneada (finita, dentro do mundo, velocidade ≤ máxima),
   sem teletransporte (passo limitado ao que o avatar andaria desde a última pose; a primeira é livre), balde de
   fichas de 20 msg/s com rajada de 40, conexão abusiva fechada (`1008`). O próprio cliente continua dono do seu
   movimento (não há correção de volta: nada de jogo depende dos outros).
5. **Protocolo compacto** (arrays JSON, ~40 bytes por pose): pose só quando muda; a sala junta as poses que
   mudaram em uma mensagem por tick, com a idade de cada uma para o cliente posicioná-la no tempo.
6. **Cliente:** interpolação de snapshots 150 ms no passado (sem extrapolação), giro pelo menor arco, ciclo de
   passada pela distância percorrida na tela. Todos os avatares remotos em 5 `InstancedMesh` + 1 de sombra: o custo
   em chamadas de desenho não cresce com o número de visitantes. Sala cheia → próxima; queda → nova tentativa com
   espera exponencial (1–30 s); sem `/api/room`, jogo solo.
7. **Escolha da pessoa:** opção "Outros visitantes" no painel "Ambiente" (ligada por padrão; desligar desconecta e
   some para os outros). Chip "👥 N" mostra quantos estão na mesma praça (número real, não estimado).

## Alternativas consideradas

- **Durable Object com alarmes em vez de timer:** cada alarme acorda o objeto; com gente conectada ele já está
  acordado, então um `setInterval` é mais simples e equivalente.
- **Retransmitir cada mensagem na hora (sem tick):** N² mensagens; a 40 pessoas e 10 Hz seriam ~16 mil mensagens/s
  por sala. O lote por tick limita a N mensagens por tick.
- **Binário (ArrayBuffer):** menor, mas mais difícil de depurar; com só a pose, JSON compacto basta.
- **Nomes/apelidos sobre os avatares:** dependem da conta (0.4.0, P13) e de moderação; fora deste escopo.
- **Serviço de tempo real de terceiros:** dependência e tratamento de dados fora da conta do projeto; recusado.

## Consequências

- Recurso Cloudflare novo (classe de Durable Object) criado no próximo `wrangler deploy`; custo proporcional ao tempo
  com gente conectada (salas vazias hibernam).
- Testado localmente (`wrangler dev`): dois navegadores se veem, o andar aparece no outro, a saída remove o avatar.
  Não medido: latência real entre regiões e comportamento com 40 pessoas numa sala.
- Toda mudança no protocolo precisa manter cliente e Worker no mesmo deploy (arquivo compartilhado
  `src/net/protocol.ts`).
- Base para o futuro: aparência (cosméticos) poderá viajar como semente + camadas, sem dado pessoal.

## Relacionados

[api.md](../reference/api.md) · [architecture.md](../reference/architecture.md) ·
[IMPL-0006](0006-christmas-environment-real-time-procedural-weather.md) ·
[IMPL-0007](0007-voxel-mesher-fixed-step-simulation.md) · DEC-037 · P13

**Adendo (2026-11-10):** a parte de topologia (`/api/room` no mesmo Worker do jogo) foi substituída por
[IMPL-0009](0009-split-client-api-server-shared.md): as salas ficam no Worker `vilanoeldobem-server`
(`server.vilanoeldobem.com.br/room?i=N`), que aceita só origens exatas de `ALLOWED_ORIGINS`. Protocolo, limites e
Durable Object `VillageRoom` não mudaram.

**Adendo (2026-11-11):** "salas vazias hibernam" não bastava para o custo: uma única aba esquecida aberta mantinha a
sala acordada. [IMPL-0014](0014-realtime-idle-timeout.md) acrescenta o limite de inatividade (fechamento `4002`), a
mensagem `["a"]` e a pausa do cliente; o resto do protocolo não mudou.
