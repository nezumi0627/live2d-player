export function buildStoryTimeline(events) {
  let cursor = 0;
  const voiceCues = [];
  const motionTriggers = [];
  const backgroundVoiceCues = [];

  for (const event of events) {
    if (event.type === 'voice') {
      const duration = positiveDuration(event.durationSeconds);
      voiceCues.push({ cueId: event.cueId, start: cursor, end: cursor + duration });
      cursor += duration + positiveDuration(event.afterSeconds);
    } else if (event.type === 'wait' || event.type === 'reading') {
      cursor += positiveDuration(event.durationSeconds);
    } else if (event.type === 'motion') {
      motionTriggers.push({
        name: event.name,
        at: cursor + positiveDuration(event.delaySeconds),
      });
    } else if (event.type === 'bgvPlay') {
      backgroundVoiceCues.push({
        cueId: event.cueId,
        tag: event.tag,
        start: cursor,
        stopAt: null,
        stopFadeSeconds: 0,
        loop: Boolean(event.loop),
      });
    } else if (event.type === 'bgvStop') {
      const cue = [...backgroundVoiceCues].reverse().find((item) => item.tag === event.tag && item.stopAt === null);
      if (cue) {
        cue.stopAt = cursor;
        cue.stopFadeSeconds = positiveDuration(event.fadeSeconds);
      }
    }
  }

  return { voiceCues, motionTriggers, backgroundVoiceCues, duration: cursor };
}

export function sampleStoryVisual(timeline, clipDurations, time, controller = {}) {
  const currentTime = Math.max(0, Number.isFinite(time) ? time : 0);
  const triggers = timeline.motionTriggers.filter((trigger) => trigger.at <= currentTime);
  const last = triggers.at(-1);
  if (!last) {
    const clip = 'scene01_loop';
    const duration = clipDurations[clip] ?? 0;
    return { clip, elapsed: duration > 0 ? currentTime % duration : 0 };
  }

  const transition = last.name.toLowerCase();
  const transitionDuration = clipDurations[transition] ?? 0;
  const sinceTrigger = currentTime - last.at;
  const previousTrigger = triggers.at(-2);
  const previousLoop = previousTrigger ? `${previousTrigger.name.toLowerCase()}_loop` : 'scene01_loop';
  const previousLoopDuration = clipDurations[previousLoop] ?? 0;
  const previousLoopStart = previousTrigger
    ? previousTrigger.at + (clipDurations[previousTrigger.name.toLowerCase()] ?? 0) * (controller.scenes?.[previousTrigger.name.toLowerCase()]?.exitTime ?? 1)
    : 0;
  const previousLoopAtTrigger = previousLoopDuration > 0
    ? positiveModulo(last.at - previousLoopStart, previousLoopDuration)
    : 0;
  const triggerBlendDuration = positiveDuration(controller.sceneTriggerBlendSeconds);

  if (sinceTrigger < triggerBlendDuration && previousLoopDuration > 0) {
    return {
      clip: transition,
      elapsed: sinceTrigger,
      blend: {
        fromClip: previousLoop,
        fromElapsed: positiveModulo(previousLoopAtTrigger + sinceTrigger, previousLoopDuration),
        toClip: transition,
        toElapsed: sinceTrigger,
        weight: sinceTrigger / triggerBlendDuration,
      },
    };
  }

  const loop = `${transition}_loop`;
  const loopDuration = clipDurations[loop] ?? 0;
  const sceneTransition = controller.scenes?.[transition] ?? {};
  const loopStart = transitionDuration * clamp01(sceneTransition.exitTime ?? 1);
  const loopBlendDuration = positiveDuration(sceneTransition.loopBlendSeconds);
  const loopElapsed = sinceTrigger - loopStart;
  if (loopDuration > 0 && loopElapsed >= 0 && loopElapsed + 1e-9 < loopBlendDuration) {
    return {
      clip: transition,
      elapsed: sinceTrigger,
      blend: {
        fromClip: transition,
        fromElapsed: sinceTrigger,
        toClip: loop,
        toElapsed: loopElapsed,
        weight: loopElapsed / loopBlendDuration,
      },
    };
  }

  return {
    clip: loopDuration > 0 ? loop : transition,
    elapsed: loopDuration > 0 ? positiveModulo(loopElapsed, loopDuration) : transitionDuration,
  };
}

export function locateStoryVoice(timeline, time) {
  return timeline.voiceCues.find((cue) => cue.start <= time && time < cue.end) ?? null;
}

export function nextStoryLoopTime(timeline, clipDurations, controller, time) {
  const triggers = timeline.motionTriggers ?? [];
  const trigger = triggers.find((item) => item.at > time + 1e-6) ?? triggers[0];
  if (!trigger) return 0;

  const transition = trigger.name.toLowerCase();
  const loopDuration = positiveDuration(clipDurations[`${transition}_loop`]);
  if (!loopDuration) return trigger.at;

  const transitionDuration = positiveDuration(clipDurations[transition]);
  const scene = controller.scenes?.[transition] ?? {};
  const transitionExit = transitionDuration * clamp01(scene.exitTime ?? 1);
  const loopBlendDuration = positiveDuration(scene.loopBlendSeconds);
  const entranceBlendDuration = positiveDuration(controller.sceneTriggerBlendSeconds);
  // Step just past the authored boundary so float rounding cannot leave one blend frame visible.
  return trigger.at + Math.max(entranceBlendDuration, transitionExit + loopBlendDuration) + 0.01;
}

export function locateStoryBackgroundVoice(timeline, time) {
  const currentTime = Math.max(0, Number.isFinite(time) ? time : 0);
  const cue = [...(timeline.backgroundVoiceCues ?? [])].reverse().find((item) => item.start <= currentTime);
  if (!cue || (cue.stopAt !== null && currentTime >= cue.stopAt + cue.stopFadeSeconds)) return null;

  const volume = cue.stopAt === null || cue.stopFadeSeconds === 0
    ? 1
    : clamp01(1 - (currentTime - cue.stopAt) / cue.stopFadeSeconds);
  return { ...cue, elapsed: currentTime - cue.start, volume };
}

function positiveDuration(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
