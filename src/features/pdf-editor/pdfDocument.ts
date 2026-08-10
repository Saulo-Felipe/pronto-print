import { File, Paths } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';

export type PdfFile = {
  id: string;
  name: string;
  uri: string;
  size: number | null;
  pageCount: number;
  pages: PdfPage[];
};

export type PdfPage = {
  id: string;
  sourceFileId: string;
  sourceFileName: string;
  sourceUri: string;
  sourcePageIndex: number;
};

type LocalPdf = Pick<PdfFile, 'name' | 'uri' | 'size'>;

export async function inspectPdf(source: LocalPdf, id: string): Promise<PdfFile> {
  const bytes = await new File(source.uri).bytes();
  const document = await PDFDocument.load(bytes);
  const pageCount = document.getPageCount();

  if (pageCount === 0) {
    throw new Error('O PDF não possui páginas.');
  }

  return {
    ...source,
    id,
    pageCount,
    pages: Array.from({ length: pageCount }, (_, sourcePageIndex) => ({
      id: `${id}-page-${sourcePageIndex}`,
      sourceFileId: id,
      sourceFileName: source.name,
      sourceUri: source.uri,
      sourcePageIndex,
    })),
  };
}

export async function mergePdfFiles(sources: PdfFile[]): Promise<string> {
  const outputDocument = await PDFDocument.create();
  const sourceDocuments = new Map<string, PDFDocument>();

  for (const page of sources.flatMap((source) => source.pages)) {
    let sourceDocument = sourceDocuments.get(page.sourceUri);

    if (!sourceDocument) {
      const bytes = await new File(page.sourceUri).bytes();
      sourceDocument = await PDFDocument.load(bytes);
      sourceDocuments.set(page.sourceUri, sourceDocument);
    }

    const [copiedPage] = await outputDocument.copyPages(sourceDocument, [page.sourcePageIndex]);
    outputDocument.addPage(copiedPage);
  }

  if (outputDocument.getPageCount() === 0) {
    throw new Error('Mantenha ao menos uma página para gerar o PDF.');
  }

  const outputBytes = await outputDocument.save();
  const outputFile = new File(Paths.cache, `ProntoPrint-${Date.now()}.pdf`);
  outputFile.create({ overwrite: true });
  outputFile.write(outputBytes);

  return outputFile.uri;
}

export function movePdfPage(
  files: PdfFile[],
  pageId: string,
  targetFileId: string,
  targetPageId: string | null,
  insertAfterTarget: boolean,
) {
  const page = files.flatMap((file) => file.pages).find(({ id }) => id === pageId);
  if (!page || pageId === targetPageId) return files;
  const targetExists = files.some(
    (file) =>
      file.id === targetFileId &&
      (targetPageId === null || file.pages.some(({ id }) => id === targetPageId)),
  );
  if (!targetExists) return files;

  return files.map((file) => {
    const pagesWithoutDraggedPage = file.pages.filter(({ id }) => id !== pageId);
    if (file.id !== targetFileId) return { ...file, pages: pagesWithoutDraggedPage };

    const reorderedPages = [...pagesWithoutDraggedPage];
    if (targetPageId === null) {
      reorderedPages.push(page);
      return { ...file, pages: reorderedPages };
    }

    const targetIndex = reorderedPages.findIndex(({ id }) => id === targetPageId);
    reorderedPages.splice(targetIndex + (insertAfterTarget ? 1 : 0), 0, page);
    return { ...file, pages: reorderedPages };
  });
}

export function formatFileSize(size: number | null) {
  if (size === null || !Number.isFinite(size)) return 'Tamanho indisponível';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
