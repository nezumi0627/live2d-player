import test from 'node:test';
import assert from 'node:assert/strict';
import { getSceneSequence } from '../src/sequence.js';

test('plays available scene clips from the beginning in authored phase order', () => {
  assert.deepEqual(getSceneSequence(['scene04_loop', 'scene02', 'scene01_loop', 'scene02_loop']), [
    'scene01_loop', 'scene02', 'scene02_loop', 'scene04_loop',
  ]);
});

test('ignores unrelated clips and returns an empty sequence when none are available', () => {
  assert.deepEqual(getSceneSequence(['idle', 'face']), []);
});

test('orders all 15 available animation phases from scene 1 through scene 8', () => {
  const clips = Array.from({ length: 8 }, (_, index) => {
    const scene = `scene${String(index + 1).padStart(2, '0')}`;
    return index === 0 ? [`${scene}_loop`] : [scene, `${scene}_loop`];
  }).flat();
  assert.deepEqual(getSceneSequence(clips), clips);
});
