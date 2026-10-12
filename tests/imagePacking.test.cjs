const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

// Executa os cálculos TypeScript diretamente, sem depender de React Native.
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, filename);
};
const { arrangePackedImageCopies, getPackedImageMultiplicationLimit } = require('../src/shared/print/imagePacking.ts');
const { arrangeFittedImageSelectionCopies, getElementBounds, getImageMultiplicationLimit } = require('../src/shared/print/document.ts');
const { A4_PAGE, PRINT_LIMITS } = require('../src/shared/print/constants.ts');

const image = (widthMm, heightMm, id = 'photo', rotationDeg = 0) => ({
  kind: 'image', id, sourceGroupId: id, sourceUri: `file:///${id}.jpg`,
  sourceWidth: 1200, sourceHeight: 1600,
  crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  xMm: 10, yMm: 20, widthMm, heightMm, rotationDeg,
});

function assertLayout(copies, page, gap = 0) {
  const bounds = copies.map(getElementBounds);
  const tolerance = 1e-6;
  assert.equal(new Set(copies.map(copy => copy.id)).size, copies.length);
  for (const bound of bounds) {
    assert.ok(bound.left >= PRINT_LIMITS.marginMm - tolerance);
    assert.ok(bound.top >= PRINT_LIMITS.marginMm - tolerance);
    assert.ok(bound.right <= page.widthMm - PRINT_LIMITS.marginMm + tolerance);
    assert.ok(bound.bottom <= page.heightMm - PRINT_LIMITS.marginMm + tolerance);
  }
  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i], b = bounds[j];
      assert.ok(a.right + gap <= b.left + tolerance || b.right + gap <= a.left + tolerance ||
        a.bottom + gap <= b.top + tolerance || b.bottom + gap <= a.top + tolerance);
    }
  }
}

test('encaixes com rotações aumentam a capacidade sem mudar tamanho ou recorte', () => {
  const sources = [image(80, 25)];
  const original = JSON.stringify(sources);
  const limit = getPackedImageMultiplicationLimit(sources);
  assert.ok(limit > getImageMultiplicationLimit(sources));
  const copies = arrangePackedImageCopies(sources, limit, A4_PAGE, false, 42);
  assert.equal(copies.length, limit);
  assertLayout(copies, A4_PAGE, PRINT_LIMITS.gapMm);
  for (const copy of copies) {
    assert.equal(copy.widthMm, 80);
    assert.equal(copy.heightMm, 25);
    assert.deepEqual(copy.crop, sources[0].crop);
    assert.equal(copy.sourceUri, sources[0].sourceUri);
  }
  assert.equal(JSON.stringify(sources), original);
  assert.ok(copies.some(copy => copy.rotationDeg % 180 === 90));
});

test('fontes diferentes e folhas em ambas as orientações preservam quantidade e limites', () => {
  const sources = [image(30, 40, 'a', 37), image(60, 25, 'b', 180)];
  for (const page of [A4_PAGE, { widthMm: 297, heightMm: 210, orientation: 'landscape' }]) {
    const limit = getPackedImageMultiplicationLimit(sources, page);
    for (const quantity of [1, 2, 7, limit]) {
      const copies = arrangePackedImageCopies(sources, quantity, page, false, 13);
      assert.equal(copies.length, quantity);
      assertLayout(copies, page, PRINT_LIMITS.gapMm);
      assert.equal(copies.filter(copy => copy.sourceGroupId === 'a').length, Math.ceil(quantity / 2));
    }
  }
});

test('ajuste automático mantém todas as cópias e aproveitamento pelo menos igual à grade atual', () => {
  const sources = [image(58, 90), image(25, 80, 'second')];
  for (const quantity of [1, 7, 40, 100]) {
    const copies = arrangePackedImageCopies(sources, quantity, A4_PAGE, true, 7);
    const baseline = arrangeFittedImageSelectionCopies(sources, quantity);
    assert.equal(copies.length, quantity);
    assertLayout(copies, A4_PAGE);
    assert.ok(copies[0].widthMm >= baseline[0].widthMm - 1e-6);
    for (let i = 0; i < copies.length; i++) {
      const source = sources[i % sources.length];
      assert.ok(Math.abs(copies[i].widthMm / copies[i].heightMm - source.widthMm / source.heightMm) < 1e-6);
    }
  }
});

test('semente torna a distribuição reproduzível e permite variar posições e rotações', () => {
  const sources = [image(80, 25)];
  const first = arrangePackedImageCopies(sources, 15, A4_PAGE, false, 1);
  assert.deepEqual(first, arrangePackedImageCopies(sources, 15, A4_PAGE, false, 1));
  const different = arrangePackedImageCopies(sources, 15, A4_PAGE, false, 9000);
  assert.notDeepEqual(first.map(({ xMm, yMm, rotationDeg }) => [xMm, yMm, rotationDeg]),
    different.map(({ xMm, yMm, rotationDeg }) => [xMm, yMm, rotationDeg]));
  assertLayout(different, A4_PAGE);
});

test('seleção vazia e quantidade acima do limite', () => {
  assert.deepEqual(arrangePackedImageCopies([], 5), []);
  assert.equal(getPackedImageMultiplicationLimit([]), 0);
  const sources = [image(60, 100)];
  const limit = getPackedImageMultiplicationLimit(sources);
  assert.equal(arrangePackedImageCopies(sources, limit + 100).length, limit);
});
