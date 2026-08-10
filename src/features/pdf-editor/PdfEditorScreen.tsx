import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, spacing } from '../../shared/theme/tokens';
import { inspectPdf, mergePdfFiles, movePdfPage, type PdfFile } from './pdfDocument';
import {
  DraggedPdfPageOverlay,
  type DraggedPageOverlayState,
} from './DraggedPdfPageOverlay';
import { PdfFileCard, type PdfDropPreview } from './PdfFileCard';

type PdfEditorScreenProps = {
  onBack: () => void;
};

type RegisteredTarget = {
  fileId: string;
  node: View;
};

type DropFrame = {
  fileId: string;
  pageId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
};

type DropLocation = PdfDropPreview & {
  fileId: string;
};

type DraggedFrame = {
  height: number;
  startPointerX: number;
  startPointerY: number;
  width: number;
  x: number;
  y: number;
};

const AUTO_SCROLL_EDGE = 72;
const AUTO_SCROLL_STEP = 10;
const MINIMUM_OVERLAP_RATIO = 0.06;

function getIntersectionArea(first: DropFrame, second: DropFrame) {
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x),
  );
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y),
  );
  return width * height;
}

function measureTarget(fileId: string, pageId: string | null, node: View) {
  return new Promise<DropFrame>((resolve) => {
    node.measureInWindow((x, y, width, height) => {
      resolve({ fileId, pageId, x, y, width, height });
    });
  });
}

