import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoryTimeline, locateStoryBackgroundVoice, locateStoryVoice, nextStoryLoopTime, sampleStoryVisual } from '../src/story-timeline.js';

test('manual scene advance jumps past the transition into the next scene loop', () => {
  const timeline = { motionTriggers: [{ name: 'Scene02', at: 2 }, { name: 'Scene03', at: 5 }] };
  const durations = { scene02: 2, scene02_loop: 4, scene03: 3, scene03_loop: 5 };
  const controller = {
    sceneTriggerBlendSeconds: 0.5,
    scenes: { scene02: { exitTime: 0.5, loopBlendSeconds: 0.4 }, scene03: { exitTime: 0.8, loopBlendSeconds: 0.2 } },
  };
  assert.ok(Math.abs(nextStoryLoopTime(timeline, durations, controller, 0) - 3.41) < 1e-9);
  assert.ok(Math.abs(nextStoryLoopTime(timeline, durations, controller, 3.41) - 7.61) < 1e-9);
  assert.ok(Math.abs(nextStoryLoopTime(timeline, durations, controller, 7.61) - 3.41) < 1e-9);
  assert.equal(sampleStoryVisual(timeline, durations, 3.41, controller).clip, 'scene02_loop');
  assert.equal(sampleStoryVisual(timeline, durations, 7.61, controller).clip, 'scene03_loop');
});
test('motion triggers follow each voice duration and explicit waits', () => {
  const timeline = buildStoryTimeline([
    { type: 'voice', cueId: 'voice-a', durationSeconds: 2, afterSeconds: 0.15 },
    { type: 'wait', durationSeconds: 0.2 },
    { type: 'motion', name: 'Scene02' },
    { type: 'voice', cueId: 'voice-b', durationSeconds: 4, afterSeconds: 0.15 },
    { type: 'motion', name: 'Scene03', delaySeconds: 5 },
  ]);

  assert.deepEqual(timeline.voiceCues, [
    { cueId: 'voice-a', start: 0, end: 2 },
    { cueId: 'voice-b', start: 2.35, end: 6.35 },
  ]);
  assert.deepEqual(timeline.motionTriggers, [
    { name: 'Scene02', at: 2.35 },
    { name: 'Scene03', at: 11.5 },
  ]);
  assert.equal(timeline.duration, 6.5);
});

test('script motion changes from its transition clip to the matching loop', () => {
  const timeline = {
    motionTriggers: [
      { name: 'Scene02', at: 5 },
      { name: 'Scene03', at: 15 },
    ],
  };
  const durations = { scene01_loop: 3, scene02: 0.8, scene02_loop: 4 };
  const controller = {
    sceneTriggerBlendSeconds: 0.5,
    scenes: { scene02: { exitTime: 0.5, loopBlendSeconds: 0.4 } },
  };

  assert.deepEqual(sampleStoryVisual(timeline, durations, 4, controller), {
    clip: 'scene01_loop', elapsed: 1,
  });
  assert.deepEqual(sampleStoryVisual(timeline, durations, 5.25, controller), {
    clip: 'scene02', elapsed: 0.25,
    blend: {
      fromClip: 'scene01_loop', fromElapsed: 2.25,
      toClip: 'scene02', toElapsed: 0.25, weight: 0.5,
    },
  });
  const introToLoop = sampleStoryVisual(timeline, durations, 5.6, controller);
  assert.equal(introToLoop.clip, 'scene02');
  assert.equal(introToLoop.blend.fromClip, 'scene02');
  assert.equal(introToLoop.blend.toClip, 'scene02_loop');
  assert.ok(Math.abs(introToLoop.elapsed - 0.6) < 1e-9);
  assert.ok(Math.abs(introToLoop.blend.toElapsed - 0.2) < 1e-9);
  assert.ok(Math.abs(introToLoop.blend.weight - 0.5) < 1e-9);
  const loop = sampleStoryVisual(timeline, durations, 5.8, controller);
  assert.equal(loop.clip, 'scene02_loop');
  assert.ok(Math.abs(loop.elapsed - 0.4) < 1e-9);
  const nextScene = sampleStoryVisual(timeline, durations, 15.25, controller);
  assert.equal(nextScene.clip, 'scene03');
  assert.equal(nextScene.blend.fromClip, 'scene02_loop');
  assert.equal(nextScene.blend.toClip, 'scene03');
  assert.ok(Math.abs(nextScene.blend.fromElapsed - 1.85) < 1e-9);
  assert.equal(nextScene.blend.weight, 0.5);
});

test('voice lookup returns only the cue active at the script time', () => {
  const timeline = buildStoryTimeline([
    { type: 'voice', cueId: 'voice-a', durationSeconds: 2, afterSeconds: 0.15 },
    { type: 'wait', durationSeconds: 0.2 },
    { type: 'voice', cueId: 'voice-b', durationSeconds: 3 },
  ]);

  assert.deepEqual(locateStoryVoice(timeline, 1.25), { cueId: 'voice-a', start: 0, end: 2 });
  assert.equal(locateStoryVoice(timeline, 2.1), null);
  assert.deepEqual(locateStoryVoice(timeline, 2.5), { cueId: 'voice-b', start: 2.35, end: 5.35 });
});

test('background voice follows command time, fades on tagged stop, and does not inherit async motion delay', () => {
  const timeline = buildStoryTimeline([
    { type: 'voice', cueId: 'line-a', durationSeconds: 2, afterSeconds: 0.15 },
    { type: 'bgvPlay', cueId: 'bgv-a', tag: 'bgvtag2_7', loop: true },
    { type: 'motion', name: 'Scene07', delaySeconds: 5 },
    { type: 'wait', durationSeconds: 3 },
    { type: 'bgvStop', tag: 'bgvtag2_7', fadeSeconds: 0.2 },
    { type: 'wait', durationSeconds: 0.2 },
  ]);

  assert.deepEqual(timeline.backgroundVoiceCues, [
    { cueId: 'bgv-a', tag: 'bgvtag2_7', start: 2.15, stopAt: 5.15, stopFadeSeconds: 0.2, loop: true },
  ]);
  assert.deepEqual(timeline.motionTriggers, [{ name: 'Scene07', at: 7.15 }]);
  assert.deepEqual(locateStoryBackgroundVoice(timeline, 4), {
    cueId: 'bgv-a', tag: 'bgvtag2_7', start: 2.15, stopAt: 5.15, stopFadeSeconds: 0.2, loop: true, elapsed: 1.85, volume: 1,
  });
  assert.ok(Math.abs(locateStoryBackgroundVoice(timeline, 5.25).volume - 0.5) < 1e-9);
  assert.equal(locateStoryBackgroundVoice(timeline, 5.36), null);
  assert.ok(Math.abs(timeline.duration - 5.35) < 1e-9);
});
