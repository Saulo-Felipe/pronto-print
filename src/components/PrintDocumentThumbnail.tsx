import { Image, StyleSheet, Text, View } from 'react-native';

import { isHeavyTextFont } from '../shared/print/fonts';
import { getImageCrop } from '../shared/print/imageCrop';
import { colors } from '../shared/theme/tokens';
import type { PrintDocument, PrintText } from '../shared/types/print';

type PrintDocumentThumbnailProps = {
  document: PrintDocument;
};

const PREVIEW_MAX_WIDTH = 66;
const PREVIEW_MAX_HEIGHT = 92;
const POINTS_TO_MILLIMETERS = 25.4 / 72;

const getVerticalAlignment = (
  alignment: PrintText['verticalAlign'],
): 'flex-start' | 'center' | 'flex-end' => {
  if (alignment === 'top') return 'flex-start';
  if (alignment === 'bottom') return 'flex-end';
  return 'center';
};

export function PrintDocumentThumbnail({ document }: PrintDocumentThumbnailProps) {
  const firstPage = document.pages[0];
  const scale = Math.min(
    PREVIEW_MAX_WIDTH / firstPage.page.widthMm,
    PREVIEW_MAX_HEIGHT / firstPage.page.heightMm,
  );
  const width = firstPage.page.widthMm * scale;
  const height = firstPage.page.heightMm * scale;

  return (
    <View style={styles.stage}>
      <View style={[styles.page, { height, width }]}>
        {firstPage.elements.map((element) => {
          const elementWidth = element.widthMm * scale;
          const elementHeight = element.heightMm * scale;
          const frameStyle = {
            height: elementHeight,
            left: element.xMm * scale,
            top: element.yMm * scale,
            transform: [{ rotate: `${element.rotationDeg}deg` }],
            width: elementWidth,
          } as const;

          if (element.kind === 'image') {
            const crop = getImageCrop(element);

            return (
              <View key={element.id} style={[styles.imageFrame, frameStyle]}>
                <Image
                  source={{ uri: element.sourceUri }}
                  style={{
                    height: elementHeight / crop.height,
                    left: -(crop.x * elementWidth) / crop.width,
                    position: 'absolute',
                    top: -(crop.y * elementHeight) / crop.height,
                    width: elementWidth / crop.width,
                  }}
                />
              </View>
            );
          }

          const fontSize = element.fontSizePt * POINTS_TO_MILLIMETERS * scale;

          return (
            <View
              key={element.id}
              style={[
                styles.textFrame,
                frameStyle,
                { justifyContent: getVerticalAlignment(element.verticalAlign) },
              ]}
            >
              <Text
                numberOfLines={4}
                style={{
                  color: element.color,
                  fontSize: Math.max(2, fontSize),
                  fontWeight: isHeavyTextFont(element.fontFamily) ? '900' : element.fontWeight,
                  letterSpacing: element.letterSpacingPt * POINTS_TO_MILLIMETERS * scale,
                  lineHeight: Math.max(2.4, fontSize * element.lineHeightMultiplier),
                  textAlign: element.textAlign,
                }}
              >
                {element.text}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: 78,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.editorBackground,
  },
  page: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.paperBorder,
    backgroundColor: colors.surface,
  },
  imageFrame: { position: 'absolute', overflow: 'hidden' },
  textFrame: { position: 'absolute', overflow: 'hidden' },
});
