(() => {
  const root = document.querySelector('[data-archive-room]');
  const scene = root?.querySelector('.scene');
  if (!root || !scene) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width:800px), (max-width:1100px) and (pointer:coarse)');
  const objects = [...root.querySelectorAll('[data-depth]')].map((node) => ({
    node,
    depth: Number(node.dataset.depth || 0),
    x: 0,
    y: 0,
  }));
  const exhibits = [...root.querySelectorAll('[data-object]')];
  const pendingTilts = new Map();
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let frame = 0;
  let inViewport = false;
  let sceneRect = null;
  let pointer = null;
  let listening = false;
  let calibrated = null;
  let sensorTimer = 0;
  const OrientationEvent = window.DeviceOrientationEvent;
  const sensorSupported = window.isSecureContext && typeof OrientationEvent === 'function';
  let permission = typeof OrientationEvent?.requestPermission === 'function' ? 'prompt' : 'granted';
  const controls = document.createElement('div');
  controls.className = 'archive-motion-controls';
  controls.hidden = !mobile.matches;
  controls.innerHTML = '<p aria-live="polite"></p><button type="button">开启倾斜</button>';
  (root.querySelector('.works-module--archive') || root).append(controls);
  const motionHint = controls.querySelector('p');
  const motionButton = controls.querySelector('button');
  const isVisible = () => !root.classList.contains('page') || root.classList.contains('page--active');
  const canAnimate = () => inViewport && isVisible() && !document.hidden && !reduced.matches &&
    !(mobile.matches && document.body.classList.contains('is-mobile-portrait'));
  const requestRender = () => {
    if (!frame && canAnimate()) frame = requestAnimationFrame(render);
  };
  const setStyle = (node, key, value) => {
    if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value);
  };

  const setPointer = (event) => {
    if (mobile.matches || !canAnimate() || event.pointerType === 'touch') return;
    pointer = { x: event.clientX, y: event.clientY };
    requestRender();
  };

  const resetPointer = () => {
    if (mobile.matches) return;
    pointer = null;
    targetX = 0;
    targetY = 0;
    exhibits.forEach((node) => pendingTilts.set(node, null));
    requestRender();
  };

  const render = () => {
    frame = 0;
    if (!canAnimate()) return;
    // Read bounds before changing transforms, once per frame rather than once per pointer event.
    if (pointer) {
      sceneRect ||= scene.getBoundingClientRect();
      targetX = ((pointer.x - sceneRect.left) / sceneRect.width - 0.5) * 2;
      targetY = ((pointer.y - sceneRect.top) / sceneRect.height - 0.5) * 2;
      pointer = null;
    }
    const tilts = [];
    pendingTilts.forEach((point, node) => {
      let x = 0, y = 0;
      if (point) {
        const rect = node.getBoundingClientRect();
        x = Math.max(-1, Math.min(1, (point.x - rect.left) / rect.width * 2 - 1));
        y = Math.max(-1, Math.min(1, (point.y - rect.top) / rect.height * 2 - 1));
      }
      tilts.push({ node, x, y });
    });
    pendingTilts.clear();
    tilts.forEach(({ node, x, y }) => {
      setStyle(node, '--tilt-x', `${(-y * 2).toFixed(2)}deg`);
      setStyle(node, '--tilt-y', `${(x * 3).toFixed(2)}deg`);
    });
    currentX += (targetX - currentX) * 0.075;
    currentY += (targetY - currentY) * 0.075;
    if (Math.abs(targetX - currentX) < 0.0001) currentX = targetX;
    if (Math.abs(targetY - currentY) < 0.0001) currentY = targetY;
    let moving = currentX !== targetX || currentY !== targetY;
    if (mobile.matches) {
      exhibits.forEach((node) => {
        setStyle(node, '--tilt-x', `${(-currentY * 2).toFixed(2)}deg`);
        setStyle(node, '--tilt-y', `${(currentX * 3).toFixed(2)}deg`);
      });
    }
    objects.forEach((item) => {
      const x = currentX * item.depth * 16;
      const y = currentY * item.depth * 9;
      item.x += (x - item.x) * 0.09;
      item.y += (y - item.y) * 0.09;
      if (Math.abs(x - item.x) < 0.01) item.x = x;
      if (Math.abs(y - item.y) < 0.01) item.y = y;
      moving ||= item.x !== x || item.y !== y;
      setStyle(item.node, '--offset-x', `${item.x.toFixed(2)}px`);
      setStyle(item.node, '--offset-y', `${item.y.toFixed(2)}px`);
    });

    if (moving) requestRender();
  };

  scene.addEventListener('pointermove', setPointer, { passive: true });
  scene.addEventListener('pointerleave', resetPointer, { passive: true });
  window.addEventListener('blur', resetPointer, { passive: true });

  const selectObject = (index) => {
    root.querySelector('.scene-caption strong').textContent = `${String(index + 1).padStart(2, '0')} / 05`;
    root.querySelectorAll('.progress i').forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  };
  exhibits.forEach((object, index) => {
    object.addEventListener('pointerenter', () => selectObject(index));
    object.addEventListener('focus', () => selectObject(index));
    object.addEventListener('pointermove', (event) => {
      if (mobile.matches || !canAnimate() || event.pointerType === 'touch') return;
      pendingTilts.set(object, { x: event.clientX, y: event.clientY });
      requestRender();
    }, { passive: true });
    object.addEventListener('pointerleave', () => {
      if (mobile.matches) return;
      pendingTilts.set(object, null);
      requestRender();
    });
  });

  const setMotionStatus = (state) => {
    controls.dataset.state = state;
    motionHint.textContent = {
      prompt: '轻轻倾斜手机，观看石刻浮动',
      listening: '轻轻倾斜手机，观看石刻浮动',
      active: '轻轻倾斜手机，观看石刻浮动',
      denied: '倾斜未开启，仍可点击作品查看',
      unavailable: '当前设备暂不支持倾斜，仍可点击作品查看',
      reduced: '已减少动态效果，可点击作品查看',
    }[state];
    motionButton.textContent = state === 'active' ? '重新校准' : '开启倾斜';
    motionButton.disabled = state === 'reduced' || !sensorSupported;
  };
  const screenAngle = () => screen.orientation?.angle ?? window.orientation ?? 0;
  const tiltAmount = (value) => Math.sign(value) * Math.min(0.85,
    Math.round(Math.max(0, Math.abs(value) - 0.012) / 0.25 * 40) / 40);
  const readOrientation = (event) => {
    if (!listening || !canAnimate() || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    const beta = event.beta * Math.PI / 180;
    const gamma = event.gamma * Math.PI / 180;
    const angle = screenAngle() * Math.PI / 180;
    // Gravity projection stays continuous when Euler angles wrap near an upright phone.
    const x = Math.cos(beta) * Math.sin(gamma);
    const y = Math.sin(beta);
    const point = {x: x * Math.cos(angle) - y * Math.sin(angle), y: y * Math.cos(angle) + x * Math.sin(angle)};
    if (!calibrated) {
      calibrated = point;
      clearTimeout(sensorTimer);
      setMotionStatus('active');
    }
    const nextX = tiltAmount(point.x - calibrated.x);
    const nextY = tiltAmount(point.y - calibrated.y);
    if (nextX === targetX && nextY === targetY) return;
    targetX = nextX;
    targetY = nextY;
    requestRender();
  };
  const stopOrientation = () => {
    window.removeEventListener('deviceorientation', readOrientation);
    clearTimeout(sensorTimer);
    listening = false;
    calibrated = null;
  };
  const syncOrientation = () => {
    controls.hidden = !mobile.matches;
    stopOrientation();
    if (!mobile.matches) return;
    if (reduced.matches) { setMotionStatus('reduced'); return; }
    if (!sensorSupported) { setMotionStatus('unavailable'); return; }
    if (permission !== 'granted') { setMotionStatus(permission === 'denied' ? 'denied' : 'prompt'); return; }
    setMotionStatus('listening');
    if (!canAnimate()) return;
    listening = true;
    window.addEventListener('deviceorientation', readOrientation, {passive: true});
    sensorTimer = window.setTimeout(() => {
      if (!calibrated) { stopOrientation(); setMotionStatus('unavailable'); }
    }, 4000);
  };
  motionButton.addEventListener('click', async () => {
    if (!mobile.matches || !canAnimate() || !sensorSupported) return;
    try {
      if (permission !== 'granted') {
        // Call immediately inside the click, before any await consumes user activation.
        const request = OrientationEvent.requestPermission();
        motionButton.disabled = true;
        permission = await request;
        motionButton.disabled = false;
      }
    } catch {
      permission = 'denied';
      motionButton.disabled = false;
    }
    syncMotion();
  });

  const syncMotion = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    pointer = null;
    sceneRect = null;
    pendingTilts.clear();
    targetX = 0;
    targetY = 0;
    currentX = 0;
    currentY = 0;
    objects.forEach((item) => {
      item.x = item.y = 0;
      ['--offset-x', '--offset-y', '--tilt-x', '--tilt-y'].forEach((key) => item.node.style.removeProperty(key));
    });
    root.dataset.motionActive = String(canAnimate());
    syncOrientation();
  };
  reduced.addEventListener('change', syncMotion);
  mobile.addEventListener('change', syncMotion);
  window.addEventListener('site:page', syncMotion);
  window.addEventListener('site:orientation', syncMotion);
  window.addEventListener('orientationchange', syncMotion);
  screen.orientation?.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('resize', () => { sceneRect = null; }, { passive: true });
  window.addEventListener('scroll', () => { sceneRect = null; }, { passive: true, capture: true });
  const visibility = new IntersectionObserver(([entry]) => {
    const visible = entry.isIntersecting && entry.intersectionRatio > 0;
    if (inViewport === visible) return;
    inViewport = visible;
    syncMotion();
  }, { threshold: [0, 0.01] });
  visibility.observe(scene);
  syncMotion();
})();
