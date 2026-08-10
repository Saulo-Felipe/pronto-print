import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../shared/theme/tokens';
import type { PrintPage } from '../../shared/types/print';

export const RULER_THICKNESS = 28;

const TICK_INTERVAL_MM = 10;
const LABEL_INTERVAL_MM = 50;
const INDICATOR_LABEL_WIDTH = 40;

type PageRulersProps = {
  children: ReactNode;
  indicator: { xMm: number; yMm: number } | null;
  page: PrintPage;
  pageHeight: number;
  pageWidth: number;
};

export function PageRulers({
  children,
  indicator,
  page,
  pageHeight,
  pageWidth,
}: PageRulersProps) {
  return (
    <View accessibilityLabel="Folha com réguas em centímetros">
      <View style={styles.topRow}>
        <View style={styles.corner}>
          <Text style={styles.unitLabel}>cm</Text>
        </View>
        <HorizontalRuler
          indicatorMm={indicator?.xMm ?? null}
          lengthMm={page.widthMm}
          renderedLength={pageWidth}
        />
      </View>
      <View style={styles.contentRow}>
        <VerticalRuler
          indicatorMm={indicator?.yMm ?? null}
          lengthMm={page.heightMm}
          renderedLength={pageHeight}
        />
        {children}
      </View>
    </View>
  );
}

type RulerProps = {
  indicatorMm: number | null;
  lengthMm: number;
  renderedLength: number;
};

function HorizontalRuler({ indicatorMm, lengthMm, renderedLength }: RulerProps) {
  const indicatorPosition =
    indicatorMm === null ? null : (indicatorMm / lengthMm) * renderedLength;

  return (
    <View style={[styles.horizontalRuler, { width: renderedLength }]}>
      {createTicks(lengthMm).map((valueMm) => {
        const position = (valueMm / lengthMm) * renderedLength;
        const labeled = isLabeledTick(valueMm, lengthMm);

        return (
          <View
            key={valueMm}
            style={[
              styles.horizontalTick,
              labeled ? styles.majorHorizontalTick : styles.minorHorizontalTick,
              { left: Math.min(renderedLength - 1, position) },
            ]}
          >
            {labeled && (
              <Text
                style={[
                  styles.horizontalTickLabel,
                  { left: getHorizontalLabelOffset(valueMm, lengthMm) },
                ]}
              >
                {formatTickValue(valueMm)}
              </Text>
            )}
          </View>
        );
      })}
      {indicatorPosition !== null && (
        <>
          <View style={[styles.horizontalIndicator, { left: indicatorPosition }]} />
          <View
            style={[
              styles.horizontalIndicatorLabel,
              {
                left: clamp(
                  indicatorPosition - INDICATOR_LABEL_WIDTH / 2,
                  0,
                  renderedLength - INDICATOR_LABEL_WIDTH,
                ),
              },
            ]}
          >
            <Text style={styles.indicatorText}>{formatCentimeters(indicatorMm ?? 0)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

function VerticalRuler({ indicatorMm, lengthMm, renderedLength }: RulerProps) {
  const indicatorPosition =
    indicatorMm === null ? null : (indicatorMm / lengthMm) * renderedLength;

  return (
    <View style={[styles.verticalRuler, { height: renderedLength }]}>
      {createTicks(lengthMm).map((valueMm) => {
        const position = (valueMm / lengthMm) * renderedLength;
        const labeled = isLabeledTick(valueMm, lengthMm);

        return (
          <View
            key={valueMm}
            style={[
              styles.verticalTick,
              labeled ? styles.majorVerticalTick : styles.minorVerticalTick,
              { top: Math.min(renderedLength - 1, position) },
            ]}
          >
            {labeled && (
              <Text
                style={[
                  styles.verticalTickLabel,
                  {
                    top: clamp(
                      -6,
                      -position,
                      renderedLength - position - 12,
                    ),
                  },
                ]}
              >
                {formatTickValue(valueMm)}
              </Text>
            )}
          </View>
        );
      })}
      {indicatorPosition !== null && (
        <>
          <View style={[styles.verticalIndicator, { top: indicatorPosition }]} />
          <View
            style={[
              styles.verticalIndicatorLabel,
              { top: clamp(indicatorPosition - 7, 0, renderedLength - 14) },
            ]}
          >
            <Text style={styles.indicatorText}>{formatCentimeters(indicatorMm ?? 0)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

function createTicks(lengthMm: number) {
  const regularTicks = Array.from(
    { length: Math.floor(lengthMm / TICK_INTERVAL_MM) + 1 },
    (_, index) => index * TICK_INTERVAL_MM,
  );

  return regularTicks.at(-1) === lengthMm ? regularTicks : [...regularTicks, lengthMm];
}

function isLabeledTick(valueMm: number, lengthMm: number) {
  return valueMm % LABEL_INTERVAL_MM === 0 || valueMm === lengthMm;
}

function getHorizontalLabelOffset(valueMm: number, lengthMm: number) {
  if (valueMm === 0) return 2;
  if (valueMm === lengthMm) return -22;
  return -12;
}

function formatCentimeters(valueMm: number) {
  return `${formatDecimal(valueMm / 10)} cm`;
}

function formatTickValue(valueMm: number) {
  return formatDecimal(valueMm / 10);
}

function formatDecimal(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row' },
  contentRow: { flexDirection: 'row', alignItems: 'flex-start' },
  corner: {
    width: RULER_THICKNESS,
    height: RULER_THICKNESS,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.background,
  },
  unitLabel: { color: colors.muted, fontSize: 8, fontWeight: '700' },
  horizontalRuler: {
    position: 'relative',
    height: RULER_THICKNESS,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.background,
  },
  verticalRuler: {
    position: 'relative',
    width: RULER_THICKNESS,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
    backgroundColor: colors.background,
  },
  horizontalTick: {
    position: 'absolute',
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.muted,
  },
  majorHorizontalTick: { height: 9 },
  minorHorizontalTick: { height: 5 },
  horizontalTickLabel: {
    position: 'absolute',
    top: -17,
    width: 30,
    color: colors.muted,
    fontSize: 7,
    lineHeight: 9,
    textAlign: 'center',
  },
  verticalTick: {
    position: 'absolute',
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.muted,
  },
  majorVerticalTick: { width: 9 },
  minorVerticalTick: { width: 5 },
  verticalTickLabel: {
    position: 'absolute',
    right: 9,
    width: 19,
    color: colors.muted,
    fontSize: 7,
    lineHeight: 10,
    textAlign: 'center',
  },
  horizontalIndicator: {
    position: 'absolute',
    zIndex: 2,
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.blue,
  },
  horizontalIndicatorLabel: {
    position: 'absolute',
    zIndex: 3,
    top: 1,
    width: INDICATOR_LABEL_WIDTH,
    height: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    backgroundColor: colors.blue,
  },
  verticalIndicator: {
    position: 'absolute',
    zIndex: 2,
    left: 0,
    right: 0,
    height: 2,
    marginTop: -1,
    backgroundColor: colors.blue,
  },
  verticalIndicatorLabel: {
    position: 'absolute',
    zIndex: 3,
    left: 1,
    width: RULER_THICKNESS - 3,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    backgroundColor: colors.blue,
  },
  indicatorText: { color: colors.surface, fontSize: 7, fontWeight: '800' },
});
