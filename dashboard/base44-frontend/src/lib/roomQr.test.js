import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loginLocation, safeReturnTo } from './authReturnTo.js';
import { clearBuildingParameters } from './buildingScope.js';
import { roomCardLink, roomQRCodeLink } from './roomLocation.js';

const origin = 'https://nala-solutions.de';
const roomID = '3d80fe83-3687-499a-b597-827a70c8576d';

test('the QR code URL includes only the IDs and the room-card view', () => {
  const made = roomQRCodeLink(21, roomID, new URL('http://localhost:5173/gebaeude?access_token=example'));
  assert.equal(made, origin + roomCardLink(21, roomID));
  const url = new URL(made);
  assert.deepEqual([...url.searchParams], [['building', '21'], ['room', roomID], ['karte', '1']]);
  assert.equal(clearBuildingParameters(url.search).toString(), '');
});

test('sign-in keeps the internal QR route and rejects external redirect targets', () => {
  const target = new URL(roomCardLink(21, roomID), origin);
  const login = new URL(loginLocation(target), origin);
  assert.equal(safeReturnTo(login), target.pathname + target.search);
  for (const returnTo of ['//example.invalid/', '/.//example.invalid/', 'https://example.invalid/', '/\\example.invalid']) {
    login.searchParams.set('returnTo', returnTo);
    assert.equal(safeReturnTo(login), '/');
  }
});
