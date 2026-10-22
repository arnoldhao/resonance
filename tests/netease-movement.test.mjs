import test from 'node:test';
import assert from 'node:assert/strict';
import { neteaseMovement } from '../scripts/providers.mjs';

test('NetEase zero-based lastRank supports first place and keeps missing ranks unknown', () => {
  assert.equal(neteaseMovement(1, 0).direction, 'same');
  assert.equal(neteaseMovement(1, 0).previousRank, 1);
  assert.equal(neteaseMovement(3, 0).delta, -2);
  assert.equal(neteaseMovement(3, 5).delta, 3);
  assert.equal(neteaseMovement(3, -1).direction, 'unknown');
  assert.equal(neteaseMovement(3, undefined).previousRank, null);
});
