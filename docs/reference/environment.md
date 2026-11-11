# Ambiente: hora, clima e efeitos

> **Status:** Implementado (Unreleased) — **PROPOSTA** ([IMPL-0006](../decisions/0006-christmas-environment-real-time-procedural-weather.md))
> · **Atualizado em:** 2026-11-10
> **Fonte de verdade:** `packages/shared/src/environment/` (lógica pura, testada), `apps/client/src/environment/`
> (navegador), `apps/client/src/scene/environment/` (renderização), `apps/api/src/api.ts`

## 1. Princípios

- **Hora real de São Paulo, 1:1.** Mesma hora e fase para qualquer pessoa, em qualquer país.
- **Clima de faz de conta.** Procedural e determinístico; não consulta clima real, localização nem astronomia.
- **Servidor decide o contrato, cliente desenha.** A API (`api.*`) informa a hora e os parâmetros; flocos, luz e sombras
  são calculados em cada aparelho. Nenhum floco ou quadro trafega pela rede.
- **Qualidade ≠ estado.** Presets e opções de conforto mudam só a aparência, nunca hora, clima ou jogo.

## 2. Módulos

Os módulos puros ficam em `packages/shared/src/environment/` (usados pelo jogo e pela API); `runtime.ts`,
`settings.ts` e `audio.ts` ficam em `apps/client/src/environment/`.

| Arquivo | Responsabilidade |
|---|---|
| `environment/config.ts` | Contrato: mundo, fuso, versões, seed, janelas; `parseSnapshot` valida o snapshot |
| `environment/time.ts` | Hora civil de SP via `Intl`, conversão SP → epoch, `smoothstep`, fase artística |
| `environment/random.ts` | Hash de inteiros (`Math.imul`) e PRNG local para layouts cosméticos |
| `environment/weather.ts` | Clima v1 por janela, perfis, interpolação (vento pelo menor arco) |
| `environment/events.ts` | Eventos programados (Natal, Virada) com entrada/saída suave |
| `environment/keyframes.ts` | Keyframes de luz/céu por hora de SP + efeito do clima → `Look` |
| `environment/network-clock.ts` | Relógio monotônico ancorado no servidor (RTT, slew, rejeição de outliers) |
| `environment/frame.ts` | Um timestamp → quadro completo (`computeFrame`, puro) |
| `environment/runtime.ts` | Sincronização, quadro compartilhado `env.frame`, override de depuração |
| `environment/settings.ts` | Presets e opções de conforto (por aparelho, `localStorage`) |
| `environment/audio.ts` | Som procedural: vento e sininhos (ambiente), passos por superfície, carrilhão do presente, vinheta de missão |
| `scene/environment/*` | Driver de uniforms, luz, céu, neve, partículas, pós-processamento |

Ordem por quadro: `EnvironmentDriver` (prioridade −1) calcula `env.frame` uma única vez → uniforms compartilhados →
luz, céu, neve e partículas leem `env.frame` → `PostFx` (prioridade 1) renderiza quando o bloom está ativo.

## 3. Hora e fases

Fases (convenção artística, editáveis em `CYCLE`): **amanhecer** 05:00–06:00 · **dia** 06:00–17:00 ·
**entardecer** 17:00–18:30 · **noite** 18:30–05:00. Visual contínuo por keyframes às 00:00, 04:30, 05:00, 06:00,
09:00, 12:00, 16:30, 17:00, 18:30, 21:00 e 24:00 (= 00:00), interpolados com `smoothstep` (sem overshoot).

Relógio: amostra `t0`/`t1` com `performance.now()` em volta de `GET https://api.vilanoeldobem.com.br/environment` ([api.md](api.md)); estimativa
`serverTimeMs + RTT/2`. Janela das 8 últimas amostras; vale a de menor RTT. Erro ≤ 2 s → slew (no máximo 10% mais
rápido/lento); erro maior → salto. Ressincroniza a cada 3 min e ao voltar à aba; sem servidor, usa o relógio do
aparelho e o painel "Ambiente" avisa.

## 4. Clima v1

| Estado | Rótulo | Neve | Névoa | Peso |
|---|---|---:|---:|---:|
| `CLEAR_FROST` | Céu limpo e geada | 0 | 0,02 | 12% |
| `LIGHT_SNOW` | Neve leve | 0,20 | 0,12 | 30% |
| `SNOW` | Nevando | 0,48 | 0,26 | 32% |
| `HEAVY_SNOW` | Neve forte | 0,78 | 0,48 | 18% |
| `BLIZZARD` | Nevasca mágica | 1,00 | 0,76 | 5% |
| `MISTY_FROST` | Névoa gelada | 0,12 | 0,60 | 3% |

