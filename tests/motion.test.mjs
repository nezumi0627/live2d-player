import test from 'node:test';
import assert from 'node:assert/strict';
import { blendMotionValues, sampleMotion } from '../src/motion.js';

const motion = {
  duration: 2,
  loop: true,
  tracks: { ParamAngleX: [[0, 0], [1, 10], [2, 0]] },
};

test('samples between adjacent parameter frames', () => {
  assert.deepEqual(sampleMotion(motion, 0.5), { ParamAngleX: 5 });
});

test('wraps a looping clip to its duration', () => {
  assert.deepEqual(sampleMotion(motion, 2.5), { ParamAngleX: 5 });
});

test('rejects empty or invalid motion data', () => {
  assert.throws(() => sampleMotion({ duration: 0, tracks: {} }, 0), /duration/);
});

test('blends Animator state parameter values during a crossfade', () => {
  const values = blendMotionValues(
    { ParamAngleX: -1, ParamAngleY: 0.2 },
    { ParamAngleX: 1, ParamAngleY: 0.8 },
    0.25,
  );
  assert.ok(Math.abs(values.ParamAngleX + 0.5) < 1e-9);
  assert.ok(Math.abs(values.ParamAngleY - 0.35) < 1e-9);
});
