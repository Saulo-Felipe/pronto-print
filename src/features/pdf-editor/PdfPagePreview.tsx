import { MaterialCommunityIcons } from '@expo/vector-icons';
import { lazy, Suspense, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TurboModuleRegistry,
  UIManager,
  View,
} from 'react-native';

import { colors, spacing } from '../../shared/theme/tokens';

type PdfPagePreviewProps = {
  pageNumber: number;
  uri: string;
};

const A4_ASPECT_RATIO = 210 / 297;
const NativePdf = lazy(() => import('react-native-pdf'));

function canRenderPdfNatively() {
  const blobModule = TurboModuleRegistry.get('ReactNativeBlobUtil');
  if (!blobModule) return false;

  return Boolean(UIManager.getViewManagerConfig?.('RCTPdf'));
}

export function PdfPagePreview({ pageNumber, uri }: PdfPagePreviewProps) {
  const [aspectRatio, setAspectRatio] = useState(A4_ASPECT_RATIO);
  const [hasError, setHasError] = useState(false);
  const nativeRendererAvailable = canRenderPdfNatively();

  if (!nativeRendererAvailable) {
    return (
      <View style={[styles.preview, { aspectRatio }]}>
        <MaterialCommunityIcons color={colors.muted} name="file-pdf-box" size={32} />
        <Text style={styles.errorText}>Prévia requer novo build</Text>
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={[styles.preview, { aspectRatio }]}>
        <MaterialCommunityIcons color={colors.muted} name="file-alert-outline" size={30} />
        <Text style={styles.errorText}>Prévia indisponível</Text>
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={[styles.preview, { aspectRatio }]}>
      <Suspense fallback={<ActivityIndicator color={colors.blue} size="small" />}>
        <NativePdf
          enableAnnotationRendering={false}
          enableDoubleTapZoom={false}
          fitPolicy={2}
          onError={() => setHasError(true)}
          onLoadComplete={(_, __, size) => {
            if (size.width > 0 && size.height > 0) {
              setAspectRatio(size.width / size.height);
            }
          }}
          page={pageNumber}
          renderActivityIndicator={() => <ActivityIndicator color={colors.blue} size="small" />}
          scrollEnabled={false}
          singlePage
          source={{ uri }}
          style={styles.pdf}
          trustAllCerts={false}
        />
      </Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.editorBackground,
  },
  pdf: { width: '100%', height: '100%', backgroundColor: colors.editorBackground },
  errorText: { marginTop: spacing.xs, color: colors.muted, fontSize: 11 },
});
