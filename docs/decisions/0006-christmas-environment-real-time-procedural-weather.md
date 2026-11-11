# IMPL-0006: Ambiente natalino — hora real de São Paulo, clima procedural compartilhado e vila nevada

**Status:** Proposta — a validar (G11); direção de arte nevada confirmada pelo responsável em 2026-11-09 (OQ-07),
DEC no repositório de documentação pendente
**Data:** 2026-11-09
**Fontes:** especificação "CHRISTMAS WORLD" v1.0 (proposta técnica, 09/11/2026) trazida pelo responsável técnico
(Augusto, 2026-11-09); escolhas do responsável na mesma data: vila nevada, endpoint stateless, escopo completo;
`vilanoeldobem/docs/docs/reference/guia-identidade-visual-voxel.md` ("Natal brasileiro de verão" = PROPOSTA);
Código: `apps/web/src/environment/`, `apps/web/src/scene/environment/`, `apps/web/worker/api.ts`

## Contexto

A cena era um estudo de "Natal brasileiro de verão" (palmeiras, terracota, sem neve), marcado como **PROPOSTA** no
repositório de documentação — "a ausência de neve é uma escolha de estudo, ainda não uma regra da marca". A
especificação pede uma vila natalina nevada, com ciclo de dia e noite pela hora real e clima fictício igual para todos.

Auditoria (fase 0 da especificação): three 0.187 + react-three-fiber 9, `WebGLRenderer`, sem pós-processamento,
voxels instanciados; jogo **sem multiplayer** (sem WebSocket); Worker stateless com D1 como único armazenamento.

## Decisão

1. **Hora:** relógio civil real de `America/Sao_Paulo`, escala 1:1, convertido via `Intl` (fuso IANA, nunca
   UTC-3 fixo). Fases artísticas fixas: amanhecer 05:00, dia 06:00, entardecer 17:00, noite 18:30 — convenções do
   jogo, não astronomia. Sem geolocalização, clima real nem cálculo solar.
2. **Autoridade do tempo:** `GET /api/environment` (Worker, `no-store`) devolve `serverTimeMs` e o contrato do
   clima. O cliente ancora um relógio monotônico (`performance.now()`), filtra amostras pelo menor RTT, corrige erros
   pequenos gradualmente (slew de até 10%) e saltos grandes de uma vez; ressincroniza a cada 3 min e ao voltar à aba.
3. **Clima procedural v1:** função pura `weatherAt(seed, epoch)` por janelas de 45 min com transição de 5 min, PRNG
   de inteiros (`Math.imul`), vento interpolado pelo menor arco. Seed derivada do id do mundo (FNV-1a). Mesmo
   timestamp → mesmo clima em todos os aparelhos, sem mensagens de rede. Seis estados (`CLEAR_FROST` … `BLIZZARD`).
4. **Eventos programados** (Véspera de Natal, Dia de Natal, Virada do Ano): constantes versionadas no código,
   ativas por timestamp, com entrada/saída suave. **Não** há override administrativo (sem admin autenticado; DEC-037).
5. **Sem Durable Object**: o jogo não tem canal em tempo real; um snapshot + clima determinístico basta (a própria
   especificação admite isso, §13.3). D1 segue como único armazenamento (AGENTS.md); nenhum recurso Cloudflare novo.
6. **Renderização no cliente, sem migrar renderer:** céu em gradiente, estrelas, lua, nuvens, aurora e estrelas
   cadentes; luz-chave única (sol de dia, lua à noite) + hemisférica; névoa `FogExp2` com teto de densidade
   (visibilidade mínima); luzes natalinas emissivas com cintilação lenta e determinística (~0,25 Hz); neve por GPU
   (1 draw call, volume ancorado no mundo); vento nos pinheiros; fumaça; pegadas locais; lago congelado; bloom
   moderado só nos presets Alta/Ultra (tone mapping aplicado uma única vez no `OutputPass`).
7. **Presets** (Baixa/Média/Alta/Ultra + automático) mudam só custo (flocos, sombras, DPR, bloom), nunca hora,
   clima ou regras. Opções de conforto: sem partículas, luzes fixas, menos movimento, som ambiente (desligado por
   padrão, procedural, sem trilhas licenciadas).
8. **Vista "Olhar o céu"** (PROPOSTA): botão que inclina a câmera para o céu; a câmera de jogo continua a de
   OQ-05. Sem ela, céu/estrelas/aurora nunca aparecem (a câmera de jogo olha ~29° abaixo do horizonte no topo da tela).
9. **Direção de arte:** vila nevada (pinheiros com neve no lugar das palmeiras, telhados nevados, chalés com janelas
   acesas). Confirmada pelo responsável em 2026-11-09 (OQ-07 resolvida); falta a DEC no repositório de documentação.

## Alternativas consideradas

- **Durable Object + WebSocket hibernável (especificação §13–15.5):** adiado. Sem multiplayer, seria um socket só
  para a neve, recurso novo e mais superfície de segurança. Vira opção quando houver tempo real ou overrides ao vivo.
- **Manter o verão com "neve mágica":** recusado pelo responsável (escolheu a vila nevada).
- **Migrar para `WebGPURenderer`/TSL:** fora do escopo (especificação §6.1); exigiria portar shaders e passes.
- **Clima por cadeia de Markov persistida:** v2 possível; o v1 é sem estado e mais barato.

## Consequências

- Todos os visitantes veem a mesma hora e o mesmo clima no mesmo instante; quem entra durante uma nevasca já a vê.
- Mudar seed, duração de janela ou algoritmo exige subir `WEATHER_ALGORITHM_VERSION`/`CONFIG_VERSION`
  (`src/environment/config.ts`); clientes rejeitam snapshots incompatíveis e seguem com o relógio local.
- A identificação `gift-palm` (evento de missão persistido) foi mantida, embora as palmeiras tenham virado pinheiros.
- Desempenho medido só em renderização por software (verify.mjs); falta benchmark em celulares de entrada (G12).

## Relacionados

[environment.md](../reference/environment.md) · [api.md](../reference/api.md) · [open-questions.md](open-questions.md)
(OQ-05, OQ-07) · IMPL-0001 · IMPL-0003 · DEC-037 · DEC-042
