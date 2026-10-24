import test from 'node:test';
import assert from 'node:assert/strict';
import { audioTimeToTimeline, timelineTimeToAudio, locateAudioTime } from '../src/audio-sync.js';

const timeline = [
  { clip: 'one', start: 0, end: 2, duration: 2 },
  { clip: 'two', start: 2, end: 6, duration: 4 },
];

test('audio duration is the master clock for the full motion sequence', () => {
  assert.equal(audioTimeToTimeline(5, 10, 6), 3);
  assert.equal(timelineTimeToAudio(3, 6, 10), 5);
});

test('full-sequence clock resolves the matching clip at the same normalized point', () => {
  assert.deepEqual(locateAudioTime(timeline, 5, 10, false, 0), { index: 1, elapsed: 1, time: 3 });
});

test('single-scene clock stretches the selected motion to the cue duration', () => {
  assert.deepEqual(locateAudioTime(timeline, 5, 10, true, 1), { index: 1, elapsed: 2 });
});
