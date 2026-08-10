import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing } from '../../shared/theme/tokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type Tool = {
  key: 'pdf-editor' | 'image-editor';
  title: string;
  description: string;
  action: string;
  color: string;
  softColor: string;
  icon: IconName;
};

const tools: Tool[] = [
  {
    key: 'image-editor',
    title: 'Editor de imagens',
    description: 'Adicione imagens e textos e organize tudo em uma folha para imprimir.',
    action: 'Abrir editor',
    color: colors.coral,
    softColor: colors.coralSoft,
    icon: 'image-edit-outline',
  },
  {
    key: 'pdf-editor',
    title: 'Editor de PDF',
    description: 'Junte PDFs, organize os arquivos e remova páginas antes de salvar.',
    action: 'Editar PDF',
    color: colors.blue,
    softColor: colors.blueSoft,
    icon: 'file-pdf-box',
  },
];

type HomeScreenProps = {
  onOpenEditor: () => void;
  onOpenPdfEditor: () => void;
};

export function HomeScreen({ onOpenEditor, onOpenPdfEditor }: HomeScreenProps) {
  const openTool = (tool: Tool) => {
    if (tool.key === 'pdf-editor') {
      onOpenPdfEditor();
      return;
    }

    onOpenEditor();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <MaterialCommunityIcons color={colors.surface} name="printer" size={21} />
          </View>
          <Text style={styles.brandName}>
            Pronto<Text style={styles.brandAccent}>Print</Text>
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Abrir ajuda"
          hitSlop={8}
          onPress={() => Alert.alert('Como funciona?', 'Escolha uma ferramenta para começar.')}
          style={({ pressed }) => [styles.helpButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons color={colors.muted} name="help-circle-outline" size={22} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.toolList}>
          {tools.map((tool) => (
            <Pressable
              accessibilityHint={`Abre ${tool.title.toLocaleLowerCase('pt-BR')}`}
              accessibilityRole="button"
              key={tool.key}
              onPress={() => openTool(tool)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={[styles.illustration, { backgroundColor: tool.softColor }]}>
                <MaterialCommunityIcons color={tool.color} name={tool.icon} size={38} />
              </View>

              <View style={styles.cardCopy}>
                <View style={styles.titleRow}>
                  <Text numberOfLines={2} style={styles.cardTitle}>
                    {tool.title}
                  </Text>
                  <View style={[styles.arrow, { backgroundColor: tool.softColor }]}>
                    <MaterialCommunityIcons
                      color={tool.color}
                      name="arrow-top-right"
                      size={17}
                    />
                  </View>
                </View>
                <Text numberOfLines={2} style={styles.cardDescription}>
                  {tool.description}
                </Text>
                <View style={styles.cardActionRow}>
                  <Text style={[styles.cardAction, { color: tool.color }]}>{tool.action}</Text>
                  <MaterialCommunityIcons color={tool.color} name="arrow-right" size={16} />
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 60,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: colors.blue,
  },
  brandName: { color: colors.ink, fontSize: 20, fontWeight: '900', letterSpacing: -0.7 },
  brandAccent: { color: colors.blue },
  helpButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
  content: { flex: 1, padding: 14 },
  toolList: { flex: 1, justifyContent: 'flex-start', gap: spacing.md },
  card: {
    flex: 1,
    maxHeight: 160,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  illustration: {
    width: 78,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  cardCopy: { flex: 1, marginLeft: spacing.md, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    letterSpacing: -0.25,
  },
  arrow: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  cardDescription: { marginTop: 3, color: colors.muted, fontSize: 12, lineHeight: 16 },
  cardActionRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardAction: { fontSize: 12, fontWeight: '800' },
});
