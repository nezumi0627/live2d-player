export async function createCubism5Player(canvas, settingUrl, progress = () => {}) {
  const [{ CubismFramework }, { CubismUserModel }, { CubismMatrix44 }] = await Promise.all([
    import('./cubism/live2dcubismframework.ts'),
    import('./cubism/model/cubismusermodel.ts'),
    import('./cubism/math/cubismmatrix44.ts'),
  ]);
  progress('モデル設定を読み込み中');
  const setting = await fetch(settingUrl).then((response) => {
    if (!response.ok) throw new Error(`モデル設定を読み込めません (${response.status})`);
    return response.json();
  });
  const directory = settingUrl.slice(0, settingUrl.lastIndexOf('/') + 1);
  const loadBytes = async (path) => {
    const response = await fetch(directory + path);
    if (!response.ok) throw new Error(`モデル素材を読み込めません: ${path}`);
    return response.arrayBuffer();
  };
  if (!CubismFramework.isStarted()) CubismFramework.startUp();
  progress('Cubism 5を初期化中');
  CubismFramework.initialize();

  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) throw new Error('WebGLを初期化できませんでした');
  const userModel = new CubismUserModel();
  userModel.loadModel(await loadBytes(setting.FileReferences.Moc));
  const model = userModel.getModel();
  userModel.createRenderer(canvas.width, canvas.height, 2);
  const renderer = userModel.getRenderer();
  progress('Cubism 5シェーダーを準備中');
  renderer.startUp(gl);
  renderer.loadShaders('/vendor/cubism-shaders/');
  renderer.setIsPremultipliedAlpha(true);

  await Promise.all(setting.FileReferences.Textures.map(async (path, index) => {
    progress(`テクスチャを読み込み中 (${index + 1}/${setting.FileReferences.Textures.length})`);
    const image = new Image();
    image.src = directory + path;
    await image.decode();
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    renderer.bindTexture(index, texture);
  }));

  const projection = new CubismMatrix44();
  const matrix = new CubismMatrix44();

  const fit = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    renderer.setRenderTargetSize(canvas.width, canvas.height);
    const ratio = rect.width / rect.height;
    projection.loadIdentity();
    // Match the original game scene panel and preserve its framing at each viewport size.
    projection.scale(0.65 / ratio, 0.65);
  };
  fit();

  return {
    model,
    fit,
    update(deltaMS, parameters) {
      if (parameters) {
        for (const [id, value] of Object.entries(parameters)) {
          model.setParameterValueById(CubismFramework.getIdManager().getId(id), value);
        }
      }
      model.update();
      matrix.setMatrix(projection.getArray());
      matrix.multiplyByMatrix(userModel.getModelMatrix());
      renderer.setMvpMatrix(matrix);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      renderer.drawModel('/vendor/cubism-shaders/');
    },
  };
}
