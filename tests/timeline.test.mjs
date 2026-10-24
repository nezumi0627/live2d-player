import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, locateTime, clampTime, advancePlayback } from '../src/timeline.js';

const sequence = ['scene01_loop', 'scene02', 'scene02_loop'];
const clips = {
  scene01_loop: { duration: 2 },
  scene02: { duration: 3 },
  scene02_loop: { duration: 4 },
};

test('creates cumulative clip ranges for the whole story', () => {
  assert.deepEqual(createTimeline(sequence, clips), [
    { clip: 'scene01_loop', start: 0, end: 2, duration: 2 },
    { clip: 'scene02', start: 2, end: 5, duration: 3 },
    { clip: 'scene02_loop', start: 5, end: 9, duration: 4 },
  ]);
});

test('maps a time to the matching scene and local offset', () => {
  assert.deepEqual(locateTime(createTimeline(sequence, clips), 6.25), { index: 2, elapsed: 1.25, time: 6.25 });
});

test('clamps seeking to the playable timeline bounds', () => {
  assert.equal(clampTime(-2, 9), 0);
  assert.equal(clampTime(12, 9), 9);
});

test('stops after the selected scene when scene-once is selected', () => {
  assert.deepEqual(advancePlayback(createTimeline(sequence, clips), 1, 2.5, 1, 'scene-once'), {
    index: 1, elapsed: 3, ended: true,
  });
});

test('repeats only the selected scene when scene-loop is selected', () => {
  assert.deepEqual(advancePlayback(createTimeline(sequence, clips), 1, 2.5, 1, 'scene-loop'), {
    index: 1, elapsed: 0.5, ended: false,
  });
});

test('repeats the complete sequence when all-loop is selected', () => {
  assert.deepEqual(advancePlayback(createTimeline(sequence, clips), 2, 3.5, 1, 'all-loop'), {
    index: 0, elapsed: 0.5, ended: false,
  });
});

test('stops only after the complete sequence in all-once mode', () => {
  assert.deepEqual(advancePlayback(createTimeline(sequence, clips), 2, 3.5, 1, 'all-once'), {
    index: 2, elapsed: 4, ended: true,
  });
});
