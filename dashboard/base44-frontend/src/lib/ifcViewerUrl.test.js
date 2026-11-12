import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ifcViewerUrl, legacyIfcViewerUrl } from './ifcViewerUrl.js';

test('a heat option on its own starts a query instead of changing the asset path', () => {
  assert.equal(ifcViewerUrl(), '/ifc-viewer/index.html');
  assert.equal(ifcViewerUrl({ heat: true }), '/ifc-viewer/index.html?heat=true');
});

test('campus, room heat and BIM options share the same canonical viewer path', () => {
  assert.equal(ifcViewerUrl({ campus: true, heat: true }), '/ifc-viewer/index.html?campus=d21&heat=true');
  assert.equal(ifcViewerUrl({ campus: true, mapOnly: true, heat: true }), '/ifc-viewer/index.html?campus=d21&map-only=true&heat=true');
  assert.equal(ifcViewerUrl({ roomHeat: true }), '/ifc-viewer/index.html?room-heat=true');
  assert.equal(ifcViewerUrl({ example: true, presentation: 'bim' }), '/ifc-viewer/index.html?example=true&presentation=bim');
});

test('old malformed heat links fall back to the campus simulation without an IFC upload', () => {
  const expected = '/ifc-viewer/index.html?campus=d21&map-only=true&heat=true';
  assert.equal(legacyIfcViewerUrl('/ifc-viewer/index.html&heat=true'), expected);
  assert.equal(legacyIfcViewerUrl('/ifc-viewer/index.html%26heat%3Dtrue'), expected);
  assert.equal(legacyIfcViewerUrl('/ifc-viewer/index.html'), null);
  assert.equal(legacyIfcViewerUrl('/not-the-viewer&heat=true'), null);
  assert.equal(legacyIfcViewerUrl('/%not-a-path'), null);
});
