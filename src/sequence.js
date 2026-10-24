const sceneOrder = [
  'scene01_loop',
  ...Array.from({ length: 7 }, (_, index) => [`scene${String(index + 2).padStart(2, '0')}`, `scene${String(index + 2).padStart(2, '0')}_loop`]).flat(),
];

export function getSceneSequence(availableClips) {
  const available = new Set(availableClips);
  return sceneOrder.filter((clip) => available.has(clip));
}
