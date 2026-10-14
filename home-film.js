(() => {
  const film = document.querySelector('.home-film');
  const home = film.closest('[data-page="home"]');
  const clips = [...film.querySelectorAll('.transition-film')].map(video => ({
    video, fps: Number(video.dataset.fps), frames: Number(video.dataset.frames),
    lastFrame: Number(video.dataset.lastFrame), desiredTime: 0, targetTime: 0, updatedAt: 0,
    speed: 0, playDenied: false, presenting: false, ready: false, failed: false
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
  let trigger, active = false, resizeProgress = null, endSince = null, stopTimer;
  const ramp = (value, start, end) => Math.max(0, Math.min(1, (value - start) / (end - start)));

  // Forward scrolling uses the sequential decoder; reverse and stopped positions seek exactly.
  function seekLatest(clip) {
    if (!active || document.hidden || clip !== clips[playhead.progress < .5 ? 0 : 1] || !clip.ready || clip.failed) return;
    const video = clip.video, difference = clip.desiredTime - video.currentTime;
    const movingForward = clip.speed >= .25 && performance.now() - clip.updatedAt < 100;
    const buffered = [...Array(video.buffered.length)].some((_, i) =>
      clip.desiredTime >= video.buffered.start(i) && clip.desiredTime <= video.buffered.end(i));
    if (movingForward && !video.ended && !clip.playDenied && difference > -.1 && (difference < .5 || !buffered)) {
      if (video.seeking) return;
      const rate = Math.max(.25, Math.min(4, clip.speed + difference * 4));
      if (Math.abs(video.playbackRate - rate) > .05) video.playbackRate = rate;
      if (video.paused) video.play().catch(error => { if (error.name !== 'AbortError') clip.playDenied = true; });
      return;
    }
    video.pause();
    if (!video.seeking && !clip.presenting && Math.abs(difference) >= .0001) {
      clip.presenting = typeof video.requestVideoFrameCallback === 'function';
      if (clip.presenting) {
        let deadline;
        const callback = video.requestVideoFrameCallback(() => {
          clearTimeout(deadline); clip.presenting = false; seekLatest(clip);
        });
        deadline = setTimeout(() => { video.cancelVideoFrameCallback(callback); clip.presenting = false; seekLatest(clip); }, 150);
      }
      video.currentTime = clip.desiredTime;
    }
  }
  function loadClip(clip) {
    if (clip.loading) return clip.loading;
    const video = clip.video;
    // Cache the original bytes before playback so scroll seeks never wait on remote ranges.
    clip.loading = (hostedMedia && video.dataset.streamParts
      ? Promise.all(video.dataset.streamParts.split('|').map(async url => {
          const response = await fetch(url, { cache: 'force-cache' });
          if (!response.ok) throw new Error(`Video load failed: ${response.status}`);
          return response.blob();
        })).then(parts => URL.createObjectURL(new Blob(parts, { type: 'video/mp4' })))
      : Promise.resolve(hostedMedia ? video.dataset.hostedSrc : video.dataset.src)
    ).then(source => { video.preload = 'auto'; video.src = source; video.load(); })
      .catch(() => { clip.failed = true; if (active) render(); });
    return clip.loading;
  }
  function render() {
    const t = playhead.progress * 2;
    const local = [Math.min(t, 1), Math.max(0, t - 1)];
    const current = t < 1 ? 0 : 1;
    // Give the large first clip bandwidth before preloading the next transition.
    if (active && trigger && t >= .84 && trigger.progress >= .42
      && (!hostedMedia || clips[0].ready || clips[0].failed)) loadClip(clips[1]);
    const now = performance.now();
    clips.forEach((clip, i) => {
      const motion = ramp(local[i], .12, .84);
      const frame = Math.round(motion * (clip.frames - 1));
      const target = motion * (clip.frames - 1) / clip.fps;
      const elapsed = now - clip.updatedAt;
      clip.speed = elapsed > 0 && elapsed < 150 ? (target - clip.targetTime) * 1000 / elapsed : 0;
      if (clip.speed > 8) clip.speed = 0;
      clip.targetTime = target; clip.updatedAt = now;
      // The second clip's last frame is very short; retain its measured midpoint.
      clip.desiredTime = Math.min(clip.lastFrame, (frame + .5) / clip.fps);
      if (i === current) seekLatest(clip);
      else if (!clip.video.paused) clip.video.pause();
      clip.video.style.opacity = current === i && clip.ready && !clip.failed ? 1 : 0;
      bars[i].style.transform = `scaleX(${local[i]})`;
    });
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => { clips[current].speed = 0; seekLatest(clips[current]); }, 100);
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
      clip.video.addEventListener('loadeddata', () => {
        clip.ready = true;
        if (active && hostedMedia && clip === clips[0]) loadClip(clips[1]);
        render();
      });
      clip.video.addEventListener('seeked', () => seekLatest(clip));
      clip.video.addEventListener('error', () => { clip.failed = true; render(); });
    });
    window.addEventListener('resize', () => {
      if (active && resizeProgress === null) resizeProgress = trigger.progress;
    });
    render();
  }
  function enter(route, index = null) {
    active = route === 'home';
    if (!active) { resizeProgress = null; trigger?.disable(false); clearTimeout(stopTimer); clips.forEach(clip => clip.video.pause()); return; }
    if (trigger) {
      trigger.enable(false, false);
      ScrollTrigger.refresh();
      loadClip(clips[0]);
    }
    if (index !== null) goTo(index, 'instant');
  }
  window.addEventListener('site:page', event => enter(event.detail.route, event.detail.homeSection));
  const initial = location.hash.slice(1);
  if (['', 'home', 'stone', 'rubbing', 'hall'].includes(initial)) enter('home', Math.max(0, scenes.findIndex(scene => scene.id === initial)));
  Promise.allSettled([document.fonts.ready, ...images.map(image => image.decode())]).then(() => {
    if (!active) return;
    if (trigger) ScrollTrigger.refresh();
    const index = scenes.findIndex(scene => `#${scene.id}` === location.hash);
    if (index >= 0) goTo(index, 'instant');
  });
  reduced.addEventListener('change', () => location.reload());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(stopTimer); clips.forEach(clip => clip.video.pause()); }
    else if (active) render();
  });
})();
