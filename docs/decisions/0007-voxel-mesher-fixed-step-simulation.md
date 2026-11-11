# IMPL-0007: Malha de voxels com oclusão de ambiente, simulação em passo fixo e barramento de eventos

**Status:** Proposta — a validar (G12, medição em celulares reais)
**Data:** 2026-11-10
**Fontes:** pedido do responsável técnico (2026-11-10) de revisão de motor, gráficos, efeitos, som e jogabilidade;
auditoria e medições em `tasks/todo.md` (Tarefa 6); código: `apps/web/src/scene/mesher.ts`,
`apps/web/src/scene/Voxels.tsx`, `apps/web/src/game/motion.ts`, `apps/web/src/game/events.ts`,
`apps/web/src/scene/RenderStats.tsx`

## Contexto

Auditoria (2026-11-10):

- Cada voxel era um cubo inteiro instanciado (12 triângulos), inclusive as faces escondidas entre voxels vizinhos.
  Cada adereço repetido (postes, terrenos, bonecos de neve) tinha os próprios `InstancedMesh` → muitas chamadas de
  desenho, dobradas pelo passe de sombra. Sem oclusão de ambiente, os voxels pareciam chapados.
- O avatar andava em velocidade constante, sem aceleração, girava de uma vez, atravessava pinheiros, postes e
  casas, e gravava a posição no `zustand` **a cada quadro** (todos os seletores da interface rodavam 60×/s).
- Sem retorno ao achar presente ou concluir missão; pegadas sem relação com os passos; som só de vento e sininhos.
- Bug: concluída a missão "2 presentes", o terceiro presente ficava girando para sempre e não podia ser pego.

Medição antes (verify.mjs, preset Média, cena "dia-neve", 1280×800): **96 chamadas de desenho, 362 mil
triângulos por quadro**.

## Decisão

1. **Malha de voxels (`mesher.ts`, puro e testado):** remove faces entre células ocupadas (também entre papéis de
   material), aplica oclusão de ambiente por vértice (três vizinhos de cada canto, assada na cor do vértice) e gira a
   diagonal do quad conforme a oclusão. Cada vértice guarda o centro do seu voxel (`aCenter`): balanço dos pinheiros e
   cintilação das lâmpadas movem/defasam o voxel inteiro, sem deformar. Lâmpadas não recebem oclusão (cor da luz).
2. **Adereços repetidos instanciados:** `Voxels` aceita `placements`; postes, bancos, bonecos de neve, chalés e
   marcadores de terreno viram uma chamada por papel de material. O clique no terreno usa o `instanceId`.
3. **Balanço dos pinheiros como onda de rajada** que atravessa a floresta na direção do vento (fase pela posição ao
   longo do vento), em vez de todos os pinheiros em fase.
4. **Simulação do avatar em passo fixo de 60 Hz (`motion.ts`, pura e determinística):** aceleração/frenagem
   exponenciais, chegada suave ao destino do clique/toque, giro pelo menor arco, colisão com círculos (pinheiros da
   área andável, postes, bancos, bonecos de neve, trenó, renas e chalés publicados) deslizando pelo obstáculo, e
   desistência do destino quando o caminho está bloqueado. A renderização interpola entre os dois últimos passos. O
   estado vivo fica num objeto mutável (`game/sim.ts`), fora do `zustand`.
5. **Barramento de eventos (`game/events.ts`):** a simulação anuncia `step` (com superfície: pedra, neve batida,
   neve, gelo), `gift` e `mission`; pegadas, partículas e som reagem sem que a jogabilidade conheça renderização ou
   áudio.
6. **Efeitos e som:** neve levantada pelos passos na neve fofa e explosão dourada ao achar presente (partículas em
   GPU, pool em anel, uma chamada por estilo); passos sintetizados por superfície, carrilhão do presente e vinheta de
   missão, com variação aleatória e limite de vozes. Som continua desligado por padrão.
7. **Animação do avatar:** pernas e braços articulados com ciclo de passada guiado pela distância (pés não
   deslizam), inclinação pela aceleração, respiração parado, sombra de contato; câmera com leve antecipação na direção
   do movimento.
8. **Resolução adaptativa (`RenderStats`):** mede o p95 do tempo de quadro; acima de 22 ms reduz o DPR em passos de
   0,25 (mínimo 0,75); com folga, volta a subir, com espera que dobra a cada tentativa que falha (sem oscilação).
   `?envDebug` mostra chamadas, triângulos, p50/p95 e DPR; `verify.mjs` grava `stats.json`.
9. **Presentes:** concluída a missão, os presentes restantes somem (antes ficavam inalcançáveis). Regras de XP e
   idempotência (DEC-042) não mudam.

## Alternativas consideradas

- **Greedy meshing:** menos triângulos ainda, mas une faces de cores e oclusões diferentes; exigiria textura ou
  atlas de cor. A remoção de faces já cortou ~70% dos triângulos; fica para quando houver medição em celular.
- **Física com biblioteca (Rapier, cannon):** dependência pesada para círculos no plano; recusada.
- **Multiplayer agora (Durable Object + WebSocket):** fora do escopo e exige recurso Cloudflare novo (AGENTS.md).
  A simulação pura e em passo fixo é o pré-requisito para predição no cliente e validação no servidor no futuro.
- **Instanciar cada voxel como antes, só com AO em shader (SSAO):** custo por pixel alto em celular; recusado.

## Consequências

- Medido depois (mesma cena): **56 chamadas de desenho, 108 mil triângulos** (−42% e −70%); a maior parte das
  chamadas restantes é sombra, avatar articulado (5 partes) e efeitos. Tempo de GPU real ainda não medido (G12).
- Colisão é nova regra de movimento (PROPOSTA): elementos decorativos agora bloqueiam o avatar; terrenos
  disponíveis continuam atravessáveis.
- Toda malha de voxel precisa do atributo `aCenter` para os materiais com shader (cintilação, balanço).
- Os voxels não têm mais o vão de 2% entre cubos; a separação visual vem da oclusão e da variação de cor.

## Relacionados

[IMPL-0006](0006-christmas-environment-real-time-procedural-weather.md) ·
[architecture.md](../reference/architecture.md) · [environment.md](../reference/environment.md) · DEC-042 · G12
