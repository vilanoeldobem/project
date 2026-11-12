# Perfil público de ONG — primeiro incremento de D09

**Data:** 12/11/2026 · **Base do código:** `e2fa200` · **Estado:** implementação para revisão em PR.

## Objetivo e fontes

Entregar ao jogo os textos e projetos já aprovados de uma ONG publicada, usando o D1 existente. Augusto continua
responsável pela apresentação no jogo; esta entrega acrescenta somente leitura na API.

Fontes do repositório `vilanoeldobem/docs`, consultadas na revisão
`e5f232deb70e68bcccdef9bfb2036552ce3ac091`:

- [Especificação funcional, itens 3, 4 e 12](https://github.com/vilanoeldobem/docs/blob/e5f232deb70e68bcccdef9bfb2036552ce3ac091/docs/specs/especificacao-funcional.md):
  casas de ONGs aprovadas apresentam descrição, fotos, tags e projetos; a candidatura não publica a casa.
- [Registro de decisões, DEC-028, DEC-029 e DEC-037](https://github.com/vilanoeldobem/docs/blob/e5f232deb70e68bcccdef9bfb2036552ce3ac091/docs/decisions/registro-de-decisoes.md):
  conteúdo institucional, HUD e aprovação administrativa antes da publicação.
- [Acompanhamento oficial, D09](https://github.com/vilanoeldobem/docs/blob/e5f232deb70e68bcccdef9bfb2036552ce3ac091/management/acompanhamento/acompanhamento.json):
  “Conectar casa publicada ao conteúdo da ONG”, responsável Nicolas, dependência D08. Aceite completo:
  “Casa publicada exibe descrição, fotos, tags e projetos aprovados”.
- [Plano de desenvolvimento](https://github.com/vilanoeldobem/docs/blob/e5f232deb70e68bcccdef9bfb2036552ce3ac091/management/plano-de-desenvolvimento.md):
  experiência visual e HUD com Augusto; dados e integração da casa constituem uma frente separada.

**Recorte:** este PR entrega a base textual da API. Não conclui D09 inteiro: fotos e exibição no jogo permanecem
pendentes. A direção de produto é confirmada; o formato técnico abaixo é a proposta implementada para revisão.

## Contrato mínimo

`GET /ngos/:id` devolve:

```ts
{
  ngo: {
    id: string;
    name: string;
    summary: string | null;
    description: string | null;
    city: string | null;
    tags: string[];
    projects: Array<{ title: string; description: string }>;
    lotId: string;
  };
}
```

`summary` já admite `NULL` no schema original. Campos textuais novos também admitem `NULL` em registros anteriores
à candidatura da versão 0.4.0. Ausência não vira texto inventado. Tags/projetos nulos ou com JSON inválido recebem
listas vazias; a leitura projeta somente os campos públicos esperados dos projetos.

`GET /lots` mantém os campos existentes e acrescenta `ngo_id: string | null`. O jogo poderá usar esse identificador
para consultar o perfil. Não há segunda rota por terreno neste incremento.

O perfil só é elegível quando a consulta encontra **a associação real** `lots.ngo_id = ngos.id`, com
`ngos.status = 'published'` e `lots.state = 'published'`. O campo de candidatura `requested_lot_id` não substitui essa
associação; registros legados podem não tê-lo preenchido. A mesma condição limita a identidade pública da ONG em
`/lots`, incluindo nome, resumo e identificador.

- ONG desconhecida, não publicada ou sem terreno publicado associado: `404 {"error":"not_found"}`.
- Binding D1 ausente: `503 {"error":"db_unavailable"}`.
- Leitura pública, independente de sessão e de `ACCOUNTS_ENABLED`, seguindo CORS, GET/HEAD e `no-store` da API.
- Nenhuma mutação, concessão de papel, linha de auditoria ou pagamento decorre de consultar o perfil.
- A consulta seleciona explicitamente as colunas públicas. Não reaproveita a resposta privada da candidatura.
- CNPJ, data de abertura, conta solicitante, e-mail, nome da pessoa, declarações, comprovações e mensagem de revisão
  ficam fora do contrato. Objetos de projeto também não transportam propriedades adicionais armazenadas no JSON.

## Tarefas e responsabilidades

| Ordem | Tarefa | Responsável | Critério de aceite |
|---|---|---|---|
| 1 | Implementar consulta e rota de perfil público | AIOX Dev | Só a associação publicada devolve os campos permitidos; inexistente e não publicada têm a mesma resposta. |
| 2 | Acrescentar identificador público em `/lots` | AIOX Dev | Campos anteriores preservados; identificador nulo fora da condição de publicação; cliente atual continua compatível. |
| 3 | Cobrir contrato e fronteira de publicação com SQLite real | AIOX Dev / QA | Casos de publicação, associação, campos privados, legado, JSON e ausência do banco comprovados por testes. |
| 4 | Atualizar referência da API e changelog | AIOX Dev | Exemplo, nulabilidade, erros, condição de publicação e recorte parcial documentados junto ao código. |
| 5 | Validar a árvore final e publicar PR | Coordenação / AIOX DevOps | Checagens exigidas passam; diff restrito à API, testes e documentação; PR disponível para Augusto revisar. |
| 6 | Consumir o contrato no HUD da casa | Augusto, entrega seguinte | Usar `ngo_id` do terreno e renderizar os dados da API; tratar `404` se a publicação mudou entre as duas leituras. |

## Verificação necessária

1. ONG publicada ligada a terreno publicado devolve exatamente o perfil permitido, sem autenticação, mesmo com
   contas desligadas. O identificador em `/lots` corresponde ao perfil.
2. Cada outro estado de candidatura, terreno não publicado e ONG publicada sem associação elegível devolvem `404`;
   `/lots` não revela sua identidade como ONG pública.
3. Campos privados preenchidos nas fixtures não aparecem no JSON de nenhuma resposta pública. Propriedades extras
   em projetos armazenados também não atravessam a projeção.
4. Campos legados nulos, listas vazias, JSON inválido e formas inesperadas não causam exposição nem resposta `500`.
5. IDs inexistentes, ausência de binding, métodos e CORS continuam com os comportamentos documentados.
6. Consultas não alteram dados. Nenhuma fixture sintética é inserida em banco remoto.
7. Rodar `typecheck`, testes e `build` conforme `AGENTS.md`, respeitando a carga local. Registrar resultados reais
   da revisão final; a existência deste plano não comprova aprovação dos testes.

## Limites e passagem para operação

- Nenhuma edição em `apps/client`, `apps/server`, `apps/dash`, regras de missões, colisões ou desenho do mundo.
- Nenhum banco adicional, migration nova, R2, upload ou alteração de segredo. Os campos usados já existem no schema
  da `main`, a partir da migration `0004_accounts_ngo_applications.sql`.
- A produção verificada anteriormente ainda estava no schema 0003. Antes de publicar código que consulte os novos
  campos, confirmar o schema remoto e a aplicação autorizada das migrations existentes. Este PR não as aplica.
- Merge, deploy, migrações remotas e ativação de contas continuam etapas separadas. O destino desta entrega é um PR
  para revisão do Augusto.
- Fotos exigem contrato de conteúdo e armazenamento próprio; não acrescentar campo vazio que aparente essa entrega.
  Estatísticas sem fonte, doações, revisão editorial posterior e retirada de casas permanecem fora deste incremento.

O contrato conserva o schema e os fluxos de aprovação atuais. A contrapartida é uma consulta adicional do jogo para
abrir o perfil; isso mantém a listagem de terrenos pequena e evita misturar dados administrativos com os públicos.
