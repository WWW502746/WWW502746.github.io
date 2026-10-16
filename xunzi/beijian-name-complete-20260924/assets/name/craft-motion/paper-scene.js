import * as THREE from './three.module.js';

const PAPER_WIDTH = 1.82;
const CLOSED_LENGTH = 0.92;
const OPEN_LENGTH = 4.45;
const PAPER_THICKNESS = 0.0012;
const COLUMNS = 12;
const ROWS = 72;
const ROLL_ROWS = 160;

function sheetGeometry() {
  const geometry = new THREE.BufferGeometry();
  const sideCount = (COLUMNS + 1) * (ROWS + 1);
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sideCount * 6), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(sideCount * 4), 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sideCount * 6), 3).setUsage(THREE.DynamicDrawUsage));
  const indices = [];
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const a = row * (COLUMNS + 1) + column;
      const b = a + COLUMNS + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
      indices.push(a + sideCount, a + 1 + sideCount, b + sideCount,
        a + 1 + sideCount, b + 1 + sideCount, b + sideCount);
    }
  }
  const connectEdge = (a, b) => indices.push(a, a + sideCount, b, b, a + sideCount, b + sideCount);
  for (let row = 0; row < ROWS; row++) {
    connectEdge(row * (COLUMNS + 1), (row + 1) * (COLUMNS + 1));
    connectEdge((row + 1) * (COLUMNS + 1) + COLUMNS, row * (COLUMNS + 1) + COLUMNS);
  }
  for (let column = 0; column < COLUMNS; column++) {
    connectEdge(column + 1, column);
    const last = ROWS * (COLUMNS + 1) + column;
    connectEdge(last, last + 1);
  }
  geometry.setIndex(indices);
  return geometry;
}

