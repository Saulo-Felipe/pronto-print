# ProntoPrint — contexto para agentes

## Visão do produto

ProntoPrint é um aplicativo React Native mobile-first para pequenas gráficas e pessoas sem experiência em edição. O produto reduz tarefas recorrentes de impressão a fluxos curtos: escolher arquivos, informar somente medidas essenciais, conferir uma prévia fiel e exportar ou imprimir.

O primeiro fluxo funcional é o **Editor**: abrir uma folha A4 vazia, adicionar imagens e textos conforme necessário, posicionar os elementos e editar ou remover cada item. O recorte **Foto 3×4** é uma ação contextual de uma imagem no editor. O fluxo **Imagem para PDF** faz parte do MVP, mas ainda não está implementado.

O diretório `../design-prototype/` é uma referência de produto, conteúdo e linguagem visual. Ele não define a arquitetura do app e pode ser ajustado quando houver inconsistências com acessibilidade, APIs nativas ou experiência mobile.

## Stack e restrições

- React Native com Expo e TypeScript em modo estrito.
- O app deve funcionar em Android e iOS; web é secundário.
- Toda seleção, leitura, recorte, composição e exportação de arquivos acontece localmente no dispositivo.
- Não criar backend, upload, autenticação ou dependência de nuvem sem uma decisão explícita do projeto.
- Manter no estado apenas metadados serializáveis e URIs locais controladas. Não armazenar imagens grandes em base64.
- Antes de usar uma API do Expo, consultar a documentação correspondente ao SDK definido em `package.json`.
- Não abrir navegador ou emulador para validar estilos, salvo solicitação explícita do usuário.

## Arquitetura

```text
src/
├── components/             # Componentes visuais compartilhados
├── features/
│   ├── home/               # Catálogo de ferramentas
│   ├── photo-3x4/          # Recorte 3×4 acionado pelo editor
│   └── editor/             # Prévia e edição do documento de impressão
└── shared/
    ├── print/              # Cálculos puros em mm e criação de documentos
    ├── theme/              # Tokens semânticos do design
    └── types/              # Contratos compartilhados
```

As features podem depender de `components` e `shared`; `shared` não deve depender de features. Cálculos de impressão devem ser funções puras, independentes de componentes React.

## Modelo e medidas de impressão

- Milímetros são a unidade canônica do documento.
- Pixels existem somente nas bordas do sistema: imagem original, recorte raster e renderização da prévia.
- A folha A4 retrato mede `210 × 297 mm`; a foto 3×4 mede `30 × 40 mm`.
- Posição e dimensão de elementos devem ser limitadas à folha.
- A prévia responsiva converte mm para pontos apenas no momento da renderização.
- Exportações futuras devem preservar dimensões físicas e resolução, sem capturar a prévia da tela.

## Princípios de implementação

- Componentes pequenos, nomes orientados ao domínio e responsabilidades únicas.
- Evitar valores visuais soltos: usar `src/shared/theme/tokens.ts`.
- Não duplicar estado derivado. O `PrintDocument` é a fonte de verdade do editor.
- Operações do editor devem retornar novos objetos, sem mutar estado existente.
- Tratar cancelamento, permissão negada, arquivo inválido e falha de processamento com mensagens claras.
- Ações essenciais não podem depender de hover ou apenas de gestos; oferecer controles visíveis.
- Alvos de toque devem ter ao menos `44 × 44` pontos sempre que possível.
- Textos da interface são em português do Brasil e devem ser diretos, sem jargão técnico.

## Validação

- Não é necessário rodar Prettier.
- Testar cálculos de domínio separadamente quando uma infraestrutura de testes for adicionada.
- Não declarar exportação ou impressão como concluída antes de validar dimensões físicas no arquivo gerado.

## Escopo atual

Entregue:

- Home com duas ferramentas e indicação honesta da indisponível.
- Seleção múltipla de imagens pela biblioteca do dispositivo.
- Recorte 3:4 com arraste e zoom, processado localmente.
- Documento A4 com foto em milímetros.
- Seleção, movimentação, multiplicação e remoção de fotos no editor.
- Textos com conteúdo e formatação armazenados no documento de impressão.

Próximas prioridades:

1. Exportar o documento como PDF com dimensões físicas.
2. Implementar Imagem para PDF.
3. Adicionar histórico de desfazer/refazer e persistência local de rascunhos.
