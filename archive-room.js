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
    targetX: 0,
    targetY: 0,
  }));
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let frame = 0;
  const isVisible = () => !root.classList.contains('page') || root.classList.contains('page--active');

  const setPointer = (event) => {
    if (reduced.matches || event.pointerType === 'touch') return;
    const rect = scene.getBoundingClientRect();
    targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  };

  const resetPointer = () => {
    targetX = 0;
    targetY = 0;
  };

  const render = () => {
    if (reduced.matches || !isVisible()) { frame = 0; return; }
    currentX += (targetX - currentX) * 0.075;
    currentY += (targetY - currentY) * 0.075;
    objects.forEach((item) => {
      item.targetX = currentX * item.depth * 16;
      item.targetY = currentY * item.depth * 9;
      item.x += (item.targetX - item.x) * 0.09;
      item.y += (item.targetY - item.y) * 0.09;
      item.node.style.setProperty('--offset-x', `${item.x.toFixed(2)}px`);
      item.node.style.setProperty('--offset-y', `${item.y.toFixed(2)}px`);
    });

    frame = requestAnimationFrame(render);
  };

  scene.addEventListener('pointermove', setPointer, { passive: true });
  scene.addEventListener('pointerleave', resetPointer, { passive: true });
  window.addEventListener('blur', resetPointer, { passive: true });

  const exhibits = [...root.querySelectorAll('[data-object]')];
  const selectObject = (index) => {
    root.querySelector('.scene-caption strong').textContent = `${String(index + 1).padStart(2, '0')} / 05`;
    root.querySelectorAll('.progress i').forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  };
  exhibits.forEach((object, index) => {
    object.addEventListener('pointerenter', () => selectObject(index));
    object.addEventListener('focus', () => selectObject(index));
    object.addEventListener('pointermove', (event) => {
      if (reduced.matches || event.pointerType === 'touch') return;
      const rect = object.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
      object.style.setProperty('--tilt-x', `${(-y * 2).toFixed(2)}deg`);
      object.style.setProperty('--tilt-y', `${(x * 3).toFixed(2)}deg`);
    }, { passive: true });
    object.addEventListener('pointerleave', () => {
      object.style.setProperty('--tilt-x', '0deg');
      object.style.setProperty('--tilt-y', '0deg');
    });
  });

  const syncMotion = () => {
    cancelAnimationFrame(frame);
    resetPointer();
    currentX = 0;
    currentY = 0;
    objects.forEach((item) => {
      item.x = item.y = 0;
      ['--offset-x', '--offset-y', '--tilt-x', '--tilt-y'].forEach((key) => item.node.style.removeProperty(key));
    });
    if (!reduced.matches) frame = requestAnimationFrame(render);
  };
  reduced.addEventListener('change', syncMotion);
  window.addEventListener('site:page', syncMotion);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(frame);
    else syncMotion();
  });
  syncMotion();
})();
