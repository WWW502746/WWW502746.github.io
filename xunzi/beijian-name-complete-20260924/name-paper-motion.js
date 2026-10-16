import { createPaperScene } from './assets/name/craft-motion/paper-scene.js';

export function mountPaperRolls(container) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  const rolls = [];
  let disposed = false;
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const roll = rolls.find(item => item.visual === entry.target);
      if (roll?.scene && !roll.failed) roll.scene.resize();
    }
  });
  const controller = {
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.abort();
      observer.disconnect();
      for (const roll of rolls) {
        roll.timeline?.kill();
        roll.scene?.dispose();
        roll.canvas.remove();
        roll.images.forEach(([image, visibility]) => { image.style.visibility = visibility; });
        delete roll.visual.dataset.paperMotion;
      }
    },
    metrics() {
      return rolls.map(roll => ({ id: roll.id, ready: Boolean(roll.scene) && !roll.failed && !disposed,
        failed: roll.failed, active: Boolean(roll.timeline?.isActive()), hovered: roll.hovered,
        focused: roll.focused, reducedMotion: reduced.matches, ...roll.scene?.metrics() }));
    },
  };

  function transition(roll) {
    if (!roll.scene || roll.failed || disposed) return;
    roll.timeline?.kill();
    roll.timeline = null;
    const target = roll.hovered || roll.focused ? 1 : 0;
    const draw = () => roll.scene.render(roll.state.progress, roll.state.flutter);
    const remaining = Math.abs(target - roll.state.progress);
    if (reduced.matches || !globalThis.gsap || remaining < 0.001) {
      roll.state.progress = target;
      roll.state.flutter = 0;
      draw();
      return;
    }
    roll.timeline = gsap.timeline({ onUpdate: draw });
    roll.timeline.to(roll.state, { progress: target, flutter: 0,
      duration: Math.max(0.12, (target ? 0.9 : 0.7) * remaining), ease: 'power2.inOut' });
    if (target) roll.timeline.to(roll.state, { flutter: 0.65, duration: 0.1, ease: 'power2.out' })
      .to(roll.state, { flutter: -0.18, duration: 0.12, ease: 'power2.inOut' })
      .to(roll.state, { flutter: 0, duration: 0.16, ease: 'power2.out' });
  }

  reduced.addEventListener('change', () => rolls.forEach(transition), { signal: listeners.signal });
  window.addEventListener('pagehide', controller.dispose, { signal: listeners.signal });
  void Promise.all([...container.querySelectorAll('button[data-finish-key="paper"][data-finish-id]')].map(async button => {
    const visual = button.querySelector('.paper-visual');
    if (!visual) return;
    const id = button.dataset.finishId;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;';
    visual.append(canvas);
    const roll = { id, visual, canvas, scene: null, timeline: null, failed: false,
      hovered: button.matches(':hover'), focused: button.contains(document.activeElement),
      images: [...visual.querySelectorAll('img')].map(image => [image, image.style.visibility]),
      state: { progress: 0, flutter: 0 } };
    rolls.push(roll);
    try {
      roll.scene = await createPaperScene(canvas, {
        textureUrl: new URL(`./assets/name/craft-ui/paper-${id}.webp`, import.meta.url).href, paperType: id,
      });
      if (disposed || !visual.isConnected || !container.contains(button)) {
        roll.scene.dispose();
        canvas.remove();
        return;
      }
      canvas.addEventListener('webglcontextlost', () => {
        roll.failed = true;
        roll.timeline?.kill();
        canvas.style.opacity = '0';
        roll.images.forEach(([image, visibility]) => { image.style.visibility = visibility; });
        delete visual.dataset.paperMotion;
      }, { signal: listeners.signal });
      for (const [event, flag, value] of [['pointerenter', 'hovered', true], ['pointerleave', 'hovered', false],
        ['focus', 'focused', true], ['blur', 'focused', false]]) {
        button.addEventListener(event, event => {
          if (event.pointerType === 'touch') return;
          roll[flag] = value;
          transition(roll);
        }, { signal: listeners.signal });
      }
      roll.hovered = button.matches(':hover');
      roll.focused = button.contains(document.activeElement);
      transition(roll);
      roll.images.forEach(([image]) => { image.style.visibility = 'hidden'; });
      canvas.style.opacity = '1';
      visual.dataset.paperMotion = 'ready';
      observer.observe(visual);
    } catch {
      roll.failed = true;
      canvas.remove();
    }
  }));
  return controller;
}
