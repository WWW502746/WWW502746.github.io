import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

document.querySelectorAll('[data-artifact-viewer]').forEach(initViewer);

function initViewer(host) {
const importedModel = Boolean(host.dataset.modelSrc);
const status = host.querySelector('.artifact-status');
const rotateButton = host.querySelector('[data-viewer-action="rotate"]');
window.lucide?.createIcons();

let started = false;
let visible = false;
let activated = false;
let renderer, camera, controls, scene;
let artwork;
let frame = 0;
let distance = 6;
let size = new THREE.Vector3(1.2, 2.43, .57);
const originals = new Map();
const target = new THREE.Vector3(0, 1.215, 0);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function fail(error) {
  console.error('Stele viewer:', error);
  host.dataset.state = 'error';
  host.setAttribute('aria-busy', 'false');
  status.textContent = '展品暂未载入';
  const retry = document.createElement('button');
  retry.textContent = '重新加载';
  retry.style.marginLeft = '12px';
  retry.addEventListener('click', () => location.reload());
  status.append(retry);
}

function renderFrame() {
  if (!activated || !visible || document.hidden || !renderer) { frame = 0; return; }
  const moved = controls.update();
  renderer.render(scene, camera);
  frame = controls.autoRotate || moved ? requestAnimationFrame(renderFrame) : 0;
}

function wake() {
  if (!frame && activated && visible && !document.hidden) frame = requestAnimationFrame(renderFrame);
}

function resize() {
  if (!renderer || !host.clientWidth || !host.clientHeight) return;
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const framing = camera.aspect < 1 ? host.dataset.mobileCameraFit || host.dataset.cameraFit : host.dataset.cameraFit;
  const next = Math.max(size.y / (2 * Math.tan(halfFov)), size.x * 1.4 / (2 * Math.tan(halfFov) * camera.aspect)) * 1.28 * Number(framing || 1);
  const offset = camera.position.clone().sub(controls.target);
  camera.position.copy(controls.target).add(offset.multiplyScalar(next / distance));
  distance = next;
  controls.minDistance = distance * .32;
  controls.maxDistance = distance * 1.9;
  controls.update();
  wake();
}

function reset() {
  controls.target.copy(target);
  const azimuth = Number(host.dataset.cameraAzimuth || .32);
  const elevation = Number(host.dataset.cameraElevation || .105);
  camera.position.set(Math.sin(azimuth) * distance, target.y + distance * elevation, Math.cos(azimuth) * distance);
  controls.update();
  wake();
}

function autoRotate(value) {
  controls.autoRotate = value;
  rotateButton.setAttribute('aria-pressed', String(value));
  rotateButton.setAttribute('aria-label', value ? '暂停旋转' : '自动旋转');
  rotateButton.title = value ? '暂停旋转' : '自动旋转';
  rotateButton.innerHTML = `<i data-lucide="${value ? 'pause' : 'play'}"></i>`;
  window.lucide?.createIcons();
  wake();
}

function zoom(factor) {
  const offset = camera.position.clone().sub(controls.target);
  offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(offset);
  controls.update();
  wake();
}

async function start() {
  if (started) return;
  started = true;
  host.setAttribute('aria-busy', 'true');
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.domElement.style.removeProperty('display');
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x0c0e0e, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = Number(host.dataset.exposure || (importedModel ? 1.15 : .75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', host.getAttribute('aria-label'));
    host.prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, .02, 60);
    camera.position.set(1.8, 1.9, 6);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = .075;
    controls.enablePan = false;
    controls.minPolarAngle = .25;
    controls.maxPolarAngle = Math.PI * .60;
    controls.autoRotateSpeed = .65;
    controls.rotateSpeed = .62;
    controls.zoomSpeed = .75;
    controls.addEventListener('change', wake);
    controls.addEventListener('start', () => autoRotate(false));
    scene.add(new THREE.HemisphereLight(0xe7eeeb, 0x616159, importedModel ? 1.4 : 1.0));
    const key = new THREE.DirectionalLight(0xf2f2ec, 3.0);
    key.name = 'key';
    key.position.set(-3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 4, bottom: -2, near: .1, far: 15 });
    key.shadow.bias = -.0003;
    key.shadow.normalBias = .008;
    key.shadow.radius = 3;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcbdbea, importedModel ? 1.3 : .8);
    fill.name = 'fill';
    fill.position.set(3, 2, 3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xeeeadd, 2);
    rim.position.set(2, 4, -3);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: .30 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.003;
    floor.receiveShadow = true;
    scene.add(floor);
    resize();
    const gltf = await new GLTFLoader().loadAsync(host.dataset.modelSrc || 'assets/models/stele/web/beilin-stele.gltf?v=public1');
    artwork = gltf.scene;
    if (host.dataset.modelSrc) {
      artwork.rotation.y = Number(host.dataset.modelRotation || 0);
      const height = new THREE.Box3().setFromObject(artwork).getSize(new THREE.Vector3()).y;
      artwork.scale.multiplyScalar(2.43 / height);
    }
    const bounds = new THREE.Box3().setFromObject(artwork);
    bounds.getSize(size);
    const center = bounds.getCenter(new THREE.Vector3());
    artwork.position.x -= center.x;
    artwork.position.z -= center.z;
    artwork.position.y -= bounds.min.y;
    target.y = size.y / 2 - .08;
    artwork.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.material.normalScale?.setScalar(.75);
      for (const property of ['map', 'normalMap', 'roughnessMap']) {
        if (object.material[property]) object.material[property].anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
      originals.set(object, object.material);
    });
    scene.add(artwork);
    resize();
    reset();
    host.classList.add('is-ready');
    host.setAttribute('aria-busy', 'false');
    host.dataset.state = 'ready';
    // A small read-only diagnostic helps verify geometry and camera movement.
    host.getViewerState = () => ({ loaded: true, meshes: originals.size, triangles: renderer.info.render.triangles,
      camera: camera.position.toArray(), target: controls.target.toArray(), size: size.toArray(), autoRotate: controls.autoRotate,
      active: activated, visible, frame });
    host.querySelectorAll('[data-viewer-action]').forEach(button => button.addEventListener('click', async () => {
      switch (button.dataset.viewerAction) {
        case 'reset': autoRotate(false); reset(); break;
        case 'rotate': autoRotate(!controls.autoRotate); break;
        case 'zoom-in': zoom(.8); break;
        case 'zoom-out': zoom(1.25); break;
        case 'close': deactivate(); break;
        case 'fullscreen':
          try { if (document.fullscreenElement) await document.exitFullscreen(); else await host.requestFullscreen(); }
          catch { status.textContent = '当前浏览器暂不支持全屏'; status.style.display = 'block'; }
          break;
      }
    }));
    renderer.domElement.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === '0') return reset();
      if (event.key === '+' || event.key === '=') return zoom(.8);
      if (event.key === '-') return zoom(1.25);
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (event.key === 'ArrowLeft') spherical.theta -= .15;
      if (event.key === 'ArrowRight') spherical.theta += .15;
      if (event.key === 'ArrowUp') spherical.phi -= .10;
      if (event.key === 'ArrowDown') spherical.phi += .10;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update(); wake();
    });
    new ResizeObserver(resize).observe(host);
    wake();
  } catch (error) { fail(error); }
}

function activate() {
  activated = true;
  host.classList.add('is-active');
  start();
  wake();
}

function deactivate() {
  activated = false;
  if (controls) autoRotate(false);
  cancelAnimationFrame(frame);
  frame = 0;
  host.classList.remove('is-active');
  if (document.fullscreenElement === host) document.exitFullscreen().catch(() => {});
}

host.querySelector('[data-viewer-start]').addEventListener('click', activate);
host.addEventListener('artifact:activate', activate);
host.addEventListener('artifact:deactivate', deactivate);
new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting;
  if (visible) wake();
  else { cancelAnimationFrame(frame); frame = 0; }
}, { threshold: .02 }).observe(host);
document.addEventListener('visibilitychange', wake);
document.addEventListener('fullscreenchange', () => {
  const expanded = document.fullscreenElement === host;
  const button = host.querySelector('[data-viewer-action="fullscreen"]');
  button.title = expanded ? '退出全屏' : '全屏';
  button.setAttribute('aria-label', button.title);
  button.innerHTML = `<i data-lucide="${expanded ? 'minimize' : 'maximize'}"></i>`;
  window.lucide?.createIcons();
  resize();
});
}