Janela de 45 min, transição de 5 min a partir do início da janela. Valores são coordenadas de direção de arte (0..1),
não unidades físicas. Aurora: 35% das janelas `CLEAR_FROST` e nos eventos; só aparece com o céu escuro. Névoa
limitada a `MAX_FOG_DENSITY` (0,03) para o avatar e os terrenos próximos continuarem visíveis.

Limitação conhecida: janelas sorteadas de forma independente podem ir de céu limpo a nevasca (a transição esconde o
corte). Correlação entre janelas seria o algoritmo v2.

## 5. Eventos programados (PROPOSTA)

| Evento | Hora de SP | Efeito |
|---|---|---|
| `CHRISTMAS_EVE_SPARKLES` | 24/12 18:00 → 25/12 02:00 | Neve leve, brilhos máximos, aurora |
| `CHRISTMAS_DAY` | 25/12 06:00 → 26/12 00:00 | Neve leve, muitos brilhos |
| `NEW_YEAR_SPARKLES` | 31/12 23:00 → 01/01 01:00 | Brilhos máximos, aurora, céu aberto |

## 6. Presets e conforto

| Recurso | Baixa | Média | Alta | Ultra |
|---|---:|---:|---:|---:|
| Flocos no volume | 400 | 1.200 | 2.400 | 4.800 |
| DPR máximo | 1 | 1,25 | 1,5 | 2 |
| Sombras | não | 1024 | 2048 | 2048 |
| Bloom | não | não | 0,3 | 0,4 |
| Brilhos / pegadas | 60 / 24 | 120 / 48 | 200 / 80 | 320 / 120 |

Além do preset, a resolução é adaptativa (IMPL-0007): o DPR cai em passos de 0,25 (até 0,75) quando o p95 do tempo
de quadro passa de 22 ms e volta a subir quando sobra folga.

"Automática" escolhe pela quantidade de núcleos, memória e tipo de ponteiro (toque → Baixa ou Média). Conforto:
neve e brilhos (liga/desliga), luzes fixas sem piscar, menos movimento (padrão segue `prefers-reduced-motion`),
som (vento, sininhos, passos e efeitos; sempre começa desligado; nunca fica salvo como ligado). Em "Outros
visitantes": ver quem está na praça e aparecer para eles (ligado por padrão; desligar desconecta, IMPL-0008).

## 7. Cena

Vila nevada: chão de voxels com variação tonal, pinheiros com neve (balançam com o vento), chalés com janelas acesas,
telhados nevados, pingentes e chaminé com fumaça (terrenos publicados), postes com guirlanda, cordões de lâmpadas
entre os postes, bonecos de neve, trenó com duas renas, lago congelado, floresta e montanhas ao fundo. Pinheiros da área andável,
postes, bancos, bonecos de neve, trenó, renas e chalés publicados bloqueiam o avatar (PROPOSTA, IMPL-0007); lago e
terrenos disponíveis são atravessáveis. Nenhum elemento decorativo afeta missões ou XP.

Retorno da jogabilidade (IMPL-0007): pegadas a cada passo na neve (não na pedra da praça nem no gelo), neve levantada
ao andar na neve fofa, brilho dourado ao achar presente; com som ligado, passos com timbre por superfície, carrilhão
do presente e vinheta de missão concluída. "Neve e brilhos" desligado também desliga essas partículas. Interiores: não há prédios com interior; não se aplica.

Vista **"Olhar o céu"** (botão 🌌 no HUD, PROPOSTA): a câmera desce e olha para o céu; andar ou tocar o chão volta à
vista normal. A câmera de jogo segue OQ-05.

## 8. Depuração (só localhost / build de desenvolvimento)

`?envDebug` mostra o painel técnico. `?envTime=2026-12-24T23:00` fixa a hora inicial (hora de SP; o relógio continua
correndo 1:1). `?envWeather=BLIZZARD` força o clima. Em produção esses parâmetros são ignorados.
`node apps/client/scripts/verify.mjs <url>` fotografa amanhecer, dia, entardecer e noite, nevasca e a vista do céu.

## Ver também

[api.md](api.md) · [architecture.md](architecture.md) · [IMPL-0006](../decisions/0006-christmas-environment-real-time-procedural-weather.md)
