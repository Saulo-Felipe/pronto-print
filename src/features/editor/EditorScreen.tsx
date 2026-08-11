import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { PRINT_LIMITS } from '../../shared/print/constants';
import { TEXT_FONT_OPTIONS } from '../../shared/print/fonts';
import {
  arrangeImageSelectionCopies,
  bringElementToFront,
  createTextElement,
  getImageMultiplicationLimit,
  translateElementsAsGroup,
  toggleDocumentOrientation,
  updateElementInDocument,
} from '../../shared/print/document';
import { downloadDocument, printDocument } from '../../shared/print/export';
import { colors, radii, shadows, spacing } from '../../shared/theme/tokens';
import type {
  PrintDocument,
  PrintElement,
  PrintImage,
  PrintText,
} from '../../shared/types/print';
import { PageRulers, RULER_THICKNESS } from './PageRulers';
import { MultiSelectionBox } from './MultiSelectionBox';
import { PrintImageElement } from './PrintImageElement';
import { PrintTextElement } from './PrintTextElement';
import { resolveEditorFontFamily } from './textFonts';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type FinishStep = 'actions' | 'download';
type ExportAction = 'pdf' | 'png' | 'print';

type EditorScreenProps = {
  document: PrintDocument;
  onAddImages: () => void;
  onBack: () => void;
  onChangeDocument: (document: PrintDocument) => void;
  onCropPhotos: (elementIds: string[]) => void;
};

const MODAL_ANIMATION_DURATION_MS = 240;
const SHEET_HIDDEN_OFFSET = 420;
const TEXT_COLORS: string[] = [
  colors.black,
  colors.danger,
  colors.blueStrong,
  colors.greenStrong,
];
const TEXT_ALIGNMENT_OPTIONS = [
  { icon: 'format-align-left', label: 'Esquerda', value: 'left' },
  { icon: 'format-align-center', label: 'Centro', value: 'center' },
  { icon: 'format-align-right', label: 'Direita', value: 'right' },
] as const satisfies ReadonlyArray<{
  icon: IconName;
  label: string;
  value: PrintText['textAlign'];
}>;
const MIN_FONT_SIZE_PT = 8;

