# Live2D Player

A lightweight, local-first browser player for Live2D motion sequences. Preview authored motion data, synchronize audio, step through scenes, and record the canvas as WebM without launching Unity.

This repository contains the player source, tests, and separately licensed Cubism Framework code. It does not include game-derived character models, textures, artwork, motion exports, voices, scripts, or other game-specific assets. Add only materials that you own or are licensed to use.

## Requirements

- Node.js 20 or newer
- A modern browser with WebGL
- Live2D Cubism Core obtained under the applicable Live2D license
- Your own compatible Live2D model, motion sequence, and optional audio files

Cubism Core is intentionally not included. Place the licensed `live2dcubismcore.js` in `public/vendor/` locally; this path is ignored by Git. The Cubism Framework source included in this repository is covered by the Live2D Open Software License; see [`src/cubism/LICENSE.md`](src/cubism/LICENSE.md).

## Local asset layout

The player expects locally supplied files in the following layout. These paths are ignored by Git.

```text
public/
  assets/
    character/
      model3.json
      *.moc3
      *.png
      scene-voice/
        scene-voice-manifest.json
        *.mp4
      background-voice/
        background-voice-manifest.json
        *.mp4
    scenes/sequence.json
  data/
    story-timing.json
    animation-controller.json
  vendor/live2dcubismcore.js
```

See the manifest fields used by the player in `src/player.js` and `src/story-timeline.js`. All assets stay local; the player does not fetch character or story content from a remote service.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The player needs the local assets above before it can render a model.

## Checks

```sh
npm test
npm run build
```

## License

No project-wide license is granted yet. Live2D Cubism Framework files retain their separate license and notices. Do not assume this repository grants rights to any user-supplied assets.
