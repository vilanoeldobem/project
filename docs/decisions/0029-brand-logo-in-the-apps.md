# IMPL-0029: Logotipo da marca em teste nas três aplicações (site, jogo e painel)

**Status:** Aceita (2026-11-18) — aplicação do logotipo em teste. A aprovação da logo final continua **PENDENTE**
(DEC-024, PEN-016).
**Data:** 2026-11-18
**Fontes:** instrução do dono do produto em 2026-11-18 ("colocar a logo nova em vários locais nos apps", incluindo
o backoffice); decisões DEC-022 e DEC-025 (padrão 3D/voxel; logo 3D com letras grandes e grossas), DEC-024
(A3 — Portal Luminoso escolhido provisoriamente, em teste) e PEN-016 (logo final pendente); arquivos do repositório
de documentação `vilanoeldobem/docs`, em `assets/logo/logo-modelo-b-*.png` (variantes selecionadas em 2026-11-12,
presentes apenas no ramo `codex/cloudflare-tracker`); [IMPL-0005](0005-public-site-and-domains.md) (decisão 3, que
antes fixava um marcador temporário em texto) e [IMPL-0026](0026-boards-ui-and-character-appearance.md) (barra com a
marca no jogo); código: `apps/site/src/{App.tsx,VoxelArt.tsx,styles.css}`,
`apps/site/public/{logo-vilanoeldobem.png,img/brand-og.png,favicon.svg}`,
`apps/client/src/{App.tsx,styles.css}` e `apps/client/src/ui/{BrandMark.tsx,Hud.tsx}`,
`apps/dash/src/ui/{Shell.tsx,SignIn.tsx}` e `apps/dash/src/styles.css`.

## Contexto

Os três apps eram entregues com um marcador temporário em texto (`VILA NOEL` / `DO BEM`, desenhado em código) e um
favicon de árvore voxel. A IMPL-0005, decisão 3, proibia apresentar uma imagem de logo como a marca do site enquanto
a logo não fosse aprovada; a IMPL-0026 levou o mesmo marcador para a barra do jogo, e o painel administrativo
(IMPL-0015) nunca teve marca visual. O dono do produto produziu e selecionou a versão **Modelo B** do logotipo
(vila voxel, estrela e letras em fita vermelha, com variantes positiva e negativa de aplicação) e pediu, em
2026-11-18, que ela aparecesse nos apps — site, jogo e backoffice — e também nos pontos de marca (favicon e
compartilhamento). A logo continua **em teste**: a aprovação da forma final, da paleta e das versões reduzidas
segue pendente em PEN-016.

Limites técnicos que condicionam a solução:

- cada Worker serve o seu próprio `public/`; nenhum app importa outro nem lê o repositório de documentação em
  tempo de execução;
- o PNG selecionado tem fundo transparente com letras creme: lê bem sobre o verde-pinho e mal sobre superfícies
  claras;
- não existe, entre os arquivos selecionados, um PNG transparente da variante negativa (a versão escura só aparece
  dentro de uma prancha de aplicação, sobre fundo chapado);
- a CSP dos três apps já permite `img-src 'self'`, então a marca não exige mudança de política.

## Decisão

1. **A marca passa a ser a imagem do logotipo Modelo B**, aplicada por instrução do dono do produto. Um único PNG
   recortado do original (1062 × 1005 px de conteúdo, reduzido para 380 × 360 px) é copiado, byte a byte, para
   `apps/site/public/`, `apps/client/public/` e `apps/dash/public/` como `logo-vilanoeldobem.png`. A duplicação
   segue o padrão já usado pelo `favicon.svg` e evita dependência entre apps e com o repositório de documentação.
2. **Site publicado (`www`)**: o logotipo substitui o marcador em texto no cabeçalho (48 px de altura, dentro do
   link da marca) e aparece no rodapé (40 px). O desenho decorativo `VoxelCrestMark` é removido, porque não há mais
   lugar para ele ao lado da marca real. A imagem de compartilhamento (`og:image`) passa a ser uma peça nova de
   1200 × 630 px: o logotipo centralizado sobre o verde-pinho, com filete dourado, sem slogan e sem promessa
   (PEN-015); as dimensões e o texto alternativo vão declarados no `index.html`.
