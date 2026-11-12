# IMPL-0017: Arquivos das candidaturas de ONG no R2 (logo e documentos)

**Status:** Proposta — implementada e testada, **desligada em produção** (`NGO_FILES_ENABLED = "false"`); o bucket
ainda não foi criado e a migration 0006 não foi aplicada no remoto
**Data:** 2026-11-12
**Fontes:** pedido do responsável técnico em 2026-11-11 ("make sure workers, d1, r2 and durable objects are working
properly and created properly"; R2 para logos e documentos de ONG: "yes") e em 2026-11-12 (R2 habilitado na conta);
[IMPL-0011](0011-accounts-magic-link-ngo-review.md) (que adiou o upload de documentos); DEC-015, DEC-028, DEC-037;
PEN-019; documentação da Cloudflare consultada em 2026-11-12 (limites do D1, preços e localização de dados do R2,
buckets públicos, limites dos Workers); código:
`packages/shared/src/accounts/files.ts`, `apps/api/src/files.ts`, `migrations/0006_ngo_files.sql`,
`apps/api/wrangler.jsonc`

## Contexto

A candidatura de ONG ([IMPL-0011](0011-accounts-magic-link-ngo-review.md)) nasceu sem upload: a organização declara
os três critérios do DEC-015 e a administração pede os documentos por fora. O D1 era o único armazenamento
persistente do servidor, e ele não serve para arquivos. Faltava também o logo da organização, que a casa publicada
deveria mostrar (DEC-028).

O que **não** está decidido: quais documentos uma ONG precisa enviar (PEN-019) e por quanto tempo eles ficam
guardados (OQ-12). Documentos de ONG podem trazer dados pessoais de representantes; menores são público provável da
Vila (LGPD, ECA Digital), embora quem candidata uma ONG seja um adulto responsável por ela.

## Decisão

1. **Um bucket R2 privado**, `vilanoeldobem-files`, ligado só ao Worker da API pelo binding `FILES`. Sem endereço
   público (`r2.dev` desligado, sem domínio próprio): todo byte passa pela API, que decide quem lê. A chave do
   objeto é `ngo/<id da ONG>/<id do arquivo>`, dois UUIDs, sem nome de arquivo.
2. **O D1 continua sendo a fonte da verdade.** A tabela `ngo_files` (migration 0006) guarda tipo, formato, tamanho
   e quem enviou; o R2 guarda só os bytes. **O nome original do arquivo não é guardado** em lugar nenhum: ele
   costuma trazer nome de pessoa. Os downloads se chamam `logo.png` e `documento-N.pdf`.
3. **Dois tipos de arquivo (PROPOSTA):**

   | Tipo | Quantos | Formatos | Tamanho | Lados da imagem | Quem lê |
   |---|---|---|---|---|---|
   | `logo` | 1 | PNG, JPEG | até 512 KB | 64 a 1024 px | público **só depois** da aprovação |
   | `document` | até 5 | PDF, PNG, JPEG | até 5 MB cada | até 8192 px | só quem enviou e os admins |

   Nenhum documento é obrigatório nem tem nome: a lista é do dono do produto (PEN-019).
4. **Bandeira própria:** `NGO_FILES_ENABLED` (`"false"` em produção). O envio só existe com ela, com
   `ACCOUNTS_ENABLED` e com o bucket ligado; `GET /config` devolve `files`. Sem isso as rotas respondem
   `404 files_disabled` e as telas não mostram nada de arquivo.
5. **A API confere o conteúdo, não o que o navegador diz.** O formato vem da assinatura dos bytes e tem de ser igual
   ao `Content-Type`; SVG e HTML são recusados (carregam script); o tamanho é conferido no cabeçalho e de novo
   enquanto os bytes chegam; a imagem tem de estar bem formada e dentro do limite de pixels, lido do cabeçalho do
   arquivo (um arquivo pequeno pode abrir como uma imagem gigante). A mesma função (`checkFile`) roda no navegador
   para avisar antes do envio.
6. **Imagens são guardadas sem metadados.** EXIF (GPS, aparelho, miniatura), XMP, comentários, blocos de texto do
   PNG e qualquer byte depois do fim da imagem são removidos; do EXIF do JPEG fica só a orientação, para foto de
   celular não aparecer deitada. Os pixels não mudam. PDF é guardado como veio.
7. **Arquivos servidos inertes:** `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none';
   sandbox`, documentos sempre como download (`Content-Disposition: attachment`), `no-store` nas rotas de conta.
8. **Mudar arquivo muda a revisão.** Enviar ou remover um arquivo soma 1 em `ngos.revision`. A decisão do admin
   carrega a revisão que ele viu: se os arquivos mudaram, ela é recusada (`409 stale_revision`), e nada que ninguém
   analisou é publicado. **Depois de publicada, a ONG não troca mais arquivo** (DEC-037: só admin publica).
9. **Leitura de documento por admin é auditada** (`ngo.file_read`, com o id do admin e do arquivo). Enviar e remover
   também (`ngo.file_add`, `ngo.file_remove`). Ver o logo não grava nada.
10. **Exclusão de conta (`DELETE /me`)** apaga do R2 e do D1 os documentos da pessoa e o logo de candidatura não
    publicada. O logo de uma ONG publicada fica, como a própria ONG. Isso vale sempre que o bucket estiver ligado,
    mesmo com a bandeira desligada depois.
11. **Limite de envios:** 20 por minuto por conta (binding `FILE_LIMITER`).
12. **Escritas levam `X-Vila-Account`** (a conta que a página acredita estar logada), como as escritas em JSON levam
    `accountId`: o corpo aqui é o próprio arquivo.

### D1 e R2 não têm transação em comum

- **Enviar:** o objeto é gravado primeiro; a linha em `ngo_files`, a nova revisão e a auditoria entram numa
  transação só, guardada pela revisão lida. Se a transação recusar (a candidatura mudou no meio), o objeto é apagado.
- **Remover:** a linha sai primeiro, depois o objeto.
- **Excluir conta:** os objetos saem primeiro, depois as linhas. Se o R2 falhar, a conta **não** é excluída e a
  pessoa tenta de novo.

Uma queda no meio deixa, no pior caso, um objeto que nenhuma linha aponta: inalcançável, só ocupa espaço. Nunca o
contrário (uma linha publicável sem bytes), exceto na exclusão de conta, onde apagar os bytes vem antes de tudo.

## Alternativas consideradas

- **Guardar arquivos no D1 (BLOB):** recusado; o D1 limita cada linha ou BLOB a 2 MB, abaixo dos 5 MB de um
  documento, e banco relacional não é lugar de arquivo.
- **Bucket público ou URL assinada do R2 direto no navegador:** recusado. Bucket público exporia qualquer chave
  descoberta; URL assinada exigiria credenciais S3 no Worker e deixaria o conteúdo entrar sem a conferência da API.
  Com tudo passando pelo Worker, o limite prático é o do corpo de uma requisição (100 MB no plano gratuito da
  zona), muito acima dos 5 MB.
- **Aceitar SVG ou WebP no logo:** SVG recusado (pode carregar script). WebP fica fora desta versão: exigiria outro
  limpador de metadados; pode entrar depois.
- **Reprocessar a imagem (redimensionar, recomprimir):** não adotado; exigiria biblioteca de imagem no Worker ou o
  serviço Cloudflare Images. Remover metadados resolve a privacidade sem mexer nos pixels.
- **Guardar o nome original do arquivo:** recusado (dado pessoal sem necessidade).
- **Antivírus ou análise do PDF:** não há serviço para isso nesta versão. Risco aceito e registrado abaixo.
- **Permitir troca de logo depois da publicação:** recusado até existir um fluxo de nova análise.

## Consequências

- O D1 deixa de ser o único armazenamento persistente: arquivos ficam no R2, e só eles. A regra do `AGENTS.md` foi
  ajustada.
- **Nada disso vale em produção ainda.** Faltam: criar o bucket (recurso novo, exige autorização), aplicar a
  migration 0006 no remoto, publicar a API e, só depois da revisão LGPD / ECA Digital cobrir os documentos, ligar a
  bandeira ([deploy §9](../guides/deploy.md#9-arquivos-das-ongs-no-r2-impl-0017)). O `wrangler deploy` da API **falha
  enquanto o bucket não existir** (falha segura: a versão anterior continua no ar).
- A API passa a ler `ngo_files` em `DELETE /me` sempre que o bucket estiver ligado: a migration 0006 tem de estar
  aplicada antes de as contas serem ligadas, como a 0004 e a 0005.
- **PDF não é inspecionado.** Um PDF pode trazer conteúdo malicioso ou dados além do necessário; quem baixa é um
  admin, num arquivo servido como download. Metadados do PDF (autor, programa) ficam como vieram.
- **Sem prazo de retenção.** Documentos ficam até a pessoa removê-los ou excluir a conta, inclusive depois de uma
  rejeição. O prazo é pergunta aberta (OQ-12) e entra na revisão LGPD.
- Os arquivos ficam na mesma conta Cloudflare, fora do Brasil, como o D1: o R2 não tem região na América do Sul. O
  bucket é criado com a dica de localização `enam` (leste da América do Norte), a mesma do D1; a dica é "melhor
  esforço", não garantia.
- Custo: até cerca de 25,5 MB por candidatura (5 documentos de 5 MB e um logo). O plano gratuito do R2 cobre 10 GB por mês,
  1 milhão de operações de escrita e 10 milhões de leitura; acima disso há cobrança. Não há limite global de candidaturas.
- Objetos órfãos (ver acima) não são varridos. Se aparecerem, uma rotina de limpeza compara o bucket com `ngo_files`.
- Imagem JPEG com orientação no EXIF continua dependendo do navegador para ser girada; o resto do EXIF some.

## Relacionados

- [IMPL-0011](0011-accounts-magic-link-ngo-review.md) (candidatura e análise), [IMPL-0015](0015-dash-backoffice-app.md)
  (painel onde os admins leem os arquivos), [open-questions.md](open-questions.md) (OQ-12)
- [api — Arquivos da candidatura](../reference/api.md#arquivos-da-candidatura-impl-0017),
  [storage — ngo_files](../reference/storage.md#ngo_files-v6), [deploy §9](../guides/deploy.md#9-arquivos-das-ongs-no-r2-impl-0017)
