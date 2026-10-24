import { clampTime, locateTime } from './timeline.js';

export function audioTimeToTimeline(audioTime, audioDuration, timelineDuration) {
  if (!(audioDuration > 0) || !(timelineDuration > 0)) return 0;
  return clampTime(audioTime, audioDuration) / audioDuration * timelineDuration;
}

export function timelineTimeToAudio(timelineTime, timelineDuration, audioDuration) {
  if (!(timelineDuration > 0) || !(audioDuration > 0)) return 0;
  return clampTime(timelineTime, timelineDuration) / timelineDuration * audioDuration;
}

export function locateAudioTime(timeline, audioTime, audioDuration, sceneMode, sceneIndex) {
  const wholeDuration = timeline.at(-1)?.end ?? 0;
  if (sceneMode) {
    const selected = timeline[sceneIndex] ?? timeline[0];
    const local = audioTimeToTimeline(audioTime, audioDuration, selected?.duration ?? 0);
    return { index: sceneIndex, elapsed: local };
  }
  return locateTime(timeline, audioTimeToTimeline(audioTime, audioDuration, wholeDuration));
}