3. **Jogo (`play`)**: o componente `Wordmark` (texto) vira `BrandMark` (imagem, com o nome acessível). Ele aparece
   na tela de carregamento, sobre uma placa verde-pinho com filete dourado — a superfície clara do carregamento não
   tem contraste para as letras creme —, e na barra do HUD (32 px), conforme a IMPL-0026. A placa reaproveita a
   mesma linguagem da barra do HUD, não cria cor nova.
4. **Painel administrativo (`dash`)**: a imagem entra no cabeçalho (44 px, ao lado de "Painel administrativo") e
   acima do cartão de entrada (120 px), sobre o fundo verde-pinho da página. Como `Frame` serve a entrada, o
   "confira seu e-mail", a recusa de quem não é administrador e a conta bloqueada, todos esses estados ganham a
   mesma marca. O texto repetido "Vila Noel do Bem · Painel administrativo" sai do kicker; o nome acessível fica na
   imagem.
5. **Favicon**: os três `favicon.svg` passam a ser a estrela do logotipo — o sinal que a marca usa no topo da
   composição — desenhada em blocos inteiros sobre o verde-pinho, com o miolo creme. É a versão de símbolo reduzido
   que o guia de identidade ainda lista como faltante; não é uma nova logo.
6. **Contrato de verificação**: `apps/site/scripts/verify.mjs` passa a exigir duas imagens de marca na página
   inicial (cabeçalho e rodapé) e `og:image` apontando para `/img/brand-og.png`; o `/404.html` continua sem imagem
   de marca. Os testes do jogo e do painel passam a exigir o `<img>` com nome acessível, no lugar do texto.

## Consequências

- A marca visível nos três apps deixa de ser provisória em texto: é a mesma imagem em todos, com o mesmo nome
  acessível, e a aprovação final da logo continua aberta (PEN-016). Nada neste ADR declara a logo aprovada.
- A decisão 3 da IMPL-0005 fica substituída apenas no que diz respeito ao logotipo; o restante da IMPL-0005
  continua valendo. O histórico dela é preservado.
- Trocar a arte no futuro significa substituir três cópias do PNG e regenerar o favicon e a peça de
  compartilhamento — o custo de manter os apps independentes.
- Enquanto não houver PNG transparente da variante negativa, superfícies claras usam a placa verde-pinho (jogo) ou
  o fundo verde da página (painel); uma futura variante negativa pode substituir esses dois enquadramentos sem
  mudar o resto.
- O peso novo é modesto: 202 KB de PNG por app e 272 KB da peça de compartilhamento, servidos como arquivos
  estáticos.

## Alternativas consideradas

- **Manter o marcador em texto até a aprovação final (PEN-016).** Recusada pelo dono do produto em 2026-11-18: ele
  pediu a logo nos apps agora.
- **Usar o A3 — Portal Luminoso**, o logo em teste da DEC-024 que já está no ramo principal da documentação.
  Recusada pelo dono do produto nesta rodada: a versão escolhida é a Modelo B, com as variantes de aplicação
  selecionadas em 2026-11-12.
- **Apontar os apps para o repositório de documentação.** Recusada: os apps não leem outro repositório em tempo de
  execução, e cada Worker serve só o próprio domínio.
- **Criar a variante negativa transparente recortando a prancha de aplicação.** Adiada: recortar o fundo chapado
  produziria uma arte nova sem revisão; a placa verde-pinho resolve o contraste com o que existe.

## Relacionados

[IMPL-0005](0005-public-site-and-domains.md) (site público; decisão 3 substituída quanto ao logotipo) ·
[IMPL-0015](0015-dash-backoffice-app.md) (painel administrativo) ·
[IMPL-0026](0026-boards-ui-and-character-appearance.md) (barra do jogo com a marca) ·
[open-questions.md](open-questions.md) (OQ-16, marca na tela de jogo). Produto: DEC-022, DEC-024, DEC-025 e PEN-016
no repositório `vilanoeldobem/docs`.
