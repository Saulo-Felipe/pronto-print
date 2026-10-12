import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { LocalImage, PrintDocument, PrintElement } from '../types/print';

export type RecentProject = {
  id: string;
  activePageId: string;
  createdAt: number;
  updatedAt: number;
  document: PrintDocument;
};

const HISTORY_VERSION = 1;
const MAX_RECENT_PROJECTS = 5;
const STORAGE_DIRECTORY_NAME = 'prontoprint';
const ASSET_DIRECTORY_NAME = 'project-assets';
const HISTORY_FILE_NAME = 'project-history.json';

type StoredHistory = {
  version: typeof HISTORY_VERSION;
  projects: RecentProject[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPrintElement = (value: unknown): value is PrintElement => {
  if (!isRecord(value)) return false;

  const hasValidFrame =
    typeof value.id === 'string' &&
    isFiniteNumber(value.xMm) &&
    isFiniteNumber(value.yMm) &&
    isFiniteNumber(value.widthMm) &&
    isFiniteNumber(value.heightMm) &&
    isFiniteNumber(value.rotationDeg);
  if (!hasValidFrame) return false;

  if (value.kind === 'image') {
    return (
      typeof value.sourceGroupId === 'string' &&
      typeof value.sourceUri === 'string' &&
      isFiniteNumber(value.sourceWidth) &&
      isFiniteNumber(value.sourceHeight) &&
      isRecord(value.crop) &&
      isFiniteNumber(value.crop.x) &&
      isFiniteNumber(value.crop.y) &&
      isFiniteNumber(value.crop.width) &&
      isFiniteNumber(value.crop.height)
    );
  }

  return (
    value.kind === 'text' &&
    typeof value.text === 'string' &&
    typeof value.autoSize === 'boolean' &&
    isFiniteNumber(value.fontSizePt) &&
    typeof value.color === 'string' &&
    typeof value.fontFamily === 'string' &&
    (value.fontWeight === 'normal' || value.fontWeight === 'bold') &&
    (value.textAlign === 'left' || value.textAlign === 'center' || value.textAlign === 'right') &&
    (value.verticalAlign === 'top' ||
      value.verticalAlign === 'center' ||
      value.verticalAlign === 'bottom') &&
    isFiniteNumber(value.lineHeightMultiplier) &&
    isFiniteNumber(value.letterSpacingPt)
  );
};

const isPrintDocument = (value: unknown): value is PrintDocument => {
  if (!isRecord(value) || !Array.isArray(value.pages) || value.pages.length === 0) return false;

  return value.pages.every(
    (page) =>
      isRecord(page) &&
      typeof page.id === 'string' &&
      isRecord(page.page) &&
      isFiniteNumber(page.page.widthMm) &&
      isFiniteNumber(page.page.heightMm) &&
      (page.page.orientation === 'portrait' || page.page.orientation === 'landscape') &&
      Array.isArray(page.elements) &&
      page.elements.every(isPrintElement),
  );
};

const isRecentProject = (value: unknown): value is RecentProject =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.activePageId === 'string' &&
  isFiniteNumber(value.createdAt) &&
  isFiniteNumber(value.updatedAt) &&
  isPrintDocument(value.document);

const getStorageDirectory = () => new Directory(Paths.document, STORAGE_DIRECTORY_NAME);

const ensureStorageDirectory = () => {
  const directory = getStorageDirectory();
  directory.create({ idempotent: true, intermediates: true });
  return directory;
};

const getAssetDirectory = () => new Directory(getStorageDirectory(), ASSET_DIRECTORY_NAME);

const ensureAssetDirectory = () => {
  ensureStorageDirectory();
  const directory = getAssetDirectory();
  directory.create({ idempotent: true, intermediates: true });
  return directory;
};

const getHistoryFile = () => new File(getStorageDirectory(), HISTORY_FILE_NAME);

export const createProjectId = () =>
  `project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function persistProjectImages(images: LocalImage[]): LocalImage[] {
  if (Platform.OS === 'web' || images.length === 0) return images;

  const assetDirectory = ensureAssetDirectory();
  const copiedFiles: File[] = [];

  try {
    return images.map((image, index) => {
      if (image.uri.startsWith(assetDirectory.uri)) return image;

      const source = new File(image.uri);
      if (!source.exists) throw new Error('A imagem selecionada não está mais disponível.');

      const extension = /^\.[a-zA-Z0-9]+$/.test(source.extension) ? source.extension : '.jpg';
      const destination = new File(
        assetDirectory,
        `image-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}${extension}`,
      );
      source.copySync(destination);
      copiedFiles.push(destination);

      return { ...image, uri: destination.uri };
    });
  } catch (error) {
    copiedFiles.forEach((file) => {
      if (file.exists) file.delete();
    });
    throw error;
  }
}

export function loadRecentProjects(): RecentProject[] {
  if (Platform.OS === 'web') return [];

  try {
    const historyFile = getHistoryFile();
    if (!historyFile.exists) return [];

    const storedHistory: unknown = JSON.parse(historyFile.textSync());
    if (!isRecord(storedHistory) || storedHistory.version !== HISTORY_VERSION) return [];
    if (!Array.isArray(storedHistory.projects)) return [];

    return storedHistory.projects
      .filter(isRecentProject)
      .sort((first, second) => second.updatedAt - first.updatedAt)
      .slice(0, MAX_RECENT_PROJECTS);
  } catch {
    return [];
  }
}

export function saveRecentProject(
  projectId: string,
  document: PrintDocument,
  activePageId: string,
): RecentProject[] {
  if (Platform.OS === 'web') return [];

  const now = Date.now();
  const projects = loadRecentProjects();
  const currentProject = projects.find(({ id }) => id === projectId);
  const changedProject: RecentProject = {
    id: projectId,
    activePageId,
    createdAt: currentProject?.createdAt ?? now,
    updatedAt: now,
    document,
  };
  const recentProjects = [changedProject, ...projects.filter(({ id }) => id !== projectId)]
    .sort((first, second) => second.updatedAt - first.updatedAt)
    .slice(0, MAX_RECENT_PROJECTS);
  const storedHistory: StoredHistory = { version: HISTORY_VERSION, projects: recentProjects };
  const historyFile = getHistoryFile();

  ensureStorageDirectory();
  historyFile.create({ overwrite: true, intermediates: true });
  historyFile.write(JSON.stringify(storedHistory));
  removeUnusedAssets(recentProjects);

  return recentProjects;
}

function removeUnusedAssets(projects: RecentProject[]) {
  const assetDirectory = getAssetDirectory();
  if (!assetDirectory.exists) return;

  const retainedUris = new Set(
    projects.flatMap(({ document }) =>
      document.pages.flatMap(({ elements }) =>
        elements.flatMap((element) => (element.kind === 'image' ? [element.sourceUri] : [])),
      ),
    ),
  );

  assetDirectory.list().forEach((entry) => {
    if (entry instanceof File && !retainedUris.has(entry.uri)) entry.delete();
  });
}
