# O que a Vila consegue contar

**N5.1 da #65 · 20/11/2026 · revisão técnica para Augusto.** A primeira métrica proposta para a N5.2 é a **quantidade de doações globais confirmadas**. O D1 já distingue o Pix dirigido à parceira global do Pix dirigido a uma ONG. A consulta pública existente soma ambos. O recorte global precisa de uma consulta e de um rótulo próprios. As quatro perguntas sobre público e uso do jogo ainda exigem definições ou coleta. [Pedido da #65](https://github.com/vilanoeldobem/project/issues/65) · [Categorias e marcos da #66](https://github.com/vilanoeldobem/project/issues/66)

## O que aparece em produção

Na [main 2c29476](https://github.com/vilanoeldobem/project/tree/2c294767aa7756ceaf759eadb4799b7175dedc73), o Worker da API atende `GET /indicators` em `handleApi` e calcula o resultado em `indicators(env)`. A publicação 0.7.0 registra D1 v15. A checagem remota desta investigação foi feita pelas duas rotas públicas. Os registros financeiros de produção não foram consultados diretamente. [Implementação da API][api] · [Registro da publicação][release]

Em 20/11, às **09h33 de Brasília**, `GET /indicators` respondeu HTTP 200, com `updatedAt = 2026-11-20T12:33:15.338Z` e cache público de 30 s. `approved_ngos = 0` é um zero medido: a consulta procura ONGs publicadas vinculadas a um terreno publicado. `registered_users`, `confirmed_donations`, `confirmed_amount` e `people_impacted` vieram com `value: null`. A configuração retornou `accounts: false`, `quests: false` e `donations: false`. Nenhuma chave de visitantes, visitas, minijogos ou doações exclusivamente globais veio na resposta. [Indicadores ao vivo](https://api.vilanoeldobem.com.br/indicators) · [Configuração ao vivo](https://api.vilanoeldobem.com.br/config)

No painel P02, uma chave presente com valor numérico gera um cartão, inclusive para zero. `null` mostra **—** com a nota da API. Uma chave ausente não gera cartão. Se a requisição inteira falha, aparece “Indicadores indisponíveis no momento.” O painel mostra fonte e período da doação como “A definir”. Formata todos os números com `toLocaleString("pt-BR")`: 1.000 centavos aparecem como “1.000”, embora correspondam a R$ 10,00. `updatedAt` é o instante da resposta da API. [Painel P02][ui] · [Leitura HTTP pelo jogo][http]

## Dicionário de público e uso do jogo

| Indicador da #65 | Fonte hoje e unidade observável | Granularidade, identidade e janela | Repetição, abas e reconexão | Zero, indisponibilidade e coleta que falta |
|---|---|---|---|---|
| Simultâneos | O Durable Object mede conexões WebSocket aceitas por sala com `RoomState.size`. O HUD online mostra os outros avatares conhecidos na sala mais o próprio. | Uma conexão por ID efêmero na sala, no instante da observação. Até 8 salas de 40 vagas. Quem joga com “Outros visitantes” desligado fica fora. | Duas abas conectadas abrem dois sockets. Reconectar cria outro vínculo. Se o antigo ainda estiver ativo, há sobreposição até sua remoção. A sala encerra conexões inativas após 300 s na configuração atual. O cliente pausa a aba oculta após 120 s. | Uma sala observada vazia tem 0 conexões. Não há leitura de ocupação de toda a Vila em `/indicators`. Para conexões, agregar as salas com horário e cobertura da leitura. Para pessoas, Augusto precisa definir quem entra e como identificar duplicatas. Falha em uma sala torna o total incerto. [Sala][room] · [Servidor][do] · [Cliente][net] · [HUD][hud] |
| Visitantes históricos | Não há registro persistente de entrada de cada visitante da Vila no D1. `users` identifica contas, `sessions` registra sessões autenticadas, e o ID de sala expira. O GTM instalado e a medição parcial documentada em OQ-13 não fornecem ao painel uma série validada. | Unidade pretendida: visitante distinto desde uma data de início conhecida. A chave para visitante anônimo, navegador ou conta e a retenção estão em aberto. | A mesma pessoa pode retornar, trocar de aparelho, abrir abas ou se autenticar depois. Contar conexões ou logins incorpora essas repetições. | Chave ausente. Sem cobertura verificável, histórico indisponível. Aprovar identidade, início e retenção. Registrar a entrada com essa chave ou validar uma série existente com a mesma cobertura. Zero só faz sentido num período integralmente medido. [D1 de contas e eventos][accounts] · [OQ-13][oq] |
| Visitas por casa de ONG | Abrir o painel de um terreno chama `record("causes-visit-lot", lotId)`, salvo terreno marcado como não listado. O painel também pode ser de terreno vazio. A quest `newest-house-visit` exige casa publicada e quest ativa. | A fonte atual mede progresso por conta/missão/terreno ou progresso local do visitante. O indicador pedido precisa da casa/ONG na data da visita, de uma janela e de uma unidade: entrada ou visitante distinto. | A missão tem alvo 1. Depois do primeiro terreno, o cliente normal descarta inclusive visitas a outros terrenos. Reabrir a casa, reenviar o mesmo progresso ou reconectar não produz um histórico de entradas. | Chave ausente. Zero linhas de progresso não prova zero visitas. Após Augusto validar o vínculo histórico terreno–ONG, Pedro deve emitir uma ocorrência por entrada acordada com identificador reaproveitado no reenvio. Fixar quando uma reentrada conta. [Painel do terreno][lot] · [Missões][missions] · [Gravação no cliente][store] |
| Jogadores por minijogo | O catálogo oferece `memory`. “Jogar” abre o painel. A vitória gera `play-memory:win` e, com a quest aplicável ativa, também `memory-win`. Reiniciar a rodada é local. | A fonte atual permite identificar a primeira vitória sincronizada de uma conta. A métrica pedida exige jogador distinto por jogo e período, inclusive quem jogou sem vencer se esse for o critério. | Abandonar antes de vencer deixa zero vitórias. Novas vitórias esbarram na missão já concluída. Somar missões e quests pode duplicar a mesma vitória. Outra aba ou reconexão não identifica uma nova partida. | Chave ausente. Sem evento de início, zero vitórias não prova zero jogadores. Pedro define o ponto de início, o ID do jogo e o tratamento de retomada. Se a unidade for jogador, deduplicar por identidade e jogo na janela. Para partidas, identificar cada rodada. [Catálogo][games] · [Memória][memory] · [Progresso na API][progress] |

O D1 impõe chave primária `(user_id, mission_id, event_id)`. A API aceita eventos conhecidos, exige sessão para gravar e protege gravações concorrentes. O jogo guarda o progresso do visitante no navegador e pode enviá-lo ao autenticar. Assim, `progress_events.created_at` data a gravação, que pode ocorrer depois da visita. A API valida IDs e transições de quest, mas não observa a cena 3D. O evento local de missão concluída, os marcos da #66 e a leitura do painel `causes-global-donation:panel` têm finalidade de progresso. [Schema][accounts] · [Gravação e replay][progress] · [Sincronização][sync] · [Missões][missions]

## Dicionário financeiro

**Regra da consulta vigente.** Cada linha de `donations` representa uma doação registrada. Os agregados incluem as linhas cujo **estado atual** é `paid`, sem limite de data. `amount_cents` é o valor bruto em centavos de real. A dimensão do destino vem de `target_kind`; a rota global tem uma parceira configurada. A janela mede o saldo de confirmações vigentes desde o início da base e pode diminuir após disputa ou estorno. [Schema de doações][schema] · [Resolução de destino e transições][money]

| Indicador | Fonte, unidade e dimensão | Janela e regra de repetição | Zero ou indisponibilidade hoje |
|---|---|---|---|
| Quantidade global | Calculável no D1: `COUNT(*)` das linhas `paid` com `target_kind='global'`. Unidade: uma doação à parceira global. | Acumulado no estado atual. Uma linha por cobrança Pix, ainda que a confirmação se repita. | Sem chave específica em `/indicators`. Consulta habilitada e legível sem linhas elegíveis → 0. Sem fonte → propor `null` com motivo. |
| Valor global | Mesmo recorte global, `COALESCE(SUM(amount_cents),0)`. Unidade: centavos brutos. | Acumulado no estado atual. Somar cada cobrança uma vez, antes da divisão. | Sem chave específica. Fonte legível sem doações globais pagas → 0 centavos. Sem fonte → propor `null`. |
| Quantidade por ONG | `GET /ngos/:id/donation-info`, campo `confirmedDonations`. `COUNT(*)` com `ngo_id=? AND status='paid'`. Unidade: uma doação registrada para a ONG consultada. | Acumulado no estado atual por ID da ONG. Um Pix por cobrança. Inclui prova externa validada pelo administrador. | Sucesso sem linhas → 0. Rota desligada ou ONG sem publicação em terreno publicado → HTTP 404. Sem D1 ou schema requerido → 503. Sem cartão por ONG em P02. |
| Valor por ONG | Mesma rota e filtro, campo `confirmedAmountCents`. Soma bruta em centavos da ONG consultada. | Acumulado no estado atual. Cada linha `paid` entra uma vez, inclusive prova externa registrada. A parcela destinada à ONG está em campo separado. | Sucesso sem linhas → 0 centavos. Restrição da rota → 404 ou 503 conforme acima. |
| Quantidade total | `GET /indicators` → `confirmed_donations`. `COUNT(*)` de todas as linhas `paid`. Unidade: uma doação por registro, global ou dirigida. | Acumulado no estado atual. Inclui todas as destinações, mesmo que a casa já tenha saído do mapa. Deduplicação do Pix por cobrança. | Fonte legível sem linhas → 0. Bandeira desligada, sem binding D1 ou sem tabela de doações → `null`/—. Erro inesperado pode falhar a requisição inteira. |
| Valor total | `GET /indicators` → `confirmed_amount`. `COALESCE(SUM(amount_cents),0)` de todas as linhas `paid`. Unidade: centavos brutos em todos os destinos. | Acumulado no estado atual, uma soma por linha elegível. O total inclui o global uma única vez. | Fonte legível sem linhas → 0 centavos. Mesmas condições de `null`/— e falha integral da quantidade total. |

As duas últimas linhas usam todo o conjunto de doações. Somar apenas as ONGs que o mapa publica hoje pode omitir casas retiradas. A lista administrativa de doações recentes tem limite de 50 registros e também não serve de total. [Consulta pública][api] · [Consulta por ONG e visão administrativa][money]

**O que entra na soma.** O Pix usa uma chave de idempotência por intenção, uma cobrança identificada pelo provedor e um ID por evento recebido. As transições atualizam a doação existente. `under_dispute` e `refunded` saem da contagem, e uma disputa ganha pode restaurar `paid`. Uma intenção pendente, um clique em link próprio, uma compra de skin e o crédito de Título não são fontes do agregado. Uma prova externa conferida e registrada como `paid` entra no valor e na quantidade da ONG e da Vila, mesmo com `title_credited=0`. O cadastro manual não garante unicidade por comprovante, portanto a repetição manual pode inflar os agregados por ONG e total. As consultas atuais também não filtram `dev_mode`; confirmar isolamento do ambiente ou exclusão de testes antes de publicar números reais. [Criação e conciliação][money] · [Intenções e eventos pendentes][intents] · [Teste da confirmação][moneytest] · [Teste da prova externa][proof]

## Exemplo de contagem

Uma única pessoa de teste, em uma aba e com conta inicialmente sem progresso, abre a casa publicada A, fecha o painel e perde a conexão. Depois que o socket antigo sai, ela reconecta, volta à mesma casa, joga uma rodada de Memória que abandona antes da vitória e faz um Pix **global de R$ 10,00**. A mesma confirmação chega duas vezes. A base controlada começa vazia de doações, com as fontes disponíveis.

| Indicador | Resultado para o cenário |
|---|---|
| Simultâneos | Na sala isolada, 1 → 0 → 1 conexão. Pico de 1. Duas abas ao mesmo tempo dariam 2 conexões. A API pública não informa quantas pessoas estão na Vila. |
| Visitantes históricos | O roteiro conhece 1 pessoa. O sistema não oferece uma contagem histórica verificável. |
| Visitas à casa A | 2 aberturas, 1 visitante, 1 evento de progresso da missão no fluxo normal sincronizado. Se a regra aprovada for por entrada, o esperado é 2. Se for por pessoa única, é 1. Hoje a métrica está indisponível. |
| Jogadores de Memória | 1 pessoa iniciou a rodada, 0 vitórias e 0 eventos de vitória. O número de jogadores permanece indisponível. |
| Doações globais | 1 doação e 1.000 centavos (R$ 10,00). |
| Doações por ONG | A recebe 0 doações dirigidas e 0 centavos. O mesmo vale para uma ONG B de controle. Visitar A não altera o destino da cobrança. |
| Doações totais | 1 doação e 1.000 centavos (R$ 10,00). O replay conserva os dois valores. |

**Evidência local.** O exemplo de navegação acima aplica as regras do código. A prova financeira usou SQLite em memória com as 15 migrações do projeto. Antes da cobrança, a consulta total retornou `(0, 0)`. Depois das duas entregas sintéticas do mesmo evento, a primeira inserção do identificador alterou uma linha e a repetição alterou zero. O recorte global e o total retornaram `(1, 1000)` e o recorte da ONG A retornou `(0, 0)`. Este exercício verifica o esquema e as agregações. Em separado, o teste da API percorreu o handler com provedor simulado para um Pix dirigido de 1.000 centavos, incluindo a confirmação repetida. [Banco de teste que aplica as migrações reais][dbtest] · [Teste de confirmação][moneytest]

Na revisão indicada acima, **6 testes focalizados de API/progresso e 3 de presença passaram**. Para reproduzir os mesmos filtros a partir da raiz da revisão:

```sh
(cd apps/api && ./node_modules/.bin/vitest run --maxWorkers=1 src/api.test.ts src/donations.test.ts src/progress.test.ts -t 'indicators never invent|indicators count only|marks the donation paid|reverses the credit on a refund|records an admin-verified proof|recovers missions')
(cd apps/server && ./node_modules/.bin/vitest run --maxWorkers=1 src/room.test.ts -t 'assigns anonymous ids|also after a reconnect|removes only members idle')
```

## Primeiro PR de implementação e decisões que faltam

**N5.2 proposta: quantidade de doações globais confirmadas, em um ambiente identificado.** Reusar D1 e o contrato de disponibilidade de `/indicators`. A definição candidata é uma cobrança no destino global em estado atual `paid`. Não exige migração nem evento de cliente. Nicolas e Augusto escolhem primeiro o público (P02 público ou painel administrativo). Bernard ratifica o significado de “confirmada”, e a frente de conciliação N3 valida a origem financeira.

```sql
SELECT COUNT(*) AS n
FROM donations
WHERE target_kind = 'global' AND status = 'paid';
```

**Aceite proposto para N5.2.** Em base controlada, confirmar um Pix global, repetir sua confirmação e incluir um Pix pago dirigido como controle. Conferir as duas linhas de origem: o total geral deve ser 2 e o global, 1. Em base legível sem globais pagas, o indicador deve ser 0. Com a fonte indisponível, deve vir `null` com motivo. O consumidor exibe, respectivamente, “1”, “0” e “—”. Anexar a fixture e as respostas esperada e observada ao PR de implementação. Se a base misturar produção e sandbox, acordar o filtro de ambiente e incluí-lo no teste.

| Quem decide | Pergunta que muda o número ou a coleta |
|---|---|
| Augusto, com Nicolas | Quem verá cada número e desde quando? Para simultâneos, basta informar conexões por praça ou é preciso contar pessoas em toda a Vila, inclusive no modo solo? Como tratar duas abas, reconexão e sala sem leitura? Para visitantes históricos, qual identificação e retenção são aceitas, e como tratar a passagem de visitante para conta? Qual ID vincula lote e ONG no momento da visita se a ocupação mudar? |
| Pedro, com Augusto | Na casa, vale abrir o painel, entrar na cena ou voltar depois de sair? Conta por entrada, sessão ou visitante? No minijogo, vale “Jogar”, a primeira jogada, a conclusão ou a vitória? Qual ID de jogo/rodada sobrevive à retomada? Quais IDs e categorias de missão da #66 serão usados para distinguir essas ações de um marco de progresso? |
| Bernard, com N3 | Confirmar quantidade e valor para cada destino. O valor comunicado é bruto, parcela destinada ou líquido após tarifas? Como apresentar disputa, estorno e recuperação? O que constitui prova externa única e como indicar pagamentos por link próprio sem comprovação? Essas escolhas afetam o rótulo, a soma e a possibilidade de conciliar o painel com o extrato. |

[api]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/api.ts#L176-L215
[release]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/docs/reference/releases.md
[ui]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Indicators.tsx#L12-L51
[http]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/lib/api.ts#L40-L69
[room]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/server/src/room.ts#L82-L137
[do]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/server/src/room-do.ts#L47-L89
[net]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/net/multiplayer.ts
[hud]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Environment.tsx
[accounts]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/migrations/0004_accounts_ngo_applications.sql#L8-L44
[oq]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/docs/decisions/open-questions.md
[lot]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Lot.tsx#L33-L46
[missions]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/packages/shared/src/game/progress.ts
[store]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/game/store.ts#L363-L378
[games]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/Games.tsx
[memory]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/ui/MemoryGame.tsx#L42-L51
[progress]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/progress.ts
[sync]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/client/src/lib/account.ts#L194-L250
[schema]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/migrations/0011_donations_abacatepay.sql
[money]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/donations.ts
[intents]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/migrations/0013_donation_durable_intent.sql
[moneytest]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/donations.test.ts#L360-L431
[proof]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/src/donations.test.ts#L594-L614
[dbtest]: https://github.com/vilanoeldobem/project/blob/2c294767aa7756ceaf759eadb4799b7175dedc73/apps/api/test/d1.mjs
