import './player.css';
import { createCubism5Player } from './cubism-player.js';
import { blendMotionValues, sampleMotion } from './motion.js';
import { locateAudioTime } from './audio-sync.js';
import { buildStoryTimeline, locateStoryBackgroundVoice, nextStoryLoopTime, sampleStoryVisual } from './story-timeline.js';
import { canRecordCanvas } from './recording.js';
import { getSceneSequence } from './sequence.js';
import { advancePlayback, clampTime, createTimeline, locateTime } from './timeline.js';

const canvas = document.querySelector('#scene');
const status = document.querySelector('#status');
const playButton = document.querySelector('#play');
const recordButton = document.querySelector('#record');
const backButton = document.querySelector('#back');
const forwardButton = document.querySelector('#forward');
const nextSceneButton = document.querySelector('#next-scene');
const progress = document.querySelector('#timeline');
const currentTimeLabel = document.querySelector('#current-time');
const durationLabel = document.querySelector('#duration-time');
const modeSelect = document.querySelector('#play-mode');
const sceneSelect = document.querySelector('#scene-select');
const voiceSelect = document.querySelector('#voice-select');
const voiceAudio = document.querySelector('#voice-audio');
const backgroundVoiceAudio = document.querySelector('#background-voice-audio');
const stage = document.querySelector('.stage');
const expandButton = document.querySelector('#expand');
const hint = document.querySelector('#hint');
const sceneCounter = document.querySelector('#scene-counter');

