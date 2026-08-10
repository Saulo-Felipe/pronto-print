import { useState } from 'react';
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
  appendImagesToDocument,
  applyPhotoCrop,
  createEmptyDocument,
} from './src/shared/print/document';
import type { LocalImage, PrintDocument } from './src/shared/types/print';

type Route = 'home' | 'crop' | 'editor' | 'pdf-editor';

export default function App() {
  const [route, setRoute] = useState<Route>('home');
  const [sourceImage, setSourceImage] = useState<LocalImage | null>(null);
  const [cropTargetIds, setCropTargetIds] = useState<string[]>([]);
  const [document, setDocument] = useState<PrintDocument | null>(null);
  const cropTargetId = cropTargetIds[0];

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

    return images;
  };

  const openEditor = () => {
    setDocument(createEmptyDocument());
    setRoute('editor');
  };

  const addImages = async () => {
    if (!document) return;

    const imageCount = document.elements.filter(({ kind }) => kind === 'image').length;
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
      currentDocument ? appendImagesToDocument(currentDocument, images) : currentDocument,
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
      document.elements.some(({ id, kind }) => id === elementId && kind === 'image'),
    );
    const element = document.elements.find(({ id }) => id === validTargetIds[0]);
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

    const currentTarget = document.elements.find(({ id }) => id === cropTargetId);
    if (!currentTarget || currentTarget.kind !== 'image') return;

    const matchingTargetIds = cropTargetIds.filter((targetId) => {
      const target = document.elements.find(({ id }) => id === targetId);
      return target?.kind === 'image' && target.sourceGroupId === currentTarget.sourceGroupId;
    });
    const croppedSourceGroupId = `${currentTarget.sourceGroupId}-crop-${Date.now()}`;
    const updatedDocument = matchingTargetIds.reduce(
      (currentDocument, targetId) =>
        applyPhotoCrop(currentDocument, targetId, image, croppedSourceGroupId),
      document,
    );
    const matchingTargetIdSet = new Set(matchingTargetIds);
    const remainingTargetIds = cropTargetIds.filter(
      (targetId) => !matchingTargetIdSet.has(targetId),
    );
    const nextElement = updatedDocument.elements.find(({ id }) => id === remainingTargetIds[0]);

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
          <HomeScreen onOpenEditor={openEditor} onOpenPdfEditor={() => setRoute('pdf-editor')} />
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
            document={document}
            onAddImages={addImages}
            onBack={() => setRoute('home')}
            onChangeDocument={setDocument}
            onCropPhotos={startPhotoCrop}
          />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