export function EditorScreen({
  document,
  onAddImages,
  onBack,
  onChangeDocument,
  onCropPhotos,
}: EditorScreenProps) {
  const { width: screenWidth } = useWindowDimensions();
  const pageWidth = Math.min(screenWidth - 40 - RULER_THICKNESS, 360);
  const pageHeight = pageWidth * (document.page.heightMm / document.page.widthMm);
  const workspaceScrollRef = useRef<ScrollView>(null);
  const workspaceScrollOffsetY = useRef(0);
  const editingInputHandle = useRef<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [multiSelectionEnabled, setMultiSelectionEnabled] = useState(false);
  const [quantityVisible, setQuantityVisible] = useState(false);
  const [quantity, setQuantity] = useState(Math.max(2, document.elements.length));
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [finishStep, setFinishStep] = useState<FinishStep | null>(null);
  const [exportAction, setExportAction] = useState<ExportAction | null>(null);
  const primarySelectedId = selectedIds.at(-1);
  const selectedElements = document.elements.filter((element) => selectedIds.includes(element.id));
  const selectedElement = document.elements.find((element) => element.id === primarySelectedId);
  const selectedText = selectedElement?.kind === 'text' ? selectedElement : undefined;
  const selectedImages = selectedElements.filter(
    (element): element is PrintImage => element.kind === 'image',
  );
  const selectedTexts = selectedElements.filter(
    (element): element is PrintText => element.kind === 'text',
  );
  const photoCount = document.elements.filter(({ kind }) => kind === 'image').length;
  const textCount = document.elements.filter(({ kind }) => kind === 'text').length;
  const multiplicationSources =
    selectedImages.length > 0
      ? selectedImages
      : document.elements.filter((element): element is PrintImage => element.kind === 'image');
  const multiplicationLimit = getImageMultiplicationLimit(
    multiplicationSources,
    document.page,
  );

  const selectElement = (id: string) => {
    if (editingTextId && editingTextId !== id) Keyboard.dismiss();
    if (multiSelectionEnabled && selectedIds.includes(id)) return;

    setSelectedIds((currentIds) => {
      if (!multiSelectionEnabled) return [id];
      return [...currentIds, id];
    });

    const reorderedDocument = bringElementToFront(document, id);
    if (reorderedDocument !== document) onChangeDocument(reorderedDocument);
  };

  const startMultiSelection = (id: string) => {
    Keyboard.dismiss();
    setEditingTextId(null);
    setMultiSelectionEnabled(true);
    setSelectedIds((currentIds) => (currentIds.includes(id) ? currentIds : [id]));
  };

  const deselectElement = (id: string) => {
    if (!multiSelectionEnabled) return;

    const remainingIds = selectedIds.filter((selectedId) => selectedId !== id);
    setSelectedIds(remainingIds);
    if (remainingIds.length === 0) setMultiSelectionEnabled(false);
  };

  const clearSelection = () => {
    Keyboard.dismiss();
    setSelectedIds([]);
    setMultiSelectionEnabled(false);
    setEditingTextId(null);
  };

  const changeElementGroup = (changedElements: PrintElement[]) => {
    const changedById = new Map(changedElements.map((element) => [element.id, element]));
    onChangeDocument({
      ...document,
      elements: document.elements.map((element) => changedById.get(element.id) ?? element),
    });
  };

  const changeElement = (changedElement: PrintElement) => {
    const currentElement = document.elements.find(({ id }) => id === changedElement.id);
    const isSelectedGroupMovement =
      multiSelectionEnabled &&
      currentElement !== undefined &&
      selectedIds.includes(changedElement.id) &&
      changedElement.widthMm === currentElement.widthMm &&
      changedElement.heightMm === currentElement.heightMm &&
      changedElement.rotationDeg === currentElement.rotationDeg &&
      (changedElement.xMm !== currentElement.xMm || changedElement.yMm !== currentElement.yMm);

    if (isSelectedGroupMovement) {
      changeElementGroup(
        translateElementsAsGroup(
          selectedElements,
          changedElement.xMm - currentElement.xMm,
          changedElement.yMm - currentElement.yMm,
          document.page,
        ),
      );
      return;
    }

    onChangeDocument(
      updateElementInDocument(document, changedElement, selectedIds.includes(changedElement.id)),
    );
  };

  const changeSelectedTexts = (changedText: PrintText) => {
    if (selectedTexts.length <= 1) {
      changeElement(changedText);
      return;
    }

    const selectedTextIds = new Set(selectedTexts.map(({ id }) => id));
    onChangeDocument({
      ...document,
      elements: document.elements.map((element) =>
        element.kind === 'text' && selectedTextIds.has(element.id)
          ? {
              ...element,
              color: changedText.color,
              fontFamily: changedText.fontFamily,
              fontSizePt: changedText.fontSizePt,
              fontWeight: changedText.fontWeight,
              textAlign: changedText.textAlign,
            }
          : element,
      ),
    });
  };

  const removeSelected = () => {
    if (selectedIds.length === 0) return;
    const remainingElements = document.elements.filter(
      (element) => !selectedIds.includes(element.id),
    );
    onChangeDocument({ ...document, elements: remainingElements });
    clearSelection();
  };

  const openQuantity = () => {
    if (multiplicationSources.length > multiplicationLimit) {
      Alert.alert(
        'As imagens não cabem na folha',
        'No tamanho atual, não há espaço para distribuir todas as imagens selecionadas sem sobreposição.',
      );
      return;
    }

    setQuantity(Math.min(multiplicationLimit, Math.max(2, multiplicationSources.length)));
    setQuantityVisible(true);
  };

  const applyQuantity = () => {
    if (multiplicationSources.length === 0) return;

    const elements = arrangeImageSelectionCopies(
      multiplicationSources,
      quantity,
      document.page,
    );
    onChangeDocument({ ...document, elements });
    setSelectedIds([elements[0].id]);
    setMultiSelectionEnabled(false);
    setQuantityVisible(false);
  };

  const setSafeQuantity = (nextQuantity: number) => {
    const minimumQuantity = Math.max(1, multiplicationSources.length);
    setQuantity(
      Number.isSafeInteger(nextQuantity)
        ? Math.min(multiplicationLimit, Math.max(minimumQuantity, nextQuantity))
        : minimumQuantity,
    );
  };

  const countLabel = multiSelectionEnabled
    ? `${selectedElements.length} ${selectedElements.length === 1 ? 'elemento selecionado' : 'elementos selecionados'}`
    : `${photoCount} ${photoCount === 1 ? 'imagem' : 'imagens'} • ${textCount} ${
        textCount === 1 ? 'texto' : 'textos'
      }`;
  const startDraggingElement = useCallback(() => setIsDraggingElement(true), []);
  const stopDraggingElement = useCallback(() => setIsDraggingElement(false), []);

  const openPhotoCrop = () => {
    if (selectedImages.length === 0) return;
    onCropPhotos(selectedImages.map(({ id }) => id));
  };

  const addText = () => {
    const textElement = createTextElement(document.page, document.elements.length);
    onChangeDocument({ ...document, elements: [...document.elements, textElement] });
    setSelectedIds([textElement.id]);
    setMultiSelectionEnabled(false);
  };

  const openTextEditor = (element: PrintText) => {
    if (selectedIds.length > 1) return;
    setSelectedIds([element.id]);
    setMultiSelectionEnabled(false);
    setEditingTextId(element.id);
  };

  const finishTextEditing = (element: PrintText) => {
    if (!element.text.trim()) changeElement({ ...element, text: 'Texto' });
    setEditingTextId(null);
  };

  const revealFocusedTextInput = useCallback((keyboardTop: number) => {
    const inputHandle = editingInputHandle.current;
    if (inputHandle === null) return;

    UIManager.measureInWindow(inputHandle, (_x, inputTop, _width, inputHeight) => {
      const hiddenHeight = inputTop + inputHeight + spacing.xl - keyboardTop;
      if (hiddenHeight <= 0) return;

      workspaceScrollRef.current?.scrollTo({
        animated: true,
        y: workspaceScrollOffsetY.current + hiddenHeight,
      });
    });
  }, []);

  const revealTextEditor = useCallback(
    (inputHandle: number) => {
      editingInputHandle.current = inputHandle;
      const keyboardMetrics = Keyboard.metrics();
      if (keyboardMetrics) revealFocusedTextInput(keyboardMetrics.screenY);
    },
    [revealFocusedTextInput],
  );

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', ({ endCoordinates }) => {
      revealFocusedTextInput(endCoordinates.screenY);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      editingInputHandle.current = null;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [revealFocusedTextInput]);

  const toggleOrientation = () => {
    onChangeDocument(toggleDocumentOrientation(document));
  };

  const orientationLabel = document.page.orientation === 'portrait' ? 'Retrato' : 'Paisagem';
  const orientationIcon: IconName =
    document.page.orientation === 'portrait'
      ? 'phone-rotate-portrait'
      : 'phone-rotate-landscape';

  const runExport = async (action: ExportAction) => {
    setExportAction(action);

    try {
      if (action === 'print') {
        await printDocument(document);
      } else {
        await downloadDocument(document, action);
      }
      setFinishStep(null);
    } catch (error) {
      if (!isCancellationError(error)) {
        Alert.alert(
          'Não foi possível finalizar',
          error instanceof Error ? error.message : 'Tente novamente em alguns instantes.',
        );
      }
    } finally {
      setExportAction(null);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View onTouchStart={clearSelection}>
        <AppHeader
          onBack={onBack}
          title={multiSelectionEnabled ? 'Seleção múltipla' : 'Editor'}
          subtitle={countLabel}
        />
      </View>

      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.workspace}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          workspaceScrollOffsetY.current = nativeEvent.contentOffset.y;
        }}
        onTouchStart={clearSelection}
        ref={workspaceScrollRef}
        scrollEventThrottle={16}
        scrollEnabled={!isDraggingElement}
        showsVerticalScrollIndicator={false}
      >
        <View
          onTouchStart={(event) => event.stopPropagation()}
          style={styles.contextualToolbar}
        >
          {selectedTexts.length === selectedElements.length && selectedText ? (
            <TextFormattingToolbar
              element={selectedText}
              editingDisabled={selectedTexts.length > 1}
              onChange={changeSelectedTexts}
              onEdit={() => openTextEditor(selectedText)}
              onRemove={removeSelected}
            />
          ) : selectedImages.length === selectedElements.length && selectedImages.length > 0 ? (
            <ImageActionsToolbar
              onCrop={openPhotoCrop}
              onMultiply={openQuantity}
              onRemove={removeSelected}
            />
          ) : selectedElements.length > 0 ? (
            <MixedSelectionToolbar onRemove={removeSelected} />
          ) : (
            <View style={styles.selectionHintPanel}>
              <Text style={styles.selectionHint}>Selecione um elemento para ver suas opções.</Text>
            </View>
          )}
        </View>
        <Pressable
          accessible={false}
          onPress={clearSelection}
          onTouchStart={(event) => event.stopPropagation()}
          style={styles.editorSurface}
        >
          <PageRulers
            indicator={
              isDraggingElement && selectedElement
                ? { xMm: selectedElement.xMm, yMm: selectedElement.yMm }
                : null
            }
            page={document.page}
            pageHeight={pageHeight}
            pageWidth={pageWidth}
          >
            <View
              accessibilityLabel="Prévia da folha A4"
              style={[styles.page, { width: pageWidth, height: pageHeight }]}
            >
              {document.elements.map((element) =>
                element.kind === 'image' ? (
                  <PrintImageElement
                    element={element}
                    grouped={multiSelectionEnabled}
                    key={element.id}
                    onChange={changeElement}
                    onDragEnd={stopDraggingElement}
                    onDragStart={startDraggingElement}
                    onLongPress={() => startMultiSelection(element.id)}
                    onSelect={() => selectElement(element.id)}
                    onTap={() => {
                      if (selectedIds.includes(element.id)) deselectElement(element.id);
                    }}
                    page={document.page}
                    pageHeight={pageHeight}
                    pageWidth={pageWidth}
                    selected={selectedIds.includes(element.id)}
                  />
                ) : (
                  <PrintTextElement
                    editing={element.id === editingTextId}
                    element={element}
                    grouped={multiSelectionEnabled}
                    multiSelectionEnabled={multiSelectionEnabled}
                    key={element.id}
                    onChange={changeElement}
                    onDragEnd={stopDraggingElement}
                    onDragStart={startDraggingElement}
                    onEdit={() => openTextEditor(element)}
                    onEditingFocus={revealTextEditor}
                    onFinishEditing={() => finishTextEditing(element)}
                    onLongPress={() => startMultiSelection(element.id)}
                    onSelect={() => selectElement(element.id)}
                    onTap={() => {
                      if (selectedIds.includes(element.id)) deselectElement(element.id);
                    }}
                    page={document.page}
                    pageHeight={pageHeight}
                    pageWidth={pageWidth}
                    selected={selectedIds.includes(element.id)}
                  />
                ),
              )}
              {multiSelectionEnabled && selectedElements.length > 0 && (
                <MultiSelectionBox
                  elements={selectedElements}
                  onChange={changeElementGroup}
                  onTransformEnd={stopDraggingElement}
                  onTransformStart={startDraggingElement}
                  page={document.page}
                  pageHeight={pageHeight}
                  pageWidth={pageWidth}
                />
              )}
              {document.elements.length === 0 && (
                <Text style={styles.emptyText}>Nenhum elemento na folha</Text>
              )}
            </View>
          </PageRulers>
        </Pressable>
        <SelectionMetrics element={selectedElement} pageWidth={pageWidth} />
      </ScrollView>

      <View onTouchStart={clearSelection} style={styles.toolbar}>
        <View style={styles.toolbarContent}>
          <Pressable
            accessibilityLabel="Adicionar imagens"
            accessibilityRole="button"
            onPress={onAddImages}
            style={({ pressed }) => [styles.toolbarItem, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons color={colors.muted} name="image-plus" size={21} />
            <Text numberOfLines={2} style={styles.toolbarAction}>
              Adicionar Imagens
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Adicionar texto"
            accessibilityRole="button"
            onPress={addText}
            style={({ pressed }) => [styles.toolbarItem, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons color={colors.muted} name="format-text" size={21} />
            <Text numberOfLines={2} style={styles.toolbarAction}>
              Adicionar Texto
            </Text>
          </Pressable>
          <Pressable
            accessibilityHint="Alterna a folha entre retrato e paisagem"
            accessibilityLabel={`Alterar orientação. Atual: ${orientationLabel}`}
            accessibilityRole="button"
            onPress={toggleOrientation}
            style={({ pressed }) => [styles.toolbarItem, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons color={colors.muted} name={orientationIcon} size={21} />
            <Text style={styles.toolbarLabel}>Orientação</Text>
            <Text style={styles.toolbarValue}>{orientationLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Finalizar documento"
            accessibilityRole="button"
            onPress={() => setFinishStep('actions')}
            style={({ pressed }) => [styles.finishButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons color={colors.surface} name="check-circle-outline" size={22} />
            <Text style={styles.finishText}>Finalizar</Text>
          </Pressable>
        </View>
      </View>

      <BottomSheetModal
        onClose={() => {
          if (exportAction === null) setFinishStep(null);
        }}
        visible={finishStep !== null}
      >
        <View style={styles.handle} />
        {finishStep === 'download' ? (
          <>
            <View style={styles.sheetHeading}>
              <View style={styles.sheetHeadingCopy}>
                <Text style={styles.sheetTitle}>Baixar arquivo</Text>
                <Text style={styles.sheetSubtitle}>Escolha o formato que deseja salvar.</Text>
              </View>
              <Pressable
                accessibilityLabel="Voltar para opções de finalização"
                disabled={exportAction !== null}
                onPress={() => setFinishStep('actions')}
                style={styles.closeButton}
              >
                <MaterialCommunityIcons color={colors.muted} name="chevron-left" size={25} />
              </Pressable>
            </View>
            <FinishActionButton
              description="Imagem da folha em alta resolução, com 300 DPI"
              icon="file-image-outline"
              label="PNG"
              loading={exportAction === 'png'}
              onPress={() => runExport('png')}
              disabled={exportAction !== null}
            />
            <FinishActionButton
              description="Documento A4 com as dimensões físicas preservadas"
              icon="file-pdf-box"
              label="PDF"
              loading={exportAction === 'pdf'}
              onPress={() => runExport('pdf')}
              disabled={exportAction !== null}
            />
          </>
        ) : (
          <>
            <Text style={styles.sheetTitle}>Finalizar</Text>
            <Text style={styles.sheetSubtitle}>Como deseja concluir este documento?</Text>
            <FinishActionButton
              description="Abra o diálogo de impressão do dispositivo"
              icon="printer-outline"
              label="Imprimir direto"
              loading={exportAction === 'print'}
              onPress={() => runExport('print')}
              disabled={exportAction !== null}
            />
            <FinishActionButton
              description="Salve uma cópia em PNG ou PDF"
              icon="download-outline"
              label="Baixar"
              onPress={() => setFinishStep('download')}
              disabled={exportAction !== null}
            />
          </>
        )}
      </BottomSheetModal>

      <BottomSheetModal
        onClose={() => setQuantityVisible(false)}
        visible={quantityVisible}
      >
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Quantas fotos?</Text>
        <Text style={styles.sheetSubtitle}>
          No tamanho atual, cabem até {multiplicationLimit} fotos nesta folha.
        </Text>
        <View style={styles.quantityControl}>
          <Pressable
            accessibilityLabel="Diminuir quantidade"
            onPress={() => setSafeQuantity(quantity - 1)}
            style={styles.quantityButton}
          >
            <MaterialCommunityIcons color={colors.blue} name="minus" size={25} />
          </Pressable>
          <View style={styles.quantityField}>
            <Text style={styles.quantityLabel}>QUANTIDADE</Text>
            <TextInput
              accessibilityLabel="Quantidade de fotos"
              keyboardType="number-pad"
              onChangeText={(value) => setSafeQuantity(Number(value) || 1)}
              selectTextOnFocus
              style={styles.quantityInput}
              value={String(quantity)}
            />
          </View>
          <Pressable
            accessibilityLabel="Aumentar quantidade"
            disabled={quantity >= multiplicationLimit}
            onPress={() => setSafeQuantity(quantity + 1)}
            style={[styles.quantityButton, quantity >= multiplicationLimit && styles.disabled]}
          >
            <MaterialCommunityIcons color={colors.blue} name="plus" size={25} />
          </Pressable>
        </View>
        <PrimaryButton label="Aplicar na folha" onPress={applyQuantity} />
      </BottomSheetModal>

    </SafeAreaView>
  );
}

type ImageActionsToolbarProps = {
  onCrop: () => void;
  onMultiply: () => void;
  onRemove: () => void;
};

function ImageActionsToolbar({ onCrop, onMultiply, onRemove }: ImageActionsToolbarProps) {
  return (
    <View accessibilityLabel="Ações da imagem selecionada" style={styles.imageActionsPanel}>
      <ImageActionButton icon="crop" label="Foto 3×4" onPress={onCrop} />
      <ImageActionButton icon="content-copy" label="Multiplicar" onPress={onMultiply} />
      <ImageActionButton danger icon="trash-can-outline" label="Remover" onPress={onRemove} />
    </View>
  );
}

function MixedSelectionToolbar({ onRemove }: { onRemove: () => void }) {
  return (
    <View accessibilityLabel="Ações dos elementos selecionados" style={styles.imageActionsPanel}>
      <ImageActionButton danger icon="trash-can-outline" label="Remover" onPress={onRemove} />
    </View>
  );
}

type ImageActionButtonProps = {
  danger?: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
};

function ImageActionButton({ danger = false, icon, label, onPress }: ImageActionButtonProps) {
  const foregroundColor = danger ? colors.danger : colors.ink;

  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.imageActionButton, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons color={foregroundColor} name={icon} size={20} />
      <Text style={[styles.formatButtonLabel, { color: foregroundColor }]}>{label}</Text>
    </Pressable>
  );
}

type TextFormattingToolbarProps = {
  editingDisabled?: boolean;
  element: PrintText;
  onChange: (element: PrintText) => void;
  onEdit: () => void;
  onRemove: () => void;
};

function TextFormattingToolbar({
  editingDisabled = false,
  element,
  onChange,
  onEdit,
  onRemove,
}: TextFormattingToolbarProps) {
  const fontSizeInputRef = useRef<TextInput>(null);
  const isEditingFontSize = useRef(false);
  const [fontSizeDraft, setFontSizeDraft] = useState(String(element.fontSizePt));
  const [fontPickerVisible, setFontPickerVisible] = useState(false);
  const [alignmentPickerVisible, setAlignmentPickerVisible] = useState(false);

  useEffect(() => {
    if (!isEditingFontSize.current) setFontSizeDraft(String(element.fontSizePt));
  }, [element.fontSizePt]);

  const changeFontSize = (delta: number) => {
    const fontSizePt = Math.max(MIN_FONT_SIZE_PT, element.fontSizePt + delta);
    setFontSizeDraft(String(fontSizePt));
    onChange({ ...element, fontSizePt });
  };

  const changeFontSizeDraft = (value: string) => {
    const digits = value.replace(/\D/g, '');
    setFontSizeDraft(digits);

    const fontSizePt = Number(digits);
    if (fontSizePt >= MIN_FONT_SIZE_PT && Number.isSafeInteger(fontSizePt)) {
      onChange({ ...element, fontSizePt });
    }
  };

  const normalizeFontSizeDraft = () => {
    isEditingFontSize.current = false;
    const parsedValue = Number(fontSizeDraft);
    const fontSizePt = Number.isSafeInteger(parsedValue)
      ? Math.max(MIN_FONT_SIZE_PT, parsedValue)
      : element.fontSizePt;

    setFontSizeDraft(String(fontSizePt));
    if (fontSizePt !== element.fontSizePt) onChange({ ...element, fontSizePt });
  };

  const cycleColor = () => {
    const currentIndex = TEXT_COLORS.indexOf(element.color);
    const color = TEXT_COLORS[(currentIndex + 1) % TEXT_COLORS.length];
    onChange({ ...element, color });
  };

  return (
    <>
      <View accessibilityLabel="Formatação do texto selecionado" style={styles.textFormattingPanel}>
        <ScrollView
          contentContainerStyle={styles.textFormattingContent}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          <FormatButton danger icon="trash-can-outline" label="Remover" onPress={onRemove} />
          <FormatButton
            disabled={editingDisabled}
            icon="pencil-outline"
            label="Editar"
            onPress={onEdit}
          />
          <View style={styles.fontSizeControl}>
            <Pressable
              accessibilityHint="Abre o teclado para informar o tamanho da fonte"
              accessibilityLabel={`Tamanho da fonte: ${element.fontSizePt} pontos`}
              onPress={() => fontSizeInputRef.current?.focus()}
              style={styles.fontSizeValue}
            >
              <Text style={styles.formatLabel}>Tamanho</Text>
              <View style={styles.fontSizeInputRow}>
                <TextInput
                  accessibilityLabel="Valor do tamanho da fonte"
                  keyboardType="number-pad"
                  onBlur={normalizeFontSizeDraft}
                  onChangeText={changeFontSizeDraft}
                  onFocus={() => {
                    isEditingFontSize.current = true;
                  }}
                  onSubmitEditing={normalizeFontSizeDraft}
                  ref={fontSizeInputRef}
                  selectTextOnFocus
                  style={styles.fontSizeInput}
                  value={fontSizeDraft}
                />
                <Text style={styles.fontSizeUnit}>pt</Text>
              </View>
            </Pressable>
            <View style={styles.fontSizeStepper}>
              <Pressable
                accessibilityLabel="Aumentar tamanho da fonte"
                hitSlop={{ left: 5, right: 5 }}
                onPress={() => changeFontSize(1)}
                style={({ pressed }) => [
                  styles.fontSizeStepButton,
                  styles.fontSizeStepButtonTop,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons color={colors.ink} name="plus" size={15} />
              </Pressable>
              <Pressable
                accessibilityLabel="Diminuir tamanho da fonte"
                hitSlop={{ left: 5, right: 5 }}
                onPress={() => changeFontSize(-1)}
                style={({ pressed }) => [styles.fontSizeStepButton, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons color={colors.ink} name="minus" size={15} />
              </Pressable>
            </View>
          </View>
          <FormatButton
            icon="palette-outline"
            label="Cor"
            onPress={cycleColor}
            swatchColor={element.color}
          />
          <FormatButton
            icon="format-font"
            label="Fonte"
            onPress={() => setFontPickerVisible(true)}
          />
          <FormatButton
            icon={
              TEXT_ALIGNMENT_OPTIONS.find(({ value }) => value === element.textAlign)?.icon ??
              'format-align-left'
            }
            label="Alinhar"
            onPress={() => setAlignmentPickerVisible(true)}
          />
        </ScrollView>
      </View>

      <BottomSheetModal onClose={() => setFontPickerVisible(false)} visible={fontPickerVisible}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Escolha uma fonte</Text>
        <Text style={styles.sheetSubtitle}>Escolha entre a fonte padrão e três opções mais fortes.</Text>
        <View style={styles.fontOptionsList}>
          {TEXT_FONT_OPTIONS.map(({ family, heavy, label, sample }) => {
            const selected = element.fontFamily === family;

            return (
              <Pressable
                accessibilityLabel={`Fonte ${label}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={family}
                onPress={() => {
                  onChange({ ...element, fontFamily: family });
                  setFontPickerVisible(false);
                }}
                style={({ pressed }) => [
                  styles.fontOption,
                  selected && styles.fontOptionSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.fontOptionCopy}>
                  <Text style={styles.fontOptionLabel}>{label}</Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.fontOptionSample,
                      {
                        fontFamily: resolveEditorFontFamily(family),
                        fontWeight: heavy ? '900' : 'normal',
                      },
                    ]}
                  >
                    {sample}
                  </Text>
                </View>
                {selected && (
                  <MaterialCommunityIcons color={colors.blue} name="check-circle" size={22} />
                )}
              </Pressable>
            );
          })}
        </View>
      </BottomSheetModal>

      <BottomSheetModal
        onClose={() => setAlignmentPickerVisible(false)}
        visible={alignmentPickerVisible}
      >
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Alinhamento do texto</Text>
        <Text style={styles.sheetSubtitle}>Escolha como o texto será alinhado no elemento.</Text>
        <View style={styles.alignmentOptionsList}>
          {TEXT_ALIGNMENT_OPTIONS.map(({ icon, label, value }) => {
            const selected = element.textAlign === value;

            return (
              <Pressable
                accessibilityLabel={`Alinhar texto à ${label.toLowerCase()}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={value}
                onPress={() => {
                  onChange({ ...element, textAlign: value });
                  setAlignmentPickerVisible(false);
                }}
                style={({ pressed }) => [
                  styles.alignmentOption,
                  selected && styles.fontOptionSelected,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons
                  color={selected ? colors.blueStrong : colors.ink}
                  name={icon}
                  size={26}
                />
                <Text
                  style={[
                    styles.alignmentOptionLabel,
                    selected && styles.alignmentOptionLabelSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheetModal>
    </>
  );
}

type FormatButtonProps = {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
  swatchColor?: string;
};

function FormatButton({
  active = false,
  danger = false,
  disabled = false,
  icon,
  label,
  onPress,
  swatchColor,
}: FormatButtonProps) {
  const foregroundColor = danger ? colors.danger : active ? colors.blue : colors.ink;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.formatButton,
        active && styles.formatButtonActive,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {swatchColor ? (
        <View style={[styles.colorSwatch, { backgroundColor: swatchColor }]} />
      ) : (
        <MaterialCommunityIcons color={foregroundColor} name={icon} size={20} />
      )}
      <Text style={[styles.formatButtonLabel, { color: foregroundColor }]}>{label}</Text>
    </Pressable>
  );
}

type SelectionMetricsProps = {
  element?: PrintElement;
  pageWidth: number;
};

function SelectionMetrics({ element, pageWidth }: SelectionMetricsProps) {
  if (!element) return null;

  return (
    <View
      accessibilityLabel={`${element.kind === 'image' ? 'Imagem' : 'Texto'} selecionado. Posição X ${formatMeasurement(element.xMm)}, posição Y ${formatMeasurement(element.yMm)}, largura ${formatMeasurement(element.widthMm)} e altura ${formatMeasurement(element.heightMm)}`}
      style={[styles.metricsPanel, { marginLeft: RULER_THICKNESS, width: pageWidth }]}
    >
      <View style={styles.metricsRow}>
        <Metric label="X" value={element.xMm} />
        <Metric label="Y" value={element.yMm} />
        <Metric label="Largura" value={element.widthMm} />
        <Metric label="Altura" value={element.heightMm} />
      </View>
    </View>
  );
}

type MetricProps = {
  label: string;
  value: number;
};

function Metric({ label, value }: MetricProps) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{formatMeasurement(value)}</Text>
    </View>
  );
}

function formatMeasurement(valueMm: number) {
  return `${(valueMm / 10).toFixed(1).replace('.', ',')} cm`;
}

type BottomSheetModalProps = {
  children: ReactNode;
  onClose: () => void;
  visible: boolean;
};

function BottomSheetModal({ children, onClose, visible }: BottomSheetModalProps) {
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SHEET_HIDDEN_OFFSET)).current;

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    if (visible) {
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(SHEET_HIDDEN_OFFSET);
    }

    const animation = Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: MODAL_ANIMATION_DURATION_MS,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        toValue: visible ? 1 : 0,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        duration: MODAL_ANIMATION_DURATION_MS,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        toValue: visible ? 0 : SHEET_HIDDEN_OFFSET,
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });

    return () => animation.stop();
  }, [backdropOpacity, mounted, sheetTranslateY, visible]);

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={mounted}>
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable accessibilityLabel="Fechar" onPress={onClose} style={styles.backdropPressable} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY: sheetTranslateY }] }}>
          <View accessibilityViewIsModal style={styles.sheet}>
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

type FinishActionButtonProps = {
  description: string;
  disabled?: boolean;
  icon: IconName;
  label: string;
  loading?: boolean;
  onPress: () => void;
};

function FinishActionButton({
  description,
  disabled = false,
  icon,
  label,
  loading = false,
  onPress,
}: FinishActionButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.finishAction,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.finishActionIcon}>
        {loading ? (
          <ActivityIndicator color={colors.blue} size="small" />
        ) : (
          <MaterialCommunityIcons color={colors.blue} name={icon} size={24} />
        )}
      </View>
      <View style={styles.finishActionCopy}>
        <Text style={styles.finishActionTitle}>{loading ? 'Preparando…' : label}</Text>
        <Text style={styles.finishActionDescription}>{description}</Text>
      </View>
      {!loading && <MaterialCommunityIcons color={colors.muted} name="chevron-right" size={23} />}
    </Pressable>
  );
}

function isCancellationError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('cancel') || message.includes('dismiss');
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  workspace: {
    minHeight: '100%',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
    backgroundColor: colors.editorBackground,
  },
  contextualToolbar: { width: '100%', alignItems: 'center' },
  editorSurface: { width: '100%', alignItems: 'center' },
  metricsPanel: {
    minHeight: 36,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  metricsRow: { flexDirection: 'row', gap: spacing.xs },
  metric: { flex: 1, minWidth: 54 },
  metricLabel: { color: colors.muted, fontSize: 9 },
  metricValue: { marginTop: 1, color: colors.ink, fontSize: 11, fontWeight: '700' },
  selectionHintPanel: {
    width: '100%',
    maxWidth: 388,
    height: 60,
    marginBottom: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  selectionHint: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  imageActionsPanel: {
    width: '100%',
    maxWidth: 388,
    height: 60,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  imageActionButton: {
    minWidth: 88,
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
  },
  textFormattingPanel: {
    width: '100%',
    maxWidth: 388,
    height: 60,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  textFormattingContent: {
    minWidth: '100%',
    minHeight: 58,
    flexGrow: 1,
    alignItems: 'stretch',
  },
  fontSizeControl: {
    flex: 1,
    minWidth: 96,
    paddingLeft: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
  },
  fontSizeStepper: {
    width: 34,
    height: '100%',
    marginLeft: spacing.xs,
    backgroundColor: colors.background,
  },
  fontSizeStepButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontSizeStepButtonTop: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  fontSizeValue: { width: 50, alignItems: 'center' },
  formatLabel: { color: colors.muted, fontSize: 9 },
  fontSizeInput: {
    minWidth: 20,
    flexShrink: 1,
    minHeight: 24,
    padding: 0,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  fontSizeInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  fontSizeUnit: { marginLeft: 2, color: colors.ink, fontSize: 10, fontWeight: '700' },
  fontOptionsList: { gap: spacing.sm },
  fontOption: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  fontOptionSelected: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  fontOptionCopy: { flex: 1 },
  fontOptionLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  fontOptionSample: { marginTop: 3, color: colors.ink, fontSize: 18, fontWeight: '900' },
  alignmentOptionsList: { flexDirection: 'row', gap: spacing.sm },
  alignmentOption: {
    minHeight: 82,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  alignmentOptionLabel: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  alignmentOptionLabelSelected: { color: colors.blueStrong },
  formatButton: {
    flex: 1,
    minWidth: 66,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
  },
  formatButtonActive: { backgroundColor: colors.blueSoft },
  formatButtonLabel: { marginTop: 4, fontSize: 9, fontWeight: '700' },
  colorSwatch: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.paperBorder,
    backgroundColor: colors.surface,
    ...shadows.paper,
  },
  emptyText: { color: '#9AA2B1', fontSize: 13 },
  toolbar: {
    minHeight: 82,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  toolbarContent: { minHeight: 82, flexDirection: 'row' },
  toolbarItem: {
    minWidth: 0,
    flex: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
  },
  toolbarLabel: { marginTop: 2, color: colors.muted, fontSize: 10 },
  toolbarValue: { marginTop: 1, color: colors.muted, fontSize: 12, fontWeight: '800' },
  toolbarAction: {
    maxWidth: 78,
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  finishButton: {
    minWidth: 0,
    flex: 1,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
  },
  finishText: { marginTop: 3, color: colors.surface, fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.68 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  backdropPressable: { flex: 1 },
  sheet: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
  },
  sheetHeading: { flexDirection: 'row', alignItems: 'flex-start' },
  sheetHeadingCopy: { flex: 1 },
  closeButton: {
    width: 44,
    height: 44,
    marginTop: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 42,
    height: 5,
    marginTop: -8,
    marginBottom: spacing.xl,
    alignSelf: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.line,
  },
  sheetTitle: { color: colors.ink, fontSize: 21, fontWeight: '900', letterSpacing: -0.5 },
  sheetSubtitle: { marginTop: 4, marginBottom: spacing.lg, color: colors.muted, fontSize: 14 },
  finishAction: {
    minHeight: 76,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  finishActionIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.blueSoft,
  },
  finishActionCopy: { flex: 1 },
  finishActionTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  finishActionDescription: { marginTop: 3, color: colors.muted, fontSize: 12, lineHeight: 17 },
  disabled: { opacity: 0.55 },
  quantityControl: {
    marginBottom: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  quantityButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 26,
    backgroundColor: colors.blueSoft,
  },
  quantityField: { alignItems: 'center' },
  quantityLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  quantityInput: {
    minWidth: 80,
    paddingVertical: 2,
    color: colors.ink,
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
});