export function PdfEditorScreen({ onBack }: PdfEditorScreenProps) {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDraggingPage, setIsDraggingPage] = useState(false);
  const [dropLocation, setDropLocation] = useState<DropLocation | null>(null);
  const [dragOverlay, setDragOverlay] = useState<DraggedPageOverlayState | null>(null);
  const dropLocationRef = useRef<DropLocation | null>(null);
  const dragLayerRoot = useRef<View>(null);
  const draggedFrame = useRef<DraggedFrame | null>(null);
  const scrollView = useRef<ScrollView>(null);
  const dragPointerX = useSharedValue(0);
  const dragPointerY = useSharedValue(0);
  const scrollMetrics = useRef({
    contentHeight: 0,
    offsetY: 0,
    viewportHeight: 0,
    windowY: 0,
  });
  const draggedPageId = useRef<string | null>(null);
  const dragPointer = useRef({ x: 0, y: 0 });
  const autoScrollDirection = useRef<-1 | 0 | 1>(0);
  const autoScrollFrame = useRef<number | null>(null);
  const lastAutoScrollMeasurement = useRef(0);
  const pageTargets = useRef(new Map<string, RegisteredTarget>());
  const fileTargets = useRef(new Map<string, View>());
  const dropFrames = useRef<{ pages: DropFrame[]; files: DropFrame[] }>({ pages: [], files: [] });
  const includedPageCount = useMemo(
    () => files.reduce((total, file) => total + file.pages.length, 0),
    [files],
  );
  const firstOutputPageNumbers = useMemo(() => {
    let nextPageNumber = 1;

    return files.map((file) => {
      const firstPageNumber = nextPageNumber;
      nextPageNumber += file.pages.length;
      return firstPageNumber;
    });
  }, [files]);
  const currentPageIds = useMemo(
    () => new Set(files.flatMap((file) => file.pages.map(({ id }) => id))),
    [files],
  );

  const addPdfs = async () => {
    try {
      setIsImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const importedFiles: PdfFile[] = [];
      const rejectedFiles: string[] = [];

      for (const [index, asset] of result.assets.entries()) {
        try {
          importedFiles.push(
            await inspectPdf(
              { name: asset.name, uri: asset.uri, size: asset.size ?? null },
              `${Date.now()}-${index}`,
            ),
          );
        } catch {
          rejectedFiles.push(asset.name);
        }
      }

      if (importedFiles.length > 0) {
        setFiles((currentFiles) => [...currentFiles, ...importedFiles]);
      }

      if (rejectedFiles.length > 0) {
        Alert.alert(
          'Alguns PDFs não foram adicionados',
          `Não foi possível abrir: ${rejectedFiles.join(', ')}. O arquivo pode estar inválido ou protegido por senha.`,
        );
      }
    } catch {
      Alert.alert('Não foi possível escolher os PDFs', 'Tente selecionar os arquivos novamente.');
    } finally {
      setIsImporting(false);
    }
  };

  const removeFile = (fileId: string) => {
    setFiles((currentFiles) => currentFiles.filter(({ id }) => id !== fileId));
  };

  const removePage = (fileId: string, pageId: string) => {
    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.id === fileId
          ? { ...file, pages: file.pages.filter(({ id }) => id !== pageId) }
          : file,
      ),
    );
  };

  const restorePages = (fileId: string) => {
    setFiles((currentFiles) => {
      const existingPageIds = new Set(
        currentFiles.flatMap((file) => file.pages.map(({ id }) => id)),
      );

      return currentFiles.map((file) => {
        if (file.id !== fileId) return file;

        const restoredPages = Array.from({ length: file.pageCount }, (_, sourcePageIndex) => ({
          id: `${file.id}-page-${sourcePageIndex}`,
          sourceFileId: file.id,
          sourceFileName: file.name,
          sourceUri: file.uri,
          sourcePageIndex,
        })).filter(({ id }) => !existingPageIds.has(id));

        return { ...file, pages: [...file.pages, ...restoredPages] };
      });
    });
  };

  const registerPageTarget = useCallback(
    (pageId: string, fileId: string, node: View | null) => {
      if (node) {
        pageTargets.current.set(pageId, { fileId, node });
        return;
      }

      pageTargets.current.delete(pageId);
    },
    [],
  );

  const registerFileTarget = useCallback((fileId: string, node: View | null) => {
    if (node) {
      fileTargets.current.set(fileId, node);
      return;
    }

    fileTargets.current.delete(fileId);
  }, []);

  const measureDropTargets = useCallback(async () => {
    const pages = await Promise.all(
      [...pageTargets.current.entries()].map(([pageId, { fileId, node }]) =>
        measureTarget(fileId, pageId, node),
      ),
    );
    const fileFrames = await Promise.all(
      [...fileTargets.current.entries()].map(([fileId, node]) =>
        measureTarget(fileId, null, node),
      ),
    );
    dropFrames.current = { pages, files: fileFrames };
  }, []);

  const findDropLocation = useCallback(
    (pageId: string, absoluteX: number, absoluteY: number): DropLocation | null => {
      const containsPoint = ({ x, y, width, height }: DropFrame) =>
        absoluteX >= x &&
        absoluteX <= x + width &&
        absoluteY >= y &&
        absoluteY <= y + height;
      const initialDraggedFrame = draggedFrame.current;
      const currentDraggedFrame: DropFrame | null = initialDraggedFrame
        ? {
            fileId: '',
            pageId,
            height: initialDraggedFrame.height,
            width: initialDraggedFrame.width,
            x:
              initialDraggedFrame.x +
              absoluteX -
              initialDraggedFrame.startPointerX,
            y:
              initialDraggedFrame.y +
              absoluteY -
              initialDraggedFrame.startPointerY,
          }
        : null;
      const findBestOverlappingTarget = (frames: DropFrame[]) => {
        if (!currentDraggedFrame) return frames.find(containsPoint) ?? null;

        return frames.reduce<{ frame: DropFrame; area: number } | null>((best, frame) => {
          const intersectionArea = getIntersectionArea(currentDraggedFrame, frame);
          const smallestArea = Math.min(
            currentDraggedFrame.width * currentDraggedFrame.height,
            frame.width * frame.height,
          );
          if (smallestArea === 0 || intersectionArea / smallestArea < MINIMUM_OVERLAP_RATIO) {
            return best;
          }

          return !best || intersectionArea > best.area
            ? { area: intersectionArea, frame }
            : best;
        }, null)?.frame ?? null;
      };
      const pageTarget = findBestOverlappingTarget(
        dropFrames.current.pages.filter((frame) => frame.pageId !== pageId),
      );

      if (pageTarget?.pageId) {
        const draggedCenterX = currentDraggedFrame
          ? currentDraggedFrame.x + currentDraggedFrame.width / 2
          : absoluteX;
        const draggedCenterY = currentDraggedFrame
          ? currentDraggedFrame.y + currentDraggedFrame.height / 2
          : absoluteY;
        const horizontalDistance = draggedCenterX - (pageTarget.x + pageTarget.width / 2);
        const verticalDistance = draggedCenterY - (pageTarget.y + pageTarget.height / 2);
        const insertAfterTarget =
          Math.abs(verticalDistance) > pageTarget.height * 0.25
            ? verticalDistance > 0
            : horizontalDistance > 0;

        return {
          fileId: pageTarget.fileId,
          targetPageId: pageTarget.pageId,
          insertAfterTarget,
        };
      }

      const fileTarget = findBestOverlappingTarget(dropFrames.current.files);
      const currentLocation = dropLocationRef.current;
      if (
        fileTarget &&
        currentLocation?.fileId === fileTarget.fileId &&
        currentLocation.targetPageId !== null
      ) {
        return currentLocation;
      }

      return fileTarget
        ? { fileId: fileTarget.fileId, targetPageId: null, insertAfterTarget: true }
        : null;
    },
    [],
  );

  const previewDropLocation = useCallback((nextLocation: DropLocation | null) => {
    dropLocationRef.current = nextLocation;
    setDropLocation((currentLocation) => {
      if (
        currentLocation?.fileId === nextLocation?.fileId &&
        currentLocation?.targetPageId === nextLocation?.targetPageId &&
        currentLocation?.insertAfterTarget === nextLocation?.insertAfterTarget
      ) {
        return currentLocation;
      }

      return nextLocation;
    });
  }, []);

  const runAutoScroll = useCallback(() => {
    const direction = autoScrollDirection.current;
    if (direction === 0) {
      autoScrollFrame.current = null;
      return;
    }

    const metrics = scrollMetrics.current;
    const maxOffset = Math.max(0, metrics.contentHeight - metrics.viewportHeight);
    const nextOffset = Math.max(
      0,
      Math.min(maxOffset, metrics.offsetY + direction * AUTO_SCROLL_STEP),
    );

    if (nextOffset === metrics.offsetY) {
      autoScrollDirection.current = 0;
      autoScrollFrame.current = null;
      return;
    }

    metrics.offsetY = nextOffset;
    scrollView.current?.scrollTo({ animated: false, y: nextOffset });

    const now = Date.now();
    if (now - lastAutoScrollMeasurement.current > 70) {
      lastAutoScrollMeasurement.current = now;
      void measureDropTargets().then(() => {
        const pageId = draggedPageId.current;
        if (!pageId) return;

        previewDropLocation(
          findDropLocation(pageId, dragPointer.current.x, dragPointer.current.y),
        );
      });
    }

    autoScrollFrame.current = requestAnimationFrame(runAutoScroll);
  }, [findDropLocation, measureDropTargets, previewDropLocation]);

  const updateAutoScroll = useCallback(
    (absoluteY: number) => {
      const { offsetY, viewportHeight, windowY, contentHeight } = scrollMetrics.current;
      const canScrollUp = offsetY > 0;
      const canScrollDown = offsetY + viewportHeight < contentHeight;
      const direction =
        absoluteY < windowY + AUTO_SCROLL_EDGE && canScrollUp
          ? -1
          : absoluteY > windowY + viewportHeight - AUTO_SCROLL_EDGE && canScrollDown
            ? 1
            : 0;

      autoScrollDirection.current = direction;
      if (direction !== 0 && autoScrollFrame.current === null) {
        autoScrollFrame.current = requestAnimationFrame(runAutoScroll);
      }
    },
    [runAutoScroll],
  );

  const startPageDrag = useCallback(
    (pageId: string, absoluteX: number, absoluteY: number) => {
      draggedPageId.current = pageId;
      dragPointerX.value = absoluteX;
      dragPointerY.value = absoluteY;
      draggedFrame.current = null;
      setIsDraggingPage(true);
      const page = files.flatMap((file) => file.pages).find(({ id }) => id === pageId);
      let outputPageNumber = 1;

      for (const file of files) {
        const pageIndex = file.pages.findIndex(({ id }) => id === pageId);
        if (pageIndex >= 0) {
          outputPageNumber += pageIndex;
          break;
        }
        outputPageNumber += file.pages.length;
      }

      const target = pageTargets.current.get(pageId);
      if (page && target) {
        target.node.measureInWindow((x, y, width, height) => {
          draggedFrame.current = {
            height,
            startPointerX: absoluteX,
            startPointerY: absoluteY,
            width,
            x,
            y,
          };
          dragLayerRoot.current?.measureInWindow((rootX, rootY) => {
            setDragOverlay({
              height,
              outputPageNumber,
              page,
              startPointerX: absoluteX,
              startPointerY: absoluteY,
              width,
              x: x - rootX,
              y: y - rootY,
            });
          });
        });
      }

      scrollView.current?.getNativeScrollRef()?.measureInWindow((_, y, __, height) => {
        scrollMetrics.current.windowY = y;
        scrollMetrics.current.viewportHeight = height;
      });
      void measureDropTargets();
    },
    [dragPointerX, dragPointerY, files, measureDropTargets],
  );

  const moveDraggedPage = useCallback(
    (pageId: string, absoluteX: number, absoluteY: number) => {
      dragPointerX.value = absoluteX;
      dragPointerY.value = absoluteY;
      dragPointer.current = { x: absoluteX, y: absoluteY };
      previewDropLocation(findDropLocation(pageId, absoluteX, absoluteY));
      updateAutoScroll(absoluteY);
    },
    [dragPointerX, dragPointerY, findDropLocation, previewDropLocation, updateAutoScroll],
  );

  const finishPageDrag = useCallback(() => {
    setIsDraggingPage(false);
    setDragOverlay(null);
    setDropLocation(null);
    dropLocationRef.current = null;
    draggedPageId.current = null;
    draggedFrame.current = null;
    autoScrollDirection.current = 0;

    if (autoScrollFrame.current !== null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  }, []);

  const dropPage = useCallback(
    (pageId: string, absoluteX: number, absoluteY: number) => {
      const target =
        findDropLocation(pageId, absoluteX, absoluteY) ?? dropLocationRef.current;
      if (!target) return;

      setFiles((currentFiles) =>
        movePdfPage(
          currentFiles,
          pageId,
          target.fileId,
          target.targetPageId,
          target.insertAfterTarget,
        ),
      );
    },
    [findDropLocation],
  );

  useEffect(() => {
    if (!dropLocation) return;

    const frame = requestAnimationFrame(() => {
      void measureDropTargets();
    });
    return () => cancelAnimationFrame(frame);
  }, [dropLocation, measureDropTargets]);

  useEffect(
    () => () => {
      if (autoScrollFrame.current !== null) cancelAnimationFrame(autoScrollFrame.current);
    },
    [],
  );

  const moveFile = (fileIndex: number, direction: -1 | 1) => {
    const destinationIndex = fileIndex + direction;
    if (destinationIndex < 0 || destinationIndex >= files.length) return;

    setFiles((currentFiles) => {
      const reorderedFiles = [...currentFiles];
      [reorderedFiles[fileIndex], reorderedFiles[destinationIndex]] = [
        reorderedFiles[destinationIndex],
        reorderedFiles[fileIndex],
      ];
      return reorderedFiles;
    });
  };

  const exportPdf = async () => {
    if (includedPageCount === 0) return;

    try {
      setIsExporting(true);
      const outputUri = await mergePdfFiles(files);
      const sharingAvailable = await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        Alert.alert('PDF criado', 'O compartilhamento de arquivos não está disponível neste aparelho.');
        return;
      }

      await Sharing.shareAsync(outputUri, {
        dialogTitle: 'Salvar ou compartilhar PDF',
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      Alert.alert('Não foi possível gerar o PDF', message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View collapsable={false} ref={dragLayerRoot} style={styles.screen}>
        <AppHeader onBack={onBack} subtitle="Organize e combine arquivos" title="Editor de PDF" />

        {files.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons color={colors.blue} name="file-pdf-box" size={48} />
            </View>
            <Text style={styles.emptyTitle}>Adicione seu primeiro PDF</Text>
            <Text style={styles.emptyDescription}>
              Você poderá juntar arquivos, mudar a ordem e excluir páginas antes de salvar.
            </Text>
            <PrimaryButton disabled={isImporting} label="Adicionar PDF" loading={isImporting} onPress={addPdfs} />
            <Text style={styles.privacyNote}>Seus arquivos são processados somente neste aparelho.</Text>
          </View>
        ) : (
          <>
          <View style={styles.dragHint}>
            <MaterialCommunityIcons color={colors.blue} name="gesture-tap-hold" size={18} />
            <Text style={styles.dragHintText}>Pressione uma página e arraste para mudar sua posição.</Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.fileList}
            onContentSizeChange={(_, height) => {
              scrollMetrics.current.contentHeight = height;
            }}
            onLayout={({ nativeEvent }) => {
              scrollMetrics.current.viewportHeight = nativeEvent.layout.height;
              scrollView.current?.getNativeScrollRef()?.measureInWindow((_, y) => {
                scrollMetrics.current.windowY = y;
              });
            }}
            onScroll={({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
              scrollMetrics.current.offsetY = nativeEvent.contentOffset.y;
            }}
            ref={scrollView}
            scrollEnabled={!isDraggingPage}
            scrollEventThrottle={16}
          >
            {files.map((file, fileIndex) => (
              <PdfFileCard
                canMoveDown={fileIndex < files.length - 1}
                canMoveUp={fileIndex > 0}
                canRestorePages={Array.from({ length: file.pageCount }, (_, pageIndex) =>
                  `${file.id}-page-${pageIndex}`
                ).some((pageId) => !currentPageIds.has(pageId))}
                dropPreview={
                  dropLocation?.fileId === file.id
                    ? {
                        insertAfterTarget: dropLocation.insertAfterTarget,
                        targetPageId: dropLocation.targetPageId,
                      }
                    : null
                }
                file={file}
                firstOutputPageNumber={firstOutputPageNumbers[fileIndex]}
                key={file.id}
                onMoveDown={() => moveFile(fileIndex, 1)}
                onMoveUp={() => moveFile(fileIndex, -1)}
                onRemove={() => removeFile(file.id)}
                onDragEnd={finishPageDrag}
                onDragMove={moveDraggedPage}
                onDragStart={startPageDrag}
                onDropPage={dropPage}
                onRegisterFile={registerFileTarget}
                onRegisterPage={registerPageTarget}
                onRemovePage={(pageId) => removePage(file.id, pageId)}
                onRestorePages={() => restorePages(file.id)}
                order={fileIndex + 1}
              />
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.footerAction}>
              <PrimaryButton
                disabled={isImporting || isExporting}
                icon="plus"
                iconPosition="left"
                label="Adicionar PDF"
                loading={isImporting}
                onPress={addPdfs}
                variant="secondary"
              />
            </View>
            <View style={styles.footerAction}>
              <PrimaryButton
                disabled={includedPageCount === 0 || isExporting}
                label="Finalizar"
                loading={isExporting}
                onPress={exportPdf}
              />
            </View>
          </View>
          </>
        )}

        {dragOverlay && (
          <DraggedPdfPageOverlay
            pointerX={dragPointerX}
            pointerY={dragPointerY}
            state={dragOverlay}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1 },
  emptyState: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 92,
    height: 92,
    marginBottom: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: colors.blueSoft,
  },
  emptyTitle: { color: colors.ink, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  emptyDescription: {
    maxWidth: 340,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  privacyNote: { marginTop: spacing.md, color: colors.muted, fontSize: 12, textAlign: 'center' },
  dragHint: {
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.blueSoft,
  },
  dragHintText: { flex: 1, color: colors.blue, fontSize: 12, fontWeight: '700' },
  fileList: { padding: spacing.md, gap: spacing.md },
  footer: {
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  footerAction: { flex: 1 },
});
