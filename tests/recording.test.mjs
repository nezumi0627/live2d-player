import test from 'node:test';
import assert from 'node:assert/strict';
import { canRecordCanvas } from '../src/recording.js';

test('recording requires MediaRecorder and canvas captureStream', () => {
  assert.equal(canRecordCanvas({ captureStream() {} }, class MediaRecorder {}), true);
  assert.equal(canRecordCanvas({}, class MediaRecorder {}), false);
  assert.equal(canRecordCanvas({ captureStream() {} }, undefined), false);
});
