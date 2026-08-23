import { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { EditorScreen } from './src/features/editor/EditorScreen';
import { HomeScreen } from './src/features/home/HomeScreen';
import { PdfEditorScreen } from './src/features/pdf-editor/PdfEditorScreen';
import { CropScreen } from './src/features/photo-3x4/CropScreen';
import { PRINT_LIMITS } from './src/shared/print/constants';
import {
  appendImagesToPage,
  applyPhotoCrop,
  createEmptyDocument,
} from './src/shared/print/document';
import {
  createProjectId,
  loadRecentProjects,
  persistProjectImages,
  type RecentProject,
  saveRecentProject,
} from './src/shared/print/projectHistory';
import type { LocalImage, PrintDocument } from './src/shared/types/print';

type Route = 'home' | 'crop' | 'editor' | 'pdf-editor';

export default function App() {
  const [route, setRoute] = useState<Route>('home');
  const [sourceImage, setSourceImage] = useState<LocalImage | null>(null);
  const [cropTargetIds, setCropTargetIds] = useState<string[]>([]);
  const [document, setDocument] = useState<PrintDocument | null>(null);
  const [activeEditorPageId, setActiveEditorPageId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(loadRecentProjects);
  const cropTargetId = cropTargetIds[0];

  useEffect(() => {
    if (!document || !activeProjectId) return;

    const savedPageId = document.pages.some(({ id }) => id === activeEditorPageId)
      ? activeEditorPageId!
      : document.pages[0].id;
    const saveTimer = setTimeout(() => {
      try {
        setRecentProjects(saveRecentProject(activeProjectId, document, savedPageId));
      } catch (error) {
        console.warn('Não foi possível salvar o projeto recente.', error);
      }
    }, 400);

    return () => clearTimeout(saveTimer);
  }, [activeEditorPageId, activeProjectId, document]);

  const requestPhotoPermission = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permission.granted) return true;

    Alert.alert(
      'Permissão necessária',
      'Permita o acesso às fotos para escolher as imagens que serão preparadas.',
    );
    return false;
  };

  const chooseMultipleImages = async (selectionLimit: number) => {
    if (!(await requestPhotoPermission())) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit,
      quality: 1,
    });

    if (result.canceled) return;

    const images = result.assets
      .filter(({ width, height }) => width > 0 && height > 0)
      .map(({ uri, width, height }) => ({ uri, width, height }));

    if (images.length === 0) {
      Alert.alert('Imagens inválidas', 'Não foi possível ler as imagens selecionadas.');
      return;
    }

    if (images.length < result.assets.length) {
      Alert.alert(
        'Algumas imagens não foram adicionadas',
        'Não foi possível identificar o tamanho de uma ou mais imagens.',
      );
    }

    try {
      return persistProjectImages(images);
    } catch {
      Alert.alert(
        'Não foi possível guardar as imagens',
        'Verifique o espaço disponível no dispositivo e tente novamente.',
      );
    }
  };

  const openEditor = () => {
    const newDocument = createEmptyDocument();
    setActiveProjectId(createProjectId());
    setDocument(newDocument);
    setActiveEditorPageId(newDocument.pages[0].id);
    setRoute('editor');
  };

  const openRecentProject = (project: RecentProject) => {
    const restoredPageId = project.document.pages.some(({ id }) => id === project.activePageId)
      ? project.activePageId
      : project.document.pages[0].id;

    setActiveProjectId(project.id);
    setDocument(project.document);
    setActiveEditorPageId(restoredPageId);
    setRoute('editor');
  };

  const saveCurrentProject = () => {
    if (!document || !activeProjectId) return;

    const savedPageId = document.pages.some(({ id }) => id === activeEditorPageId)
      ? activeEditorPageId!
      : document.pages[0].id;

    try {
      setRecentProjects(saveRecentProject(activeProjectId, document, savedPageId));
    } catch {
      Alert.alert(
        'Projeto não salvo',
        'Não foi possível atualizar o histórico deste projeto no dispositivo.',
      );
    }
  };

  const closeEditor = () => {
    saveCurrentProject();
    setRoute('home');
  };

  const addImages = async (pageId: string) => {
    if (!document) return;

    const imageCount = document.pages.reduce(
      (count, page) => count + page.elements.filter(({ kind }) => kind === 'image').length,
      0,
    );
    const availableSlots = PRINT_LIMITS.maxImagesPerDocument - imageCount;
    if (availableSlots <= 0) {
      Alert.alert(
        'Limite de imagens atingido',
        `Você pode adicionar até ${PRINT_LIMITS.maxImagesPerDocument} imagens por documento.`,
      );
      return;
    }

    const images = await chooseMultipleImages(availableSlots);
    if (!images) return;

    setDocument((currentDocument) =>
      currentDocument
        ? {
            ...currentDocument,
            pages: currentDocument.pages.map((page) =>
              page.id === pageId ? appendImagesToPage(page, images) : page,
            ),
          }
        : currentDocument,
    );
  };

  const chooseCropImage = async () => {
    if (!(await requestPhotoPermission())) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) return;

    const { uri, width, height } = result.assets[0];
    setSourceImage({ uri, width, height });
  };

  const startPhotoCrop = (elementIds: string[]) => {
    if (!document) return;

    const validTargetIds = elementIds.filter((elementId) =>
      document.pages.some((page) =>
        page.elements.some(({ id, kind }) => id === elementId && kind === 'image'),
      ),
    );
    const element = document.pages
      .flatMap(({ elements }) => elements)
      .find(({ id }) => id === validTargetIds[0]);
    if (!element || element.kind !== 'image') return;

    setCropTargetIds(validTargetIds);
    setSourceImage({
      uri: element.sourceUri,
      width: element.sourceWidth,
      height: element.sourceHeight,
    });
    setRoute('crop');
  };

  const finishCrop = (image: LocalImage) => {
    if (!document || !cropTargetId) return;

    let persistentImage: LocalImage;
    try {
      [persistentImage] = persistProjectImages([image]);
    } catch {
      Alert.alert(
        'Não foi possível guardar o recorte',
        'Verifique o espaço disponível no dispositivo e tente novamente.',
      );
      return;
    }

    const currentTarget = document.pages
      .flatMap(({ elements }) => elements)
      .find(({ id }) => id === cropTargetId);
    if (!currentTarget || currentTarget.kind !== 'image') return;

    const matchingTargetIds = cropTargetIds.filter((targetId) => {
      const target = document.pages
        .flatMap(({ elements }) => elements)
        .find(({ id }) => id === targetId);
      return target?.kind === 'image' && target.sourceGroupId === currentTarget.sourceGroupId;
    });
    const croppedSourceGroupId = `${currentTarget.sourceGroupId}-crop-${Date.now()}`;
    const updatedDocument = matchingTargetIds.reduce(
      (currentDocument, targetId) =>
        ({
          ...currentDocument,
          pages: currentDocument.pages.map((page) =>
            page.elements.some(({ id }) => id === targetId)
              ? applyPhotoCrop(page, targetId, persistentImage, croppedSourceGroupId)
              : page,
          ),
        }),
      document,
    );
    const matchingTargetIdSet = new Set(matchingTargetIds);
    const remainingTargetIds = cropTargetIds.filter(
      (targetId) => !matchingTargetIdSet.has(targetId),
    );
    const nextElement = updatedDocument.pages
      .flatMap(({ elements }) => elements)
      .find(({ id }) => id === remainingTargetIds[0]);

    setDocument(updatedDocument);
    setCropTargetIds(remainingTargetIds);

    if (nextElement?.kind === 'image') {
      setSourceImage({
        uri: nextElement.sourceUri,
        width: nextElement.sourceWidth,
        height: nextElement.sourceHeight,
      });
      return;
    }

    setSourceImage(null);
    setRoute('editor');
  };

  const cancelPhotoCrop = () => {
    setCropTargetIds([]);
    setSourceImage(null);
    setRoute('editor');
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style={route === 'crop' ? 'light' : 'dark'} />
        {route === 'home' && (
          <HomeScreen
            onOpenEditor={openEditor}
            onOpenPdfEditor={() => setRoute('pdf-editor')}
            onOpenProject={openRecentProject}
            recentProjects={recentProjects}
          />
        )}
        {route === 'pdf-editor' && <PdfEditorScreen onBack={() => setRoute('home')} />}
        {route === 'crop' && sourceImage && (
          <CropScreen
            image={sourceImage}
            key={`${cropTargetId}-${sourceImage.uri}`}
            onBack={cancelPhotoCrop}
            onChangeImage={chooseCropImage}
            onComplete={finishCrop}
          />
        )}
        {route === 'editor' && document && (
          <EditorScreen
            activePageId={activeEditorPageId}
            document={document}
            onAddImages={addImages}
            onBack={closeEditor}
            onChangeDocument={setDocument}
            onCropPhotos={startPhotoCrop}
            onFocusPage={setActiveEditorPageId}
          />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