function rollGeometry() {
  const geometry = new THREE.BufferGeometry();
  const count = (COLUMNS + 1) * (ROLL_ROWS + 1);
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  const indices = [];
  for (let row = 0; row < ROLL_ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const a = row * (COLUMNS + 1) + column;
      const b = a + COLUMNS + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  geometry.setIndex(indices);
  return geometry;
}

export async function createPaperScene(canvas, { textureUrl, paperType = 'raw' } = {}) {
  const texture = await new THREE.TextureLoader().loadAsync(textureUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  const bumpTexture = texture.clone();
  bumpTexture.colorSpace = THREE.NoColorSpace;
  bumpTexture.needsUpdate = true;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (error) {
    texture.dispose();
    bumpTexture.dispose();
    throw error;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.3, 1.3, 2.8, -2.8, 0.1, 30);
  camera.position.set(0.55, 0.1, 10);
  camera.lookAt(0, -2.2, 0);
  camera.updateMatrixWorld();
  scene.add(new THREE.HemisphereLight(0xf5f5f0, 0x8c979a, 1.05));
  const keyLight = new THREE.DirectionalLight(0xfffef9, 1.65);
  keyLight.position.set(-3, 4, 5);
  keyLight.target.position.set(0, -2.1, 0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -2.3, right: 2.3, top: 1.2, bottom: -5.2, near: 0.1, far: 18 });
  keyLight.shadow.camera.updateProjectionMatrix();
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.002;
  scene.add(keyLight, keyLight.target);
  const fillLight = new THREE.DirectionalLight(0xf0f4f5, 0.6);
  fillLight.position.set(4, -0.5, 4);
  scene.add(fillLight);

  const paperTones = {
    raw: [0.32, 0.12, [0.86, 0.86, 0.83]], cotton: [0.28, 0.12, [0.75, 0.73, 0.67]],
    antique: [0.18, 0.18, [0.74, 0.73, 0.68]], cicada: [0.1, 0.28, [0.86, 0.87, 0.84]],
    coarse: [0.26, 0.23, [0.64, 0.62, 0.54]], cracked: [0.22, 0.16, [0.8, 0.79, 0.74]],
  };
  const [saturation, soften, tone] = paperTones[paperType] || paperTones.raw;
  const paperMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: texture, bumpMap: bumpTexture, bumpScale: 0.005,
    roughness: 0.94, metalness: 0, side: THREE.DoubleSide, vertexColors: true,
    transparent: paperType === 'cicada', opacity: paperType === 'cicada' ? 0.76 : 1,
  });
  // Match the restrained texture grading used by the approved rendered paper samples.
  paperMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      float paperGrey = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = mix(vec3(paperGrey), diffuseColor.rgb, ${saturation});
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${tone.join(',')}), ${soften});
      ${paperType === 'antique' ? 'diffuseColor.rgb *= vec3(0.74, 0.72, 0.675);' : ''}
    `);
  };
  paperMaterial.customProgramCacheKey = () => paperType;
  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x51453e, roughness: 0.87, metalness: 0 });
  const woodProfile = [
    new THREE.Vector2(0, -1.05), new THREE.Vector2(0.036, -1.05),
    new THREE.Vector2(0.044, -1.042), new THREE.Vector2(0.044, 1.042),
    new THREE.Vector2(0.036, 1.05), new THREE.Vector2(0, 1.05),
  ];
  const woodGeometry = new THREE.LatheGeometry(woodProfile, 48);
  const wood = new THREE.Mesh(woodGeometry, woodMaterial);
  wood.name = 'FixedThinTopWoodSpindle';
  wood.rotation.z = Math.PI / 2;
  wood.castShadow = false;
  scene.add(wood);
  const bodyGeometry = sheetGeometry();
  const headGeometry = rollGeometry();
  const body = new THREE.Mesh(bodyGeometry, paperMaterial);
  const head = new THREE.Mesh(headGeometry, paperMaterial);
  body.name = 'ContinuouslyFedThinPaper';
  head.name = 'LayeredTopPaperRoll';
  body.frustumCulled = head.frustumCulled = false;
  body.castShadow = false;
  body.receiveShadow = head.castShadow = true;
  head.receiveShadow = false;
  scene.add(body, head);

  let progress = 0;
  let flutter = 0;
  let stockLength = CLOSED_LENGTH;
  let width = 640;
  let height = 1408;
  let disposed = false;
  let finiteVertices = true;
  const point = new THREE.Vector3();
  const woodOrigin = new THREE.Vector3();

  function deform() {
    stockLength = CLOSED_LENGTH + (OPEN_LENGTH - CLOSED_LENGTH) * progress;
    const fedLength = stockLength - CLOSED_LENGTH;
    const rollRadius = 0.112 - 0.03 * progress;
    const curlRadius = 0.12 + 0.10 * Math.sin(Math.PI * progress);
    const curlAngle = 2.85 * (1 - progress) ** 0.45 + 0.08 * progress;
    const curlLength = curlRadius * curlAngle;
    const straightLength = stockLength - curlLength;
    const position = bodyGeometry.getAttribute('position');
    const uv = bodyGeometry.getAttribute('uv');
    const colors = bodyGeometry.getAttribute('color');
    const sideCount = (COLUMNS + 1) * (ROWS + 1);
    finiteVertices = true;
    for (let row = 0; row <= ROWS; row++) {
      const fraction = row / ROWS;
      const length = fraction * stockLength;
      const contactShade = 1 - 0.15 * Math.exp(-length / 0.12);
      const angle = Math.max(0, length - straightLength) / curlRadius;
      const y = length <= straightLength ? -length : -straightLength - curlRadius * Math.sin(angle);
      const z = -rollRadius + (length <= straightLength ? 0 : curlRadius * (1 - Math.cos(angle)));
      const normalY = Math.sin(angle);
      const normalZ = Math.cos(angle);
      const flutterWeight = fraction ** 5;
      for (let column = 0; column <= COLUMNS; column++) {
        const across = column / COLUMNS;
        const edgeWeight = Math.abs(across * 2 - 1) ** 12;
        const x = (across - 0.5) * PAPER_WIDTH + edgeWeight * 0.0014 * Math.sin(length * 23 + across * 9);
        const surfaceZ = z + 0.004 * Math.sin(across * Math.PI * 2 + length) * Math.min(1, length * 3)
          + 0.018 * flutter * flutterWeight;
        const surfaceY = y + 0.005 * flutter * flutterWeight;
        const index = row * (COLUMNS + 1) + column;
        position.setXYZ(index, x, surfaceY + normalY * PAPER_THICKNESS / 2, surfaceZ + normalZ * PAPER_THICKNESS / 2);
        position.setXYZ(index + sideCount, x, surfaceY - normalY * PAPER_THICKNESS / 2, surfaceZ - normalZ * PAPER_THICKNESS / 2);
        // Existing fibres travel downward as more stock is fed; their physical scale stays fixed.
        const physicalV = (length - fedLength) / PAPER_WIDTH;
        uv.setXY(index, across, physicalV);
        uv.setXY(index + sideCount, across, physicalV);
        colors.setXYZ(index, contactShade, contactShade, contactShade);
        colors.setXYZ(index + sideCount, contactShade, contactShade, contactShade);
        finiteVertices &&= Number.isFinite(x) && Number.isFinite(surfaceY) && Number.isFinite(surfaceZ);
      }
    }
    position.needsUpdate = uv.needsUpdate = colors.needsUpdate = true;
    bodyGeometry.computeVertexNormals();

    const headPosition = headGeometry.getAttribute('position');
    const headUV = headGeometry.getAttribute('uv');
    const totalAngle = Math.PI * 8;
    const totalArc = totalAngle * (0.046 + rollRadius) / 2;
    for (let row = 0; row <= ROLL_ROWS; row++) {
      const fraction = row / ROLL_ROWS;
      const angle = Math.PI + totalAngle * fraction;
      const radius = 0.046 + (rollRadius - 0.046) * fraction;
      const arc = totalAngle * (0.046 * fraction + (rollRadius - 0.046) * fraction ** 2 / 2);
      for (let column = 0; column <= COLUMNS; column++) {
        const across = column / COLUMNS;
        const index = row * (COLUMNS + 1) + column;
        headPosition.setXYZ(index, (across - 0.5) * PAPER_WIDTH, radius * Math.sin(angle), radius * Math.cos(angle));
        headUV.setXY(index, across, (arc - totalArc - fedLength) / PAPER_WIDTH);
      }
    }
    headPosition.needsUpdate = headUV.needsUpdate = true;
    headGeometry.computeVertexNormals();
  }

  function render(value, tailFlutter = 0) {
    if (disposed) return;
    progress = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
    flutter = Number.isFinite(tailFlutter) ? THREE.MathUtils.clamp(tailFlutter, -1, 1) : 0;
    deform();
    renderer.render(scene, camera);
  }

  function resize() {
    if (disposed) return;
    width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 640);
    height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1408);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const viewHeight = Math.max(4.96, 2.24 / aspect);
    camera.updateMatrixWorld();
    const anchorLocalY = point.copy(woodOrigin).applyMatrix4(camera.matrixWorldInverse).y;
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = anchorLocalY + viewHeight * 0.043;
    camera.bottom = camera.top - viewHeight;
    camera.updateProjectionMatrix();
    render(progress, flutter);
  }

  function metrics() {
    camera.updateMatrixWorld();
    point.copy(woodOrigin).project(camera);
    const woodAnchor = { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
    const paperBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const geometry of [bodyGeometry, headGeometry]) {
      const position = geometry.getAttribute('position');
      for (let index = 0; index < position.count; index++) {
        point.fromBufferAttribute(position, index).project(camera);
        const x = (point.x + 1) * width / 2;
        const y = (1 - point.y) * height / 2;
        paperBounds.minX = Math.min(paperBounds.minX, x);
        paperBounds.maxX = Math.max(paperBounds.maxX, x);
        paperBounds.minY = Math.min(paperBounds.minY, y);
        paperBounds.maxY = Math.max(paperBounds.maxY, y);
        finiteVertices &&= Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
      }
    }
    return { progress, stockLength, paperWidth: PAPER_WIDTH, woodAnchor, paperBounds, finiteVertices,
      canvasSize: { width, height }, paperThickness: PAPER_THICKNESS, pixelRatio: renderer.getPixelRatio() };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    bodyGeometry.dispose();
    headGeometry.dispose();
    woodGeometry.dispose();
    paperMaterial.dispose();
    woodMaterial.dispose();
    texture.dispose();
    bumpTexture.dispose();
    keyLight.shadow.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  resize();
  return { render, resize, metrics, dispose };
}
