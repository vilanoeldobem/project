# IMPL-0014: Limite de inatividade na presença (desconectar quem está ausente)

**Status:** Proposta — implementada, a validar (padrão de 5 min e textos da pausa são propostas; em produção desde 2026-11-12)
**Data:** 2026-11-11
**Fontes:** pedido do responsável técnico em 2026-11-11 ("add timeout and disconnect AFK to save durable object
cost"); [IMPL-0008](0008-multiplayer-presence-durable-objects.md) (presença, timer de 10 Hz, "nada é gravado");
documentação da Cloudflare consultada em 2026-11-11:
[preços de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[ciclo de vida](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/),
[WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/),
[API de estado](https://developers.cloudflare.com/durable-objects/api/state/);
código: `apps/server/src/{room,room-do,env}.ts`, `packages/shared/src/net/protocol.ts`,
`apps/client/src/net/multiplayer.ts`, `apps/client/src/ui/Environment.tsx`

## Contexto

A sala de presença (`VillageRoom`, IMPL-0008) liga um `setInterval` de 10 Hz enquanto há alguém conectado e só o
desliga quando o último visitante sai. O cliente envia `"ping"` a cada 20 s, respondido pelo runtime sem acordar a
sala, e por isso uma aba esquecida aberta nunca "sai": a conexão fica viva, o timer continua e a sala não hiberna.

O que a documentação da Cloudflare diz (conferido em 2026-11-11):

- A duração é cobrada por tempo de relógio enquanto o objeto está ativo ou ocioso em memória **sem poder hibernar**,
  sempre como 128 MB (0,128 GB-s por segundo), qualquer que seja o uso real. Objeto ocioso e apto a hibernar não paga
  duração, mesmo antes de o runtime hiberná-lo.
- Para hibernar, não pode haver callback de `setTimeout`/`setInterval` agendado. O timer de 10 Hz, portanto, impede a
  hibernação.
- Plano gratuito: 13.000 GB-s de duração e 100.000 requisições por dia; passou do limite, as operações falham. Plano
  pago: 400.000 GB-s por mês e US$ 12,50 por milhão de GB-s a mais. Mensagens WebSocket recebidas contam como
  requisição na razão 20:1; as enviadas não são cobradas.
- Cada `setAlarm()` é cobrado como uma linha gravada: alarme **é** escrita no storage do objeto.

Conta: uma sala acordada por 24 h consome 86.400 s × 0,128 GB = 11.059 GB-s, 85% da cota diária gratuita. Uma única
aba esquecida numa sala faz isso sozinha; com duas salas nessa situação, a presença para de funcionar no meio do dia
(no plano gratuito) ou vira custo (no pago). O AGENTS.md proíbe gravar no storage do Durable Object, e o público
inclui menores: o aviso de pausa não pode pressionar ninguém a ficar ou a voltar.

## Decisão

1. **A sala decide quem está ausente.** Cada conexão tem a hora da última **atividade real**: pose que move ou gira
   o avatar, troca de visual (`["k", …]`) ou a nova mensagem `["a"]`. Não contam: `"ping"` (nem chega à sala), pose
   repetida, mensagem inválida e mensagem descartada pelo limite de taxa.
2. **Fechamento `4002`, motivo `idle`.** Conexão sem atividade por mais do que o limite é fechada pela sala. Ela sai
   da lista na hora (sem esperar o fim do fechamento: uma conexão morta nunca responderia e manteria o timer ligado)
   e os outros recebem `["l", id]`, como em qualquer saída. O `4001` sugerido no pedido já é "sala cheia".
3. **Mecanismo: o timer que já existe, sem alarme.** A conferência roda no tick de 10 Hz, que só existe enquanto há
   alguém na lista. Fechado o último ausente, a lista esvazia, o timer para e a sala fica apta a hibernar: custo de
   duração zero. Nada é gravado no storage. A hora da atividade vive em memória, com uma cópia aproximada (no máximo
   a cada 30 s) no anexo do WebSocket (`serializeAttachment`, onde já ficavam `id` e `room`): o anexo é guardado pelo
   runtime junto da conexão e some com ela. A cópia serve só para o caso de o runtime tirar o objeto da memória com
   conexões abertas: ao acordar, a sala fecha de imediato quem já tinha passado do limite, em vez de dar a todos um
   prazo novo. O anexo guarda três números; nenhum dado pessoal.
4. **Limite configurável: `IDLE_TIMEOUT_SECONDS`** (`vars` de `apps/server/wrangler.jsonc`), padrão **300 s**
   (PROPOSTA). Vale inteiro de 60 a 86.400; ausente, vazio, texto, negativo, fracionado ou fora da faixa caem no
   padrão. Por que 5 minutos:
   - como cliques, toques e teclas contam (item 5), 5 minutos sem nenhum deles é ausência de verdade, e não alguém
     jogando memória ou lendo um painel; dá folga para quem só observa a praça ou se afasta por um instante;
   - limita a "cauda" de cada visita abandonada a 300 s × 0,128 = 38,4 GB-s (0,3% da cota diária gratuita), contra
     cauda sem fim hoje;
   - 1–2 minutos derrubaria quem está só olhando a neve e multiplicaria reconexões; 15 minutos ou mais triplicaria a
     cauda sem ganho para ninguém.
   O mínimo de 60 s existe porque o cliente só relata atividade a cada 20 s.
5. **Mensagem `["a"]` (cliente → sala):** enviada depois de um clique, toque ou tecla reais, no máximo uma a cada
   20 s (`ACTIVE_MS`) e só se nenhuma pose ou visual saiu nesse intervalo. Não leva conteúdo: diz apenas "há alguém
   aqui". Sem ela, quem passa mais de 5 minutos num minijogo ou no formulário de ONG seria tratado como ausente.
6. **Cliente: pausa em vez de laço de reconexão.** Ao receber `4002`, o cliente não agenda nada: mostra o chip
   "👥 em pausa" no lugar de "👥 N" (com o texto completo em `aria-label`/`title` e no painel "Ambiente") e reconecta
   no próximo clique, toque ou tecla. O jogo solo continua igual. Não há contagem regressiva, som, "você ainda está
   aí?" nem botão pedindo para voltar (menores: sem pressão para permanecer). A política de reconexão virou a função
   pura `planAfterClose`: sala cheia → próxima sala; queda → espera exponencial de 1 a 30 s; só o `4002` espera a
   pessoa.
7. **Aba oculta por 2 minutos** (PROPOSTA): o cliente desliga sozinho (`1000`, motivo `hidden`) e entra na mesma
   pausa; volta quando a aba está visível e a pessoa age. Prazo menor que o da sala porque, com a aba oculta, não há
   o que ver.
8. **Sem limite de duração total da conexão:** o desenho atual não pede um, e quem está ativo não deve ser derrubado.

## Alternativas consideradas

- **Alarme do Durable Object para a conferência:** grava no storage (cada `setAlarm()` é uma linha escrita), o que a
  regra do projeto proíbe, e é desnecessário: enquanto há conexão na lista, a sala já está acordada pelo timer.
- **Decidir a ausência só no cliente:** não vale para abas antigas, clientes modificados ou conexões mortas; a sala
  precisa ser quem fecha.
- **Contar só pose e visual como atividade (sem `["a"]`):** mais simples, mas derrubaria a cada 5 minutos quem está
  usando a página sem andar, com aviso de "inatividade" falso e um entra-e-sai visível para os outros.
- **Parar o timer quando ninguém se move, deixando as conexões hibernarem:** zeraria o custo até de visitantes
  parados e conectados, mas a hibernação descarta as poses em memória; exigiria guardar a pose no anexo e refazer o
  IMPL-0008. Fica como evolução possível.
- **Aviso em toast, contagem regressiva ou confirmação "ainda está aí?":** chama a atenção de quem não está, e
  pressiona quem está; o chip discreto basta.
- **Reconectar sozinho depois do `4002`:** recomeçaria o prazo indefinidamente e anularia a economia.

## Consequências

- **Custo.** Antes: sala cobrada enquanto houvesse qualquer aba aberta, sem limite. Depois: sala cobrada enquanto
  alguém estiver ativo, mais até 5 minutos depois da última atividade (2 minutos se a aba for ocultada); daí em
  diante, zero de duração. Requisições: o `["a"]` acrescenta no máximo 3 mensagens por minuto por pessoa que usa a
  página sem andar (0,15 requisição cobrada por minuto), e cada volta da pausa é uma requisição de conexão.
- **Protocolo:** acréscimos compatíveis (`["a"]`, código `4002`); nenhuma mensagem existente mudou.
- **Ordem de deploy: servidor antes do cliente** ([deploy.md §4.3](../guides/deploy.md)). Cliente antigo trata o
  `4002` como queda e reconecta em 1 s: abas antigas esquecidas continuam ocupando a sala, em janelas de 5 minutos,
  até serem recarregadas ou fechadas. A economia só fica completa quando elas somem.
- **Depois de acordar,** a hora recuperada do anexo pode estar até 30 s atrasada: alguém ativo nesses 30 s pode ser
  fechado até 30 s antes do limite. Só acontece se o runtime tirar da memória um objeto com conexões abertas.
- **Testado:** lógica pura (`room.test.ts`), a classe `VillageRoom` com sockets e relógio falsos
  (`room-do.test.ts`), a política e o comportamento do cliente com `WebSocket` falso (`multiplayer.test.ts`).
  Em `wrangler dev` local (limite de 60 s): a conexão ausente foi fechada com `4002 idle` aos 60,1 s, as outras duas
  receberam `["l", id]` uma única vez, a conexão que só enviava `["a"]` ficou, e depois de todos saírem a sala
  reiniciou a contagem de ids (objeto recriado, ou seja, hibernou). Com limite de 200 s, uma conexão sozinha que só
  enviava `"ping"` foi fechada aos 200,3 s: no runtime local o timer segue vivo sem nenhuma mensagem chegando.
- **Não conferido:** navegadores reais (chip, pausa, volta por toque e aba oculta), a cobrança real em produção
  (olhar a duração em GB-s de `VillageRoom` no painel da Cloudflare depois do deploy) e o plano da conta.
- **Suposições sobre a Cloudflare não confirmadas pela documentação:** (a) um `setInterval` recorrente mantém o
  objeto em memória e cobrando por tempo indeterminado (o texto fala em "até 15 minutos por operação" sem dizer como
  isso se aplica a um intervalo que dispara sempre; no runtime local ele durou os 200 s do teste); (b) gravar o anexo do WebSocket não é escrita no storage nem é
  cobrado (a documentação trata anexo e Storage API como coisas distintas, sem dizer isso com todas as letras);
  (c) se o `"ping"` respondido automaticamente conta como requisição (a documentação só garante que não gera
  duração).

## Relacionados

[api.md](../reference/api.md) · [architecture.md](../reference/architecture.md) ·
[environment.md](../reference/environment.md) · [deploy.md](../guides/deploy.md) ·
[IMPL-0008](0008-multiplayer-presence-durable-objects.md) ·
[IMPL-0009](0009-split-client-api-server-shared.md) · DEC-037 · P13