function showError(message) {
  status.textContent = message;
  for (const control of [playButton, recordButton, backButton, forwardButton, nextSceneButton, progress, modeSelect, sceneSelect, voiceSelect]) control.disabled = true;
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

async function start() {
  status.textContent = 'Cubism Coreを読み込み中…';
  try {
    const coreFile = '/vendor/live2dcubismcore.js';
    if (!window.Live2DCubismCore) {
      const coreResponse = await fetch(coreFile, { method: 'HEAD' });
      if (!coreResponse.ok) throw new Error('Cubism Coreがありません。公式SDKのCore/live2dcubismcore.jsをpublic/vendorへ置いてください。');
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = coreFile;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Cubism Coreを読み込めませんでした。SDKのlive2dcubismcore.jsを確認してください。'));
        document.head.append(script);
      });
      if (!window.Live2DCubismCore) throw new Error('Cubism Coreの初期化に失敗しました。SDKのバージョンを確認してください。');
    }

    const sequenceResponse = await fetch('/assets/scenes/sequence.json');
    if (!sequenceResponse.ok) throw new Error('シーン連続再生データがありません。素材を再準備してください。');
    const sequenceData = await sequenceResponse.json();
    const sequence = getSceneSequence(Object.keys(sequenceData.clips));
    if (!sequence.length) throw new Error('再生できるシーン演技データがありません。');
    const timeline = createTimeline(sequence, sequenceData.clips);
    const totalDuration = timeline.at(-1).end;

    const storyTimingResponse = await fetch('/data/story-timing.json');
    if (!storyTimingResponse.ok) throw new Error('台本タイミングデータがありません。素材を再準備してください。');
    const storyTimingData = await storyTimingResponse.json();
    const storyTimeline = buildStoryTimeline(storyTimingData.events);
    const animationControllerResponse = await fetch('/data/animation-controller.json');
    if (!animationControllerResponse.ok) throw new Error('Sceneアニメーター設定がありません。素材を再準備してください。');
    const animationController = await animationControllerResponse.json();
    const clipDurations = Object.fromEntries(Object.entries(sequenceData.clips).map(([name, clip]) => [name, clip.duration]));

    const voiceManifestResponse = await fetch('/assets/character/scene-voice/scene-voice-manifest.json');
    let voiceCues = [];
    if (voiceManifestResponse.ok) {
      const voiceManifest = await voiceManifestResponse.json();
      voiceCues = voiceManifest.cues;
      voiceManifest.cues.forEach((cue, index) => {
        const option = document.createElement('option');
        option.value = cue.file;
        option.textContent = `${String(index + 1).padStart(2, '0')}/${voiceManifest.cues.length} ${cue.cueId} · ${formatTime(cue.durationSeconds)}`;
        voiceSelect.append(option);
      });
      const silentOption = document.createElement('option');
      silentOption.value = '';
      silentOption.textContent = '音声なし';
      voiceSelect.append(silentOption);
      voiceSelect.value = voiceManifest.cues[0]?.file ?? '';
      voiceSelect.disabled = voiceManifest.cues.length === 0;
    } else {
      voiceSelect.disabled = true;
      hint.textContent = '演技音声がありません。素材を再準備してください';
    }

    const backgroundVoiceManifestResponse = await fetch('/assets/character/background-voice/background-voice-manifest.json');
    if (!backgroundVoiceManifestResponse.ok) throw new Error('Scene側BGV音声がありません。素材を再準備してください。');
    const backgroundVoiceManifest = await backgroundVoiceManifestResponse.json();
    const backgroundVoiceCuesById = new Map(backgroundVoiceManifest.cues.map((cue) => [cue.cueId, cue]));

    status.textContent = 'モデル設定を準備中…';
    const player = await createCubism5Player(canvas, '/assets/character/model3.json', (message) => { status.textContent = message; });
    const { model, fit } = player;
    window.addEventListener('resize', fit);
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(canvas.parentElement);

    let playing = false;
    let clipIndex = 0;
    let selectedSceneIndex = 0;
    let clipElapsed = 0;
    let ended = false;
    let previousFrame = performance.now();
    let audioContext;
    let audioSource;
    let backgroundVoiceAudioSource;
    let recordingAudio;
    let connectedVoiceFile = '';
    let selectedVoiceDuration = 0;
    let storyTime = 0;
    let storyBlend = null;
    let activeStoryBgvCueId = '';
    let storyBgvRequest = 0;
    let storyBgvLoading = false;

    function isSceneMode() { return modeSelect.value.startsWith('scene-'); }
    function isStoryMode() { return modeSelect.value.startsWith('story-'); }
    function activeDuration() {
      if (isStoryMode()) return storyTimeline.duration;
      return voiceSelect.value && selectedVoiceDuration > 0 ? selectedVoiceDuration : (isSceneMode() ? timeline[clipIndex].duration : totalDuration);
    }
    function activeTime() {
      if (isStoryMode()) return storyTime;
      if (voiceSelect.value && selectedVoiceDuration > 0) return voiceAudio.currentTime;
      return isSceneMode() ? clipElapsed : timeline[clipIndex].start + clipElapsed;
    }
    function refreshTimeline() {
      const duration = activeDuration();
      progress.max = String(duration);
      progress.value = String(Math.min(activeTime(), duration));
      currentTimeLabel.textContent = formatTime(activeTime());
      durationLabel.textContent = formatTime(duration);
      sceneCounter.textContent = `再生中 ${clipIndex + 1}/${sequence.length}`;
      if (isStoryMode()) sceneSelect.value = String(clipIndex);
      const clip = sequenceData.clips[sequence[clipIndex]];
      hint.textContent = isStoryMode()
        ? `台本同期　${clip.clip.replace('_loop', '（ループ）')}`
        : `${clipIndex + 1}/${sequence.length}　${clip.clip}`;
    }
    function stopVoice() {
      voiceAudio.pause();
      voiceAudio.currentTime = 0;
      backgroundVoiceAudio.pause();
      backgroundVoiceAudio.currentTime = 0;
      backgroundVoiceAudio.volume = 1;
      activeStoryBgvCueId = '';
      storyBgvRequest += 1;
      storyBgvLoading = false;
    }
    function seekTo(time) {
      const target = clampTime(time, activeDuration());
      if (isStoryMode()) {
        storyTime = target;
        applyStoryVisual();
        void syncStoryBackgroundVoice();
      } else if (voiceSelect.value && selectedVoiceDuration > 0) {
        voiceAudio.currentTime = target;
        ({ index: clipIndex, elapsed: clipElapsed } = locateAudioTime(timeline, target, selectedVoiceDuration, isSceneMode(), selectedSceneIndex));
      } else if (isSceneMode()) clipElapsed = target;
      else ({ index: clipIndex, elapsed: clipElapsed } = locateTime(timeline, target));
      ended = false;
      refreshTimeline();
    }
    function loadSelectedVoice() {
      connectedVoiceFile = voiceSelect.value;
      selectedVoiceDuration = 0;
      if (!connectedVoiceFile) {
        voiceAudio.pause();
        voiceAudio.removeAttribute('src');
        voiceAudio.load();
        return;
      }
      voiceAudio.src = `/assets/character/scene-voice/${encodeURIComponent(connectedVoiceFile)}`;
      voiceAudio.load();
    }
    function applyStoryVisual() {
      const visual = sampleStoryVisual(storyTimeline, clipDurations, storyTime, animationController);
      const foundIndex = sequence.indexOf(visual.clip);
      clipIndex = foundIndex < 0 ? 0 : foundIndex;
      clipElapsed = visual.elapsed;
      storyBlend = visual.blend ?? null;
    }
    async function syncStoryBackgroundVoice() {
      const cueEvent = locateStoryBackgroundVoice(storyTimeline, storyTime);
      const cue = cueEvent ? backgroundVoiceCuesById.get(cueEvent.cueId) : null;
      if (!cueEvent || !cue) {
        if (activeStoryBgvCueId) {
          storyBgvRequest += 1;
          activeStoryBgvCueId = '';
          storyBgvLoading = false;
          backgroundVoiceAudio.pause();
          backgroundVoiceAudio.currentTime = 0;
          backgroundVoiceAudio.volume = 1;
        }
        return;
      }

      const offset = cueEvent.loop
        ? cueEvent.elapsed % cue.durationSeconds
        : clampTime(cueEvent.elapsed, cue.durationSeconds);
      if (activeStoryBgvCueId !== cue.cueId) {
        const request = ++storyBgvRequest;
        activeStoryBgvCueId = cue.cueId;
        storyBgvLoading = true;
        backgroundVoiceAudio.pause();
        backgroundVoiceAudio.src = `/assets/character/background-voice/${encodeURIComponent(cue.file)}`;
        backgroundVoiceAudio.load();
        try {
          if (backgroundVoiceAudio.readyState < HTMLMediaElement.HAVE_METADATA) {
            await new Promise((resolve, reject) => {
              const onLoaded = () => { cleanup(); resolve(); };
              const onError = () => { cleanup(); reject(new Error(`Scene側音声を読み込めません: ${cue.cueId}`)); };
              const cleanup = () => {
                backgroundVoiceAudio.removeEventListener('loadedmetadata', onLoaded);
                backgroundVoiceAudio.removeEventListener('error', onError);
              };
              backgroundVoiceAudio.addEventListener('loadedmetadata', onLoaded, { once: true });
              backgroundVoiceAudio.addEventListener('error', onError, { once: true });
            });
          }
          if (request !== storyBgvRequest) return;
          backgroundVoiceAudio.loop = cueEvent.loop;
          backgroundVoiceAudio.currentTime = offset;
          backgroundVoiceAudio.volume = cueEvent.volume;
          storyBgvLoading = false;
          if (playing) await backgroundVoiceAudio.play();
        } catch (error) {
          if (request === storyBgvRequest) {
            storyBgvLoading = false;
            status.textContent = error instanceof Error ? error.message : String(error);
          }
        }
        return;
      }

      if (backgroundVoiceAudio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        if (Math.abs(backgroundVoiceAudio.currentTime - offset) > 0.4 && !storyBgvLoading) backgroundVoiceAudio.currentTime = offset;
        backgroundVoiceAudio.volume = cueEvent.volume;
        if (playing && backgroundVoiceAudio.paused && !storyBgvLoading) void backgroundVoiceAudio.play();
        if (!playing && !backgroundVoiceAudio.paused) backgroundVoiceAudio.pause();
      }
    }
    async function ensureAudioGraph() {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('このブラウザーは音声付き録画に対応していません');
      audioContext ||= new Context();
      if (!audioSource) {
        audioSource = audioContext.createMediaElementSource(voiceAudio);
        audioSource.connect(audioContext.destination);
        recordingAudio = audioContext.createMediaStreamDestination();
        audioSource.connect(recordingAudio);
      }
      if (audioContext.state === 'suspended') await audioContext.resume();
    }
    async function ensureBackgroundVoiceAudioGraph() {
      await ensureAudioGraph();
      if (!backgroundVoiceAudioSource) {
        backgroundVoiceAudioSource = audioContext.createMediaElementSource(backgroundVoiceAudio);
        backgroundVoiceAudioSource.connect(audioContext.destination);
        backgroundVoiceAudioSource.connect(recordingAudio);
      }
    }
    async function syncVoice(restart = false) {
      if (isStoryMode()) {
        await syncStoryBackgroundVoice();
        return;
      }
      if (!voiceSelect.value) {
        voiceAudio.pause();
        return;
      }
      if (voiceSelect.value !== connectedVoiceFile) loadSelectedVoice();
      try {
        await ensureAudioGraph();
        if (restart && voiceAudio.readyState >= HTMLMediaElement.HAVE_METADATA) voiceAudio.currentTime = 0;
        voiceAudio.loop = false;
      if (playing) await voiceAudio.play();
        else voiceAudio.pause();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    }
    function updatePlayButton() { playButton.textContent = playing ? '一時停止' : (ended ? 'もう一度再生' : '再生'); }

    sequence.forEach((name, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${String(index + 1).padStart(2, '0')}　${name}`;
      sceneSelect.append(option);
    });

    function updateModeControls() {
      const scripted = isStoryMode();
      sceneSelect.disabled = scripted;
      voiceSelect.disabled = scripted || voiceCues.length === 0;
      nextSceneButton.disabled = !scripted;
      nextSceneButton.title = scripted ? '次の台本Scene切替位置へ移動します。ステージをタップしても進めます。' : '台本モードで使えます';
      if (scripted) voiceSelect.setAttribute('aria-description', '台本順に音声cueを自動再生します');
      else voiceSelect.removeAttribute('aria-description');
    }

    setInterval(() => {
      const now = performance.now();
      const elapsedMS = Math.max(0, now - previousFrame);
      const deltaMS = Math.min(elapsedMS, 250);
      previousFrame = now;
      if (playing && isStoryMode()) {
        if (!storyBgvLoading) storyTime += elapsedMS / 1000;
        if (storyTime >= storyTimeline.duration) {
          if (modeSelect.value === 'story-loop') {
            storyTime %= storyTimeline.duration;
            stopVoice();
          } else {
            storyTime = storyTimeline.duration;
            playing = false;
            ended = true;
            stopVoice();
          }
        }
        applyStoryVisual();
        void syncStoryBackgroundVoice();
      } else if (playing && voiceSelect.value && selectedVoiceDuration > 0 && Number.isFinite(voiceAudio.duration)) {
        const audioTime = voiceAudio.currentTime;
        ({ index: clipIndex, elapsed: clipElapsed } = locateAudioTime(timeline, audioTime, selectedVoiceDuration, isSceneMode(), selectedSceneIndex));
        if (voiceAudio.ended && !voiceAudio.loop) {
          ended = true;
          playing = false;
        }
      } else if (playing) {
        const next = advancePlayback(timeline, clipIndex, clipElapsed, deltaMS / 1000, modeSelect.value);
        clipIndex = next.index;
        clipElapsed = next.elapsed;
        if (next.ended) {
          ended = true;
          playing = false;
          voiceAudio.pause();
        }
      }
      const clip = sequenceData.clips[sequence[clipIndex]];
      const loopClip = isStoryMode() ? clip.clip.endsWith('_loop') : isSceneMode() && Boolean(voiceSelect.value);
      let motionValues = sampleMotion({ ...clip, loop: loopClip }, clipElapsed);
      if (isStoryMode() && storyBlend) {
        const fromMotion = sequenceData.clips[storyBlend.fromClip];
        const toMotion = sequenceData.clips[storyBlend.toClip];
        const fromValues = sampleMotion({ ...fromMotion, loop: storyBlend.fromClip.endsWith('_loop') }, storyBlend.fromElapsed);
        const toValues = sampleMotion({ ...toMotion, loop: storyBlend.toClip.endsWith('_loop') }, storyBlend.toElapsed);
        motionValues = blendMotionValues(fromValues, toValues, storyBlend.weight);
      }
      player.update(deltaMS, motionValues);
      refreshTimeline();
      updatePlayButton();
    }, 33);

    for (const control of [playButton, backButton, forwardButton, progress, modeSelect, sceneSelect]) control.disabled = false;
    updateModeControls();
    voiceAudio.addEventListener('loadedmetadata', () => {
      if (!isStoryMode()) selectedVoiceDuration = Number.isFinite(voiceAudio.duration) ? voiceAudio.duration : 0;
      refreshTimeline();
    });
    voiceAudio.addEventListener('ended', () => {
      if (voiceAudio.loop || isStoryMode()) return;
      playing = false;
      ended = true;
      clipIndex = isSceneMode() ? selectedSceneIndex : timeline.length - 1;
      clipElapsed = isSceneMode() ? timeline[clipIndex].duration : timeline[clipIndex].duration;
      refreshTimeline();
      updatePlayButton();
    });
    if (voiceSelect.value) loadSelectedVoice();
    playButton.addEventListener('click', async () => {
      const wasEnded = ended;
      if (!playing && ended) {
        seekTo(0);
        ended = false;
      }
      const starting = !playing;
      playing = !playing;
      updatePlayButton();
      if (isStoryMode() && playing) {
        try {
          await ensureAudioGraph();
          await ensureBackgroundVoiceAudioGraph();
          await syncStoryBackgroundVoice();
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : String(error);
        }
      } else {
        await syncVoice(starting && wasEnded);
      }
    });
    backButton.addEventListener('click', () => seekTo(activeTime() - 5));
    forwardButton.addEventListener('click', () => seekTo(activeTime() + 5));
    function advanceToNextScene() {
      if (!isStoryMode()) return;
      seekTo(nextStoryLoopTime(storyTimeline, clipDurations, animationController, storyTime));
    }
    nextSceneButton.addEventListener('click', advanceToNextScene);
    canvas.addEventListener('click', advanceToNextScene);
    progress.addEventListener('input', () => seekTo(Number(progress.value)));
    modeSelect.addEventListener('change', () => {
      playing = false;
      clipIndex = selectedSceneIndex;
      clipElapsed = 0;
      storyTime = 0;
      ended = false;
      stopVoice();
      if (isStoryMode()) applyStoryVisual();
      else {
        clipIndex = selectedSceneIndex;
        clipElapsed = 0;
      }
      voiceAudio.loop = false;
      updateModeControls();
      refreshTimeline();
      void syncVoice(true);
    });
    sceneSelect.addEventListener('change', () => {
      selectedSceneIndex = Number(sceneSelect.value);
      clipIndex = selectedSceneIndex;
      clipElapsed = 0;
      ended = false;
      playing = false;
      stopVoice();
      refreshTimeline();
      void syncVoice(true);
    });
    voiceSelect.addEventListener('change', () => { stopVoice(); void syncVoice(true); });
    expandButton.addEventListener('click', () => {
      const expanded = stage.classList.toggle('expanded');
      expandButton.textContent = expanded ? '戻す' : '拡大';
      expandButton.setAttribute('aria-label', expanded ? '画面拡大を戻す' : '画面を拡大');
      requestAnimationFrame(fit);
    });

    if (!canRecordCanvas(canvas)) {
      recordButton.disabled = true;
      hint.textContent = 'このブラウザーはCanvas録画に対応していません';
    } else {
      recordButton.disabled = false;
      let recorder;
      let chunks = [];
      let compositeFrame = 0;
      const compositeCanvas = document.createElement('canvas');
      const compositeContext = compositeCanvas.getContext('2d');
      const drawComposite = () => {
        if (recorder?.state !== 'recording') return;
        if (compositeCanvas.width !== canvas.width || compositeCanvas.height !== canvas.height) {
          compositeCanvas.width = canvas.width;
          compositeCanvas.height = canvas.height;
        }
        const width = compositeCanvas.width;
        const height = compositeCanvas.height;
        compositeContext.fillStyle = '#100e15';
        compositeContext.fillRect(0, 0, width, height);
        compositeContext.drawImage(canvas, 0, 0, width, height);
        compositeFrame = requestAnimationFrame(drawComposite);
      };
      recordButton.addEventListener('click', async () => {
        if (recorder?.state === 'recording') {
          recorder.stop();
          recordButton.textContent = '録画開始';
          return;
        }
        try {
          await ensureAudioGraph();
          if (isStoryMode()) await ensureBackgroundVoiceAudioGraph();
          const stream = compositeCanvas.captureStream(30);
          recordingAudio.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
          const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
          recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
          chunks = [];
          recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
          recorder.onstop = () => {
            cancelAnimationFrame(compositeFrame);
            const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'live2d-scene.webm';
            link.click();
            URL.revokeObjectURL(url);
            stream.getTracks().forEach((track) => track.stop());
          };
          recorder.start();
          drawComposite();
          recordButton.textContent = '録画停止';
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : String(error);
        }
      });
    }
    updateModeControls();
    applyStoryVisual();
    void syncStoryBackgroundVoice();
    refreshTimeline();
    updatePlayButton();
    status.textContent = '';
  } catch (error) {
    showError(`読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

start();
