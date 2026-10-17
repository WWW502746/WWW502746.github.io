(() => {
  const film = document.querySelector('.home-film');
  if (!film || window.homeMobile) return;
  const home = film.closest('[data-page="home"]');
  const clips = [...film.querySelectorAll('.transition-film')].map(video => ({
    video, fps: Number(video.dataset.fps), frames: Number(video.dataset.frames),
    lastFrame: Number(video.dataset.lastFrame), desiredTime: 0, ready: false, failed: false
  }));
  const status = film.querySelector('#media-status');
  const scenes = [...film.querySelectorAll('.scene')];
  const images = scenes.map(scene => scene.querySelector('.still'));
  const copies = scenes.map(scene => scene.querySelector('.copy'));
  const shades = [...film.querySelectorAll('.reading-shade')];
  const links = [...film.querySelectorAll('.chapters [data-stop]')];
  const bars = [...film.querySelectorAll('.progress-track i')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hostedMedia = location.hostname === 'www502746.github.io';
  const playhead = { progress: 0 };
  let trigger, active = false, resizeProgress = null, endSince = null;
  const ramp = (value, start, end) => Math.max(0, Math.min(1, (value - start) / (end - start)));

  // Keep one seek per clip in flight; decoding follows the latest scroll position.
  function seekLatest(clip) {
    clip.stream?.ensure(clip.desiredTime);
    if (clip.framePlayer && !clip.framePlayer.failed) {
      if (!active || playhead.progress >= .5 || document.hidden) { clip.framePlayer.suspend(); return; }
      clip.framePlayer.resume();
      if (clip.framePlayer.ready) { clip.stream.useFrames?.(true); return; }
      clip.stream.useFrames?.(false);
    }
    if (!clip.ready || clip.failed || clip.video.seeking || Math.abs(clip.video.currentTime - clip.desiredTime) < .001) return;
    clip.video.currentTime = clip.desiredTime;
  }
  function render() {
    const t = playhead.progress * 2;
    const local = [Math.min(t, 1), Math.max(0, t - 1)];
    const current = t < 1 ? 0 : 1;
    if (active && trigger) {
      prepareClip(clips[current]);
      if (current === 0 && local[0] > .82) prepareClip(clips[1]);
    }
    clips.forEach((clip, i) => {
      const frame = Math.round(ramp(local[i], .12, .84) * (clip.frames - 1));
      // The second clip's last frame is very short; retain its measured midpoint.
      clip.desiredTime = Math.min(clip.lastFrame, (frame + .5) / clip.fps);
      seekLatest(clip);
      clip.video.style.opacity = current === i && clip.ready && !clip.failed ? 1 : 0;
      bars[i].style.transform = `scaleX(${local[i]})`;
    });
    const first = clips[0].ready && !clips[0].failed;
    const second = clips[1].ready && !clips[1].failed;
    images[0].style.opacity = 1 - ramp(t, first ? .12 : .35, first ? .155 : .78);
    images[1].style.opacity = ramp(t, first ? .835 : .35, first ? .875 : .78)
      * (1 - ramp(t, second ? 1.12 : 1.35, second ? 1.155 : 1.78));
    images[2].style.opacity = ramp(t, second ? 1.835 : 1.35, second ? 1.875 : 1.78);
    const opacity = [1 - ramp(t, .035, .115), ramp(t, .865, .945) * (1 - ramp(t, 1.035, 1.115)), ramp(t, 1.865, 1.945)];
    copies.forEach((copy, i) => {
      copy.style.opacity = opacity[i];
      copy.style.transform = `translateY(${(i === 0 || (i === 1 && t > 1) ? -25 : 22) * (1 - opacity[i])}px)`;
      scenes[i].inert = opacity[i] < .05;
    });
    shades.forEach((shade, i) => { shade.style.opacity = opacity[i + 1]; });
    film.querySelector('#progress-number').textContent = String(Math.round(playhead.progress * 100)).padStart(3, '0');
    const index = t >= 1.86 ? 2 : t >= .86 ? 1 : 0;
    home.dataset.module = String(index);
    links.forEach((link, i) => i === index ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current'));
    endSince = playhead.progress < .999 ? null : endSince ?? performance.now();
    const message = clips[current].failed ? '视频暂未载入 · 静态预览' : clips[current].ready ? '' : '正在准备转场…';
    if (status.textContent !== message) status.textContent = message;
  }
  function prepareClip(clip) {
    if (clip.started) return;
    clip.started = true;
    const source = hostedMedia ? clip.video.dataset.hostedSrc : clip.video.dataset.src;
    clip.video.preload = 'auto';
    clip.stream = clip.video.dataset.streamManifest
      ? window.createScrollMedia?.(clip.video, clip.video.dataset.streamManifest, source) : null;
    if (!clip.stream) { clip.video.src = source; clip.video.load(); }
    if (clip === clips[0] && clip.stream && window.createScrollFrames) {
      window.createScrollFrames(clip.video, clip.stream, {
        getFrame: () => Math.floor(clip.desiredTime * clip.fps),
        onReady(player) {
          if (!active || playhead.progress >= .5 || document.hidden) { player.suspend(); return; }
          clip.ready = true; clip.stream.useFrames?.(true); render();
        },
        onFallback() {
          clip.stream.useFrames?.(false);
          clip.ready = clip.video.readyState >= 2; render();
        }
      }).then(player => {
        if (!player || player.failed) return;
        clip.framePlayer = player;
        if (!active || playhead.progress >= .5 || document.hidden) player.suspend();
        render();
      });
    }
  }
  function goTo(index, behavior = 'smooth') {
    resizeProgress = null;
    if (trigger) window.scrollTo({ top: trigger.start + index / 2 * (trigger.end - trigger.start), behavior });
    else scenes[index].scrollIntoView({ behavior: reduced.matches ? 'instant' : behavior });
  }
  window.homeFilm = {
    goTo,
    get index() { return trigger ? Number(home.dataset.module) || 0 : Math.min(2, Math.round(scrollY / innerHeight)); },
    get progress() { return playhead.progress; },
    get atEnd() {
      return active && (trigger ? scrollY >= trigger.end - 1 && playhead.progress >= .999 && endSince !== null && performance.now() - endSince > 300
        : scrollY + innerHeight >= document.documentElement.scrollHeight - 1);
    }
  };
  film.querySelectorAll('[data-stop]').forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const index = Number(link.dataset.stop);
    history.replaceState(null, '', index ? `#${scenes[index].id}` : '#home');
    goTo(index, reduced.matches ? 'instant' : 'smooth');
  }));
  document.querySelector('.clean-toggle').addEventListener('click', event => {
    const clean = document.body.classList.toggle('is-film-clean');
    const button = event.currentTarget;
    button.setAttribute('aria-pressed', String(clean));
    button.querySelector('span').textContent = clean ? '显示文字' : '纯画面';
    button.title = clean ? '显示页面文字' : '隐藏文字，只看画面';
  });
  if (window.gsap && window.ScrollTrigger && !reduced.matches) {
    gsap.registerPlugin(ScrollTrigger);
    film.classList.add('is-enhanced');
    trigger = gsap.to(playhead, {
      progress: 1, duration: 1, ease: 'none', onUpdate: render,
      scrollTrigger: {
        trigger: film, start: 'top top', end: 'bottom bottom', scrub: .25,
        onRefresh(self) {
          if (!active || resizeProgress === null) return;
          const saved = resizeProgress; resizeProgress = null;
          window.scrollTo({ top: self.start + saved * (self.end - self.start), behavior: 'instant' });
        }
      }
    }).scrollTrigger;
    trigger.disable(false);
    clips.forEach(clip => {
      ['loadeddata', 'canplay'].forEach(event => clip.video.addEventListener(event, () => { clip.ready = true; render(); }));
      clip.video.addEventListener('seeked', () => {
        if (clip.video.readyState >= 2) clip.ready = true;
        render();
      });
      clip.video.addEventListener('error', () => { clip.failed = true; render(); });
    });
    window.addEventListener('resize', () => {
      if (active && resizeProgress === null) resizeProgress = trigger.progress;
    });
    render();
  }
  function enter(route, index = null) {
    active = route === 'home';
    if (!active) clips.forEach(clip => clip.framePlayer?.suspend());
    if (!active) { resizeProgress = null; trigger?.disable(false); return; }
    if (trigger) {
      trigger.enable(false, false);
      ScrollTrigger.refresh();
    }
    if (index !== null) goTo(index, 'instant');
    if (trigger) render();
  }
  window.addEventListener('site:page', event => enter(event.detail.route, event.detail.homeSection));
  const initial = location.hash.slice(1);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clips.forEach(clip => clip.framePlayer?.suspend());
    else if (active) render();
  });
  if (['', 'home', 'stone', 'rubbing', 'hall'].includes(initial)) enter('home', Math.max(0, scenes.findIndex(scene => scene.id === initial)));
  Promise.allSettled([document.fonts.ready, ...images.map(image => image.decode())]).then(() => {
    if (!active) return;
    if (trigger) ScrollTrigger.refresh();
    const index = scenes.findIndex(scene => `#${scene.id}` === location.hash);
    if (index >= 0) goTo(index, 'instant');
  });
  reduced.addEventListener('change', () => location.reload());
})();
