# ProntoPrint

Aplicativo React Native para preparar arquivos de pequenas gráficas diretamente no dispositivo. O projeto usa Expo e TypeScript; não existe backend e nenhuma imagem é enviada para serviços externos.

## Estado atual

O primeiro fluxo navegável é o Editor:

1. Abertura imediata de uma folha A4 vazia.
2. Inclusão opcional de várias imagens da biblioteca local.
3. Inclusão posterior, movimentação, redimensionamento, multiplicação e remoção das imagens.
4. Textos móveis com edição de conteúdo, fonte, tamanho, cor, negrito e alinhamento.
5. Recorte 3×4 disponível nas ações da imagem, acionadas ao mantê-la pressionada.
6. Recorte local em JPEG de `900 × 1200 px`, aplicado somente à imagem escolhida.
7. Réguas em centímetros com indicadores da posição do elemento durante a edição.

Imagem para PDF e exportação final ainda aparecem como próximas etapas.

## Executar

Requisitos: Node.js LTS, pnpm e Expo Go ou um ambiente nativo Android/iOS.

```bash
pnpm install
pnpm start
```

Atalhos disponíveis:

```bash
pnpm android
pnpm ios
pnpm web
```

## Validar tipos

```bash
pnpm tsc --noEmit
```

## Estrutura

```text
src/
├── components/            # Cabeçalhos e botões compartilhados
├── features/
│   ├── home/              # Catálogo de ferramentas
│   ├── photo-3x4/         # Recorte da foto
│   └── editor/            # Documento e interações na folha
└── shared/
    ├── print/             # Regras e cálculos em milímetros
    ├── theme/             # Tokens visuais
    └── types/             # Tipos de domínio
```

Consulte `AGENTS.md` para as decisões de arquitetura e regras de evolução do projeto. O protótipo original permanece em `../design-prototype/` como referência de produto e visual.
