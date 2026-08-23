import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrintDocumentThumbnail } from '../../components/PrintDocumentThumbnail';
import type { RecentProject } from '../../shared/print/projectHistory';
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
    title: 'Editor de impressão',
    description: 'Adicione imagens e textos e organize tudo em uma folha para imprimir.',
    action: 'Abrir editor',
    color: colors.coral,
    softColor: colors.coralSoft,
    icon: 'file-document-edit-outline',
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
  onOpenProject: (project: RecentProject) => void;
  recentProjects: RecentProject[];
};

export function HomeScreen({
  onOpenEditor,
  onOpenPdfEditor,
  onOpenProject,
  recentProjects,
}: HomeScreenProps) {
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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Projetos recentes</Text>
            <Text style={styles.sectionSubtitle}>Continue de onde você parou</Text>
          </View>
          {recentProjects.length > 0 && (
            <Text style={styles.projectCount}>{recentProjects.length}/5</Text>
          )}
        </View>

        {recentProjects.length > 0 ? (
          <ScrollView
            contentContainerStyle={styles.projectCarousel}
            decelerationRate="fast"
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToAlignment="start"
            snapToInterval={242}
          >
            {recentProjects.map((project) => (
              <RecentProjectCard
                key={project.id}
                onPress={() => onOpenProject(project)}
                project={project}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyHistory}>
            <View style={styles.emptyHistoryIcon}>
              <MaterialCommunityIcons color={colors.blue} name="history" size={23} />
            </View>
            <View style={styles.emptyHistoryCopy}>
              <Text style={styles.emptyHistoryTitle}>Nenhum projeto recente</Text>
              <Text style={styles.emptyHistoryDescription}>
                Seus últimos trabalhos aparecerão aqui automaticamente.
              </Text>
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, styles.toolsTitle]}>Ferramentas</Text>
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
                <Text numberOfLines={2} style={styles.cardTitle}>
                  {tool.title}
                </Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

type RecentProjectCardProps = {
  onPress: () => void;
  project: RecentProject;
};

function RecentProjectCard({ onPress, project }: RecentProjectCardProps) {
  const pageCount = project.document.pages.length;
  const elements = project.document.pages.flatMap(({ elements: pageElements }) => pageElements);
  const imageCount = elements.filter(({ kind }) => kind === 'image').length;
  const textCount = elements.length - imageCount;
  const contentLabel = `${imageCount} ${imageCount === 1 ? 'imagem' : 'imagens'} • ${textCount} ${
    textCount === 1 ? 'texto' : 'textos'
  }`;

  return (
    <Pressable
      accessibilityHint="Abre o projeto no editor"
      accessibilityLabel={`Projeto com ${pageCount} ${pageCount === 1 ? 'página' : 'páginas'}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.projectCard, pressed && styles.cardPressed]}
    >
      <PrintDocumentThumbnail document={project.document} />
      <View style={styles.projectCardCopy}>
        <Text numberOfLines={1} style={styles.projectCardTitle}>
          {pageCount} {pageCount === 1 ? 'página' : 'páginas'}
        </Text>
        <Text numberOfLines={2} style={styles.projectCardDetails}>
          {contentLabel}
        </Text>
        <Text style={styles.projectDate}>{formatProjectDate(project.updatedAt)}</Text>
        <View style={styles.continueRow}>
          <Text style={styles.continueLabel}>Continuar</Text>
          <MaterialCommunityIcons color={colors.blue} name="arrow-right" size={15} />
        </View>
      </View>
    </Pressable>
  );
}

function formatProjectDate(timestamp: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(timestamp);
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
  content: { padding: 14, paddingBottom: spacing.xxxl },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  sectionSubtitle: { marginTop: 2, color: colors.muted, fontSize: 12 },
  projectCount: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  projectCarousel: { gap: spacing.md, paddingRight: spacing.md },
  projectCard: {
    width: 230,
    minHeight: 132,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  projectCardCopy: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  projectCardTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  projectCardDetails: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 15 },
  projectDate: { marginTop: 5, color: colors.muted, fontSize: 10, fontWeight: '700' },
  continueRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  continueLabel: { color: colors.blue, fontSize: 11, fontWeight: '800' },
  emptyHistory: {
    minHeight: 86,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  emptyHistoryIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.blueSoft,
  },
  emptyHistoryCopy: { flex: 1 },
  emptyHistoryTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  emptyHistoryDescription: { marginTop: 2, color: colors.muted, fontSize: 12, lineHeight: 16 },
  toolsTitle: { marginTop: spacing.xl, marginBottom: spacing.sm },
  toolList: { gap: spacing.md },
  card: {
    minHeight: 132,
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
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    letterSpacing: -0.25,
  },
  cardDescription: { marginTop: 3, color: colors.muted, fontSize: 12, lineHeight: 16 },
  cardActionRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardAction: { fontSize: 12, fontWeight: '800' },
});
