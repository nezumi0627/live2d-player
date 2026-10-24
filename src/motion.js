export function sampleMotion(motion, elapsedSeconds) {
  if (!Number.isFinite(motion?.duration) || motion.duration <= 0) {
    throw new Error('motion duration must be a positive finite number');
  }
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error('elapsed time must be a non-negative finite number');
  }

  const time = motion.loop
    ? elapsedSeconds % motion.duration
    : Math.min(elapsedSeconds, motion.duration);
  const values = {};

  for (const [id, points] of Object.entries(motion.tracks ?? {})) {
    if (!points.length) continue;
    let right = points.findIndex(([pointTime]) => pointTime >= time);
    if (right < 0) right = points.length - 1;
    if (right === 0) {
      values[id] = points[0][1];
      continue;
    }
    const [leftTime, leftValue] = points[right - 1];
    const [rightTime, rightValue] = points[right];
    const fraction = rightTime === leftTime ? 0 : (time - leftTime) / (rightTime - leftTime);
    values[id] = leftValue + (rightValue - leftValue) * fraction;
  }
  return values;
}

export function blendMotionValues(from, to, weight) {
  const amount = Math.max(0, Math.min(1, Number.isFinite(weight) ? weight : 0));
  const values = {};
  for (const id of new Set([...Object.keys(from ?? {}), ...Object.keys(to ?? {})])) {
    const fromValue = from?.[id] ?? to?.[id] ?? 0;
    const toValue = to?.[id] ?? from?.[id] ?? 0;
    values[id] = fromValue + (toValue - fromValue) * amount;
  }
  return values;
}
