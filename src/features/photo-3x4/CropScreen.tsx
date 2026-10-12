import Slider from '@react-native-community/slider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/AppHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, spacing } from '../../shared/theme/tokens';
import type { LocalImage } from '../../shared/types/print';

type Position = { x: number; y: number };

type CropScreenProps = {
  image: LocalImage;
  onBack: () => void;
  onChangeImage: () => void;
  onComplete: (image: LocalImage) => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export function CropScreen({ image, onBack, onChangeImage, onComplete }: CropScreenProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const frameWidth = Math.max(210, Math.min(screenWidth - 48, 310, (screenHeight - 280) * 0.75));
  const frameHeight = frameWidth * (4 / 3);
  const coverScale = Math.max(frameWidth / image.width, frameHeight / image.height);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Position>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const offsetRef = useRef(offset);
  const dragStart = useRef<Position>({ x: 0, y: 0 });

  const clampOffset = (next: Position, nextZoom = zoom): Position => {
    const displayedWidth = image.width * coverScale * nextZoom;
    const displayedHeight = image.height * coverScale * nextZoom;
    const maxX = Math.max(0, (displayedWidth - frameWidth) / 2);
    const maxY = Math.max(0, (displayedHeight - frameHeight) / 2);

    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const updateOffset = (next: Position, nextZoom = zoom) => {
    const constrained = clampOffset(next, nextZoom);
    offsetRef.current = constrained;
    setOffset(constrained);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          dragStart.current = offsetRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          updateOffset({
            x: dragStart.current.x + gesture.dx,
            y: dragStart.current.y + gesture.dy,
          });
        },
      }),
    [coverScale, frameHeight, frameWidth, image.height, image.width, zoom],
  );

  const changeZoom = (nextZoom: number) => {
    setZoom(nextZoom);
    updateOffset(offsetRef.current, nextZoom);
  };

  const completeCrop = async () => {
    try {
      setProcessing(true);
      const scale = coverScale * zoom;
      const displayedWidth = image.width * scale;
      const displayedHeight = image.height * scale;
      const originX = Math.max(0, (displayedWidth / 2 - frameWidth / 2 - offset.x) / scale);
      const originY = Math.max(0, (displayedHeight / 2 - frameHeight / 2 - offset.y) / scale);
      const cropWidth = Math.min(image.width - originX, frameWidth / scale);
      const cropHeight = Math.min(image.height - originY, frameHeight / scale);

      const result = await ImageManipulator.manipulateAsync(
        image.uri,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(cropWidth),
              height: Math.round(cropHeight),
            },
          },
          { resize: { width: 900, height: 1200 } },
        ],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG },
      );

      onComplete({ uri: result.uri, width: result.width, height: result.height });
    } catch {
      Alert.alert('Não foi possível recortar', 'Tente escolher outra imagem e faça o ajuste novamente.');
    } finally {
      setProcessing(false);
    }
  };

  const imageStyle = {
    width: image.width * coverScale,
    height: image.height * coverScale,
    transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale: zoom }],
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <AppHeader
        actionLabel="Trocar"
        dark
        onAction={onChangeImage}
        onBack={onBack}
        title="Ajustar foto"
        subtitle="Formato 3×4"
      />

      <View style={styles.content}>
        <Text style={styles.instruction}>Arraste a imagem e use o controle para ajustar o rosto.</Text>

        <View style={[styles.frame, { width: frameWidth, height: frameHeight }]} {...panResponder.panHandlers}>
          <Image source={{ uri: image.uri }} style={[styles.image, imageStyle]} />
          <View pointerEvents="none" style={styles.grid}>
            <View style={[styles.gridLine, styles.gridVerticalOne]} />
            <View style={[styles.gridLine, styles.gridVerticalTwo]} />
            <View style={[styles.gridLine, styles.gridHorizontalOne]} />
            <View style={[styles.gridLine, styles.gridHorizontalTwo]} />
          </View>
        </View>

        <View style={styles.zoomRow}>
          <MaterialCommunityIcons color={colors.cropInstruction} name="magnify-minus-outline" size={22} />
          <Slider
            accessibilityLabel="Zoom da foto"
            maximumTrackTintColor="#4B5563"
            maximumValue={MAX_ZOOM}
            minimumTrackTintColor={colors.surface}
            minimumValue={MIN_ZOOM}
            onValueChange={changeZoom}
            step={0.01}
            style={styles.slider}
            thumbTintColor={colors.surface}
            value={zoom}
          />
          <MaterialCommunityIcons color={colors.cropInstruction} name="magnify-plus-outline" size={22} />
        </View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Concluir recorte" loading={processing} onPress={completeCrop} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cropBackground },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  instruction: {
    marginBottom: spacing.lg,
    color: colors.cropInstruction,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 4,
    backgroundColor: colors.cropStage,
  },
  image: { position: 'absolute' },
  grid: { ...StyleSheet.absoluteFill },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.35)' },
  gridVerticalOne: { top: 0, bottom: 0, left: '33.333%', width: StyleSheet.hairlineWidth },
  gridVerticalTwo: { top: 0, bottom: 0, left: '66.666%', width: StyleSheet.hairlineWidth },
  gridHorizontalOne: { left: 0, right: 0, top: '33.333%', height: StyleSheet.hairlineWidth },
  gridHorizontalTwo: { left: 0, right: 0, top: '66.666%', height: StyleSheet.hairlineWidth },
  zoomRow: {
    width: '100%',
    maxWidth: 360,
    minHeight: 52,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  slider: { flex: 1, height: 44 },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#273245' },
});
