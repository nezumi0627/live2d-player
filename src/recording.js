export function canRecordCanvas(canvas, Recorder = globalThis.MediaRecorder) {
  return typeof canvas?.captureStream === 'function' && typeof Recorder === 'function';
}
