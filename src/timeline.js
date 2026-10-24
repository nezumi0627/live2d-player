export function createTimeline(sequence, clips) {
  let cursor = 0;
  return sequence.map((name) => {
    const duration = clips[name]?.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`invalid duration for ${name}`);
    const range = { clip: name, start: cursor, end: cursor + duration, duration };
    cursor += duration;
    return range;
  });
}

export function locateTime(timeline, time) {
  if (!timeline.length) return { index: 0, elapsed: 0, time: 0 };
  const total = timeline.at(-1).end;
  const clamped = clampTime(time, total);
  const foundIndex = timeline.findIndex((range) => clamped < range.end);
  const index = foundIndex < 0 ? timeline.length - 1 : foundIndex;
  return { index, elapsed: clamped - timeline[index].start, time: clamped };
}

export function clampTime(time, duration) {
  return Math.max(0, Math.min(Number.isFinite(time) ? time : 0, duration));
}

export function advancePlayback(timeline, index, elapsed, delta, mode) {
  if (!timeline.length) return { index: 0, elapsed: 0, ended: true };
  const currentIndex = Math.max(0, Math.min(index, timeline.length - 1));
  const step = Math.max(0, Number.isFinite(delta) ? delta : 0);
  const current = timeline[currentIndex];
  const nextElapsed = Math.max(0, elapsed) + step;

  if (mode.startsWith('scene-')) {
    if (mode === 'scene-loop') return { index: currentIndex, elapsed: nextElapsed % current.duration, ended: false };
    return nextElapsed >= current.duration
      ? { index: currentIndex, elapsed: current.duration, ended: true }
      : { index: currentIndex, elapsed: nextElapsed, ended: false };
  }

  const total = timeline.at(-1).end;
  const nextTime = current.start + nextElapsed;
  if (mode === 'all-loop') {
    const position = locateTime(timeline, nextTime % total);
    return { index: position.index, elapsed: position.elapsed, ended: false };
  }

  if (nextTime >= total) {
    return { index: timeline.length - 1, elapsed: timeline.at(-1).duration, ended: true };
  }
  const position = locateTime(timeline, nextTime);
  return { index: position.index, elapsed: position.elapsed, ended: false };
}
