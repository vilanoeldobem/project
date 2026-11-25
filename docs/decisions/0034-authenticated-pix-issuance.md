# IMPL-0034 · Conta para emitir Pix na Vila

**Status:** Proposta implementada para revisão. As bandeiras de produção permanecem desligadas.
**Data:** 22/11/2026
**Fontes:** [Atribuição de backoffice e integrações #65](https://github.com/vilanoeldobem/project/issues/65), [OQ-02](open-questions.md).

## Contexto

A #65 pede cadastro para doar e exploração livre da Vila. A versão anterior já podia registrar uma intenção ou cobrança de visitante. A conciliação precisa alcançar esses registros mesmo quando a pessoa nunca cria conta.

## Decisão

A emissão de Pix usa a sessão da conta tanto para a doação global quanto para a casa de uma ONG. A API verifica a sessão novamente na transação que cria a intenção. A chave de repetição continua vinculada ao destino, ao valor e ao doador originais. Somente pedidos de emissão novos consomem a cota da conta.

Uma repetição anônima compatível com uma intenção legada usa o processamento da IMPL-0028. Ele pode devolver a cobrança existente ou materializar a resposta do provedor que o D1 guardou antes de uma falha. A repetição preserva o destinatário e o doador registrado, permite aplicar uma confirmação em espera e dispensa nova chamada financeira.

## Alternativas consideradas

Exigir sessão em todas as rotas de doação impediria a recuperação de pedidos antigos e atingiria o webhook. Aplicar a regra somente na interface deixaria a emissão direta pela API disponível.

## Consequências

O consumidor de `POST /donations/pix` precisa de uma sessão para emitir. O fluxo de autenticação e retomada no jogo tem implementação própria. Configuração pública, leitura das casas, acompanhamento da cobrança, webhook e saída para o site da ONG conservam seus contratos. A regra usa as tabelas e as bandeiras existentes.

## Relacionados

[API de doações](../reference/api.md) · [Sistema de doações](0023-donations-abacatepay.md) · [Intenção durável e limite](0028-donation-durable-intent.md)
