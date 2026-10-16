(() => {
  const root = document.querySelector('[data-archive-room]');
  const scene = root?.querySelector('.scene');
  if (!root || !scene) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
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
  const isVisible = () => !root.classList.contains('page') || root.classList.contains('page--active');
  const canAnimate = () => inViewport && isVisible() && !document.hidden && !reduced.matches;
  const requestRender = () => {
    if (!frame && canAnimate()) frame = requestAnimationFrame(render);
  };
  const setStyle = (node, key, value) => {
    if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value);
  };

  const setPointer = (event) => {
    if (!canAnimate() || event.pointerType === 'touch') return;
    pointer = { x: event.clientX, y: event.clientY };
    requestRender();
  };

  const resetPointer = () => {
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
      if (!canAnimate() || event.pointerType === 'touch') return;
      pendingTilts.set(object, { x: event.clientX, y: event.clientY });
      requestRender();
    }, { passive: true });
    object.addEventListener('pointerleave', () => {
      pendingTilts.set(object, null);
      requestRender();
    });
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
  };
  reduced.addEventListener('change', syncMotion);
  window.addEventListener('site:page', syncMotion);
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
