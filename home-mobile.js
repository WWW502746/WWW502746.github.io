(() => {
  const mode = matchMedia('(max-width:800px), (max-width:1100px) and (pointer:coarse)');
  mode.addEventListener('change', () => location.reload());
  if (!mode.matches) return;
  const film = document.querySelector('.home-film');
  if (!film) return;
  const home = film.closest('[data-page="home"]');
  const scenes = [...film.querySelectorAll('.scene')];
  const videos = [...film.querySelectorAll('video.transition-film')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sources = [
    ['assets/landing-mobile/stone-to-rubbing-v1.mp4', 'assets/landing-mobile/rubbing-to-stone-v1.mp4'],
    ['assets/landing-mobile/rubbing-to-hall-v1.mp4', 'assets/landing-mobile/hall-to-rubbing-v1.mp4'],
  ];
  const footer = film.querySelector('.film-footer'), status = film.querySelector('#media-status');
  let index = Math.max(0, scenes.findIndex(scene => '#' + scene.id === location.hash));
  let playing = null, destination = null, touch = null, serial = 0, lastLandscape = null;
  const active = () => home.classList.contains('page--active');
  const blocked = () => document.body.classList.contains('is-locked') || document.querySelector('dialog[open]') || document.body.classList.contains('is-mobile-portrait');
  window.homeMobile = true;
  film.classList.add('is-mobile-cinema');
  document.body.classList.add('has-mobile-book');
  const gate = document.createElement('div');
  gate.className = 'mobile-orientation-gate';
  gate.setAttribute('role', 'dialog'); gate.setAttribute('aria-modal', 'true'); gate.setAttribute('aria-label', '请横屏体验');
  gate.innerHTML = '<svg viewBox="0 0 100 70" aria-hidden="true"><rect x="14" y="14" width="72" height="42" rx="5"/><path d="M76 30v10M8 8h18M8 8v18m84 36H74m18 0V44"/></svg><h1>请横屏体验</h1><p>将手机横向放置，进入碑间</p><span>BEIJIAN · STONE / PAPER / SPACE</span>';
  document.body.append(gate);
  const previous = document.createElement('button'), next = document.createElement('button');
  previous.className = next.className = 'book-arrow'; previous.type = next.type = 'button';
  previous.setAttribute('aria-label', '上一页'); next.setAttribute('aria-label', '下一页');
  previous.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
  next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>';
  footer.prepend(previous); footer.append(next);
  const skip = document.createElement('button'), resume = document.createElement('button');
  skip.className = 'mobile-transition-skip'; skip.textContent = '跳过过场'; skip.type = 'button';
  resume.className = 'mobile-video-resume'; resume.textContent = '点击播放过场'; resume.type = 'button'; resume.hidden = true;
  film.append(skip, resume);
  film.querySelector('#scroll-instruction').textContent = '滑动进入';
  film.querySelector('.cue-english').textContent = 'Swipe to explore';
  const chapters = [...film.querySelectorAll('.chapters [data-stop]')];
  const worksLink = document.createElement('button');
  worksLink.className = 'mobile-works-next'; worksLink.type = 'button'; worksLink.textContent = '进入寻字 →';
  worksLink.onclick = () => showPage('name-gateway');
  document.querySelector('.works-module--archive')?.append(worksLink);
  function normalize() {
    scenes.forEach((scene, i) => { scene.classList.toggle('is-book-current', i === index); scene.inert = i !== index; scene.setAttribute('aria-hidden', String(i !== index)); });
    home.dataset.module = String(index);
    previous.disabled = index === 0 || Boolean(playing); next.disabled = Boolean(playing);
    next.setAttribute('aria-label', index === 2 ? '进入作品' : '下一页');
    chapters.forEach((link, i) => { if (i === index) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    film.querySelectorAll('.progress-track i').forEach((bar, i) => { bar.style.transform = 'scaleX(' + (index > i ? 1 : 0) + ')'; });
  }
  function finish(target = playing?.to ?? index, continueJourney = false) {
    serial++;
    videos.forEach(video => { video.pause(); video.classList.remove('is-mobile-playing', 'has-mobile-frame'); video.onended = video.onerror = video.ontimeupdate = video.onplaying = video.onwaiting = null; });
    playing = null; resume.hidden = true; status.textContent = '';
    film.classList.remove('is-mobile-playing'); index = target; normalize();
    if (active()) history.replaceState(null, '', index ? '#' + scenes[index].id : '#home');
    const onward = destination; destination = null;
    if (continueJourney && onward !== null && onward !== index && !blocked() && active()) goTo(onward);
  }
  function playVideo() {
    if (!playing || blocked() || !active()) return;
    const current = playing, token = serial; resume.hidden = true;
    current.video.play().catch(() => { if (playing === current && token === serial) { status.textContent = ''; resume.hidden = false; } });
  }
  function goTo(target, behavior = 'smooth') {
    if (!active() || blocked() || (playing && behavior !== 'instant')) return;
    if (target >= scenes.length) { finish(); showPage('works'); return; }
    target = Math.max(0, Math.round(target));
    if (playing) finish();
    if (target === index || behavior === 'instant' || reduced.matches) { destination = null; finish(target); return; }
    destination = target;
    const direction = Math.sign(target - index), to = index + direction;
    const video = videos[Math.min(index, to)], source = sources[Math.min(index, to)][direction > 0 ? 0 : 1];
    serial++; playing = {video, from: index, to};
    video.pause(); video.muted = true; video.playsInline = true; video.preload = 'auto';
    if (video.dataset.activeMobileSource !== source) { video.dataset.activeMobileSource = source; video.src = source; video.load(); }
    else video.currentTime = 0;
    video.classList.add('is-mobile-playing'); film.classList.add('is-mobile-playing');
    scenes.forEach(scene => { scene.inert = true; }); previous.disabled = next.disabled = true;
    status.textContent = '正在准备过场…';
    video.onplaying = () => { video.classList.add('has-mobile-frame'); status.textContent = ''; };
    video.onwaiting = () => { status.textContent = '正在准备过场…'; };
    video.ontimeupdate = () => {
      const ratio = Math.min(1, video.currentTime / (video.duration || 1));
      film.querySelectorAll('.progress-track i')[Math.min(index, to)].style.transform = 'scaleX(' + (direction > 0 ? ratio : 1 - ratio) + ')';
    };
    video.onended = () => finish(to, true); video.onerror = () => finish(to, true);
    playVideo();
  }
  skip.onclick = () => finish(playing?.to ?? index, true); resume.onclick = playVideo;
  previous.onclick = () => goTo(index - 1); next.onclick = () => goTo(index + 1);
  film.querySelectorAll('[data-stop]').forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); goTo(Number(link.dataset.stop));
  }));
  film.addEventListener('touchstart', event => {
    touch = null;
    if (!active() || blocked() || playing || event.touches.length !== 1 || event.target.closest('a,button,input')) return;
    const point = event.touches[0], copy = event.target.closest('.copy');
    touch = {x: point.clientX, y: point.clientY, copy, scrollTop: copy?.scrollTop || 0};
  }, {passive: true});
  film.addEventListener('touchend', event => {
    const start = touch; touch = null;
    if (!start || !active() || blocked() || playing || !event.changedTouches.length) return;
    const point = event.changedTouches[0], dx = point.clientX - start.x, dy = point.clientY - start.y;
    const horizontal = Math.abs(dx) > Math.abs(dy), direction = (horizontal ? dx : dy) < 0 ? 1 : -1;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 55) return;
    if (!horizontal && start.copy && start.copy.scrollHeight > start.copy.clientHeight + 2) {
      if (direction > 0 && start.scrollTop + start.copy.clientHeight < start.copy.scrollHeight - 2) return;
      if (direction < 0 && start.scrollTop > 2) return;
    }
    goTo(index + direction);
  }, {passive: true});
  film.addEventListener('touchcancel', () => { touch = null; }, {passive: true});
  document.querySelector('.clean-toggle').onclick = event => { const clean = document.body.classList.toggle('is-film-clean'); event.currentTarget.setAttribute('aria-pressed', String(clean)); };
  function syncOrientation() {
    const type = screen.orientation?.type;
    const landscape = type ? type.startsWith('landscape') : typeof window.orientation === 'number' ? Math.abs(window.orientation) % 180 === 90 : innerWidth > innerHeight;
    document.body.classList.toggle('is-mobile-portrait', !landscape);
    gate.setAttribute('aria-hidden', String(landscape));
    document.querySelector('main').inert = !landscape; document.querySelector('.site-header').inert = !landscape;
    if (!landscape) document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    if (lastLandscape === landscape) return;
    lastLandscape = landscape;
    if (playing) { if (!landscape) { playing.video.pause(); resume.hidden = false; } else playVideo(); }
    window.dispatchEvent(new CustomEvent('site:orientation', {detail: {landscape}}));
  }
  screen.orientation?.addEventListener('change', syncOrientation);
  window.addEventListener('orientationchange', syncOrientation);
  window.addEventListener('resize', () => { if (!document.activeElement?.matches('input,textarea')) syncOrientation(); });
  window.homeFilm = {goTo, get index() { return index; }, get progress() { return index / 2; }, get atEnd() { return active() && index === 2 && !playing; }, get busy() { return Boolean(playing); }};
  window.addEventListener('site:page', event => {
    if (playing) { destination = null; finish(); }
    touch = null; document.body.classList.toggle('mobile-home-active', event.detail.route === 'home');
    if (event.detail.route === 'home') { finish(event.detail.homeSection ?? index); window.scrollTo(0, 0); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (playing) playing.video.pause(); } else if (playing) resume.hidden = false; });
  reduced.addEventListener('change', () => { destination = null; finish(); });
  document.body.classList.toggle('mobile-home-active', active());
  normalize(); syncOrientation();
})();
