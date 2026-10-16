(() => {
  const mode = matchMedia('(max-width:800px), (max-width:1100px) and (pointer:coarse)');
  mode.addEventListener('change', () => location.reload());
  if (!mode.matches) return;
  const film = document.querySelector('.home-film');
  if (!film) return;
  const home = film.closest('[data-page="home"]');
  const scenes = [...film.querySelectorAll('.scene')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const footer = film.querySelector('.film-footer');
  let index = 0, motion = null, touch = null;
  const active = () => home.classList.contains('page--active');
  const blocked = () => document.body.classList.contains('is-locked') || document.querySelector('dialog[open]');
  window.homeMobile = true;
  film.classList.add('is-mobile-book');
  document.body.classList.add('has-mobile-book');
  const previous = document.createElement('button');
  const next = document.createElement('button');
  previous.className = 'book-arrow'; next.className = 'book-arrow';
  previous.type = next.type = 'button';
  previous.setAttribute('aria-label', '上一页');
  previous.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
  next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>';
  footer.prepend(previous); footer.append(next);
  film.querySelector('#scroll-instruction').textContent = '上滑翻页';
  film.querySelector('.cue-english').textContent = 'Swipe to explore';
  film.querySelector('.cue-arrow').textContent = '↑';
  const glyphModule = document.querySelector('.works-module--glyph');
  if (glyphModule) {
    const navigation = document.createElement('nav');
    navigation.className = 'mobile-glyph-nav';
    navigation.setAttribute('aria-label', '石雕互动导航');
    navigation.innerHTML = '<button type="button" data-glyph-back>↑ 返回作品</button><button type="button" data-glyph-next>进入寻字 →</button>';
    navigation.querySelector('[data-glyph-back]').onclick = () => document.querySelector('.works-page').scrollTo({top: 0, behavior: 'smooth'});
    navigation.querySelector('[data-glyph-next]').onclick = () => showPage('name-gateway');
    glyphModule.append(navigation);
  }
  const chapterLinks = [...film.querySelectorAll('.chapters [data-stop]')];
  const normalize = () => {
    scenes.forEach((scene, i) => {
      scene.classList.toggle('is-book-current', i === index);
      scene.inert = i !== index;
      scene.setAttribute('aria-hidden', String(i !== index));
      if (window.gsap) gsap.set(scene, {clearProps: 'transform,opacity,visibility,zIndex'});
      else scene.removeAttribute('style');
    });
    home.dataset.module = String(index);
    previous.disabled = index === 0;
    next.setAttribute('aria-label', index === 2 ? '进入作品' : '下一页');
    chapterLinks.forEach((link, i) => i === index ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current'));
    film.querySelectorAll('.progress-track i').forEach((bar, i) => { bar.style.transform = `scaleX(${index > i ? 1 : 0})`; });
    film.querySelector('#media-status').textContent = '';
  };
  function finish() {
    if (motion) { motion.kill(); motion = null; }
    film.classList.remove('is-book-turning');
    normalize();
  }
  function goTo(target, behavior = 'smooth') {
    if (!active() || blocked()) return;
    if (motion && behavior !== 'instant') return;
    if (target >= scenes.length) { finish(); showPage('works'); return; }
    target = Math.max(0, Math.round(target));
    if (motion) finish();
    const outgoing = scenes[index], incoming = scenes[target];
    const direction = Math.sign(target - index);
    index = target;
    home.dataset.module = String(index);
    history.replaceState(null, '', index ? '#' + scenes[index].id : '#home');
    if (!direction || behavior === 'instant' || reduced.matches || !window.gsap) { finish(); return; }
    film.classList.add('is-book-turning');
    outgoing.inert = true;
    incoming.inert = true;
    gsap.set(outgoing, {visibility: 'visible', opacity: 1, zIndex: 8, transformOrigin: direction > 0 ? '0% 50%' : '100% 50%'});
    gsap.set(incoming, {visibility: 'visible', opacity: .25, zIndex: 7, rotationY: direction * 24, xPercent: direction * 8});
    motion = gsap.timeline({onComplete() { motion = null; film.classList.remove('is-book-turning'); normalize(); }});
    motion.to(outgoing, {rotationY: -direction * 75, xPercent: -direction * 12, opacity: 0, duration: .64, ease: 'power2.inOut'}, 0)
      .to(incoming, {rotationY: 0, xPercent: 0, opacity: 1, duration: .64, ease: 'power2.out'}, .12);
  }
  previous.addEventListener('click', () => goTo(index - 1));
  next.addEventListener('click', () => goTo(index + 1));
  film.querySelectorAll('[data-stop]').forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); goTo(Number(link.dataset.stop));
  }));
  film.addEventListener('touchstart', event => {
    touch = null;
    if (!active() || blocked() || motion || event.touches.length !== 1 || event.target.closest('a,button,input')) return;
    const point = event.touches[0], copy = event.target.closest('.copy');
    touch = {x: point.clientX, y: point.clientY, copy, scrollTop: copy?.scrollTop || 0};
  }, {passive: true});
  film.addEventListener('touchend', event => {
    const start = touch; touch = null;
    if (!start || !active() || blocked() || motion || !event.changedTouches.length) return;
    const point = event.changedTouches[0], dx = point.clientX - start.x, dy = point.clientY - start.y;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 55) return;
    const direction = (horizontal ? dx : dy) < 0 ? 1 : -1;
    // A long text panel consumes its scroll gesture before the next page can turn.
    if (!horizontal && start.copy && start.copy.scrollHeight > start.copy.clientHeight + 2) {
      if (direction > 0 && start.scrollTop + start.copy.clientHeight < start.copy.scrollHeight - 2) return;
      if (direction < 0 && start.scrollTop > 2) return;
    }
    goTo(index + direction);
  }, {passive: true});
  film.addEventListener('touchcancel', () => { touch = null; }, {passive: true});
  window.addEventListener('keydown', event => {
    if (!active() || blocked() || event.defaultPrevented || event.target.closest('input,textarea,button,a')) return;
    const step = {ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1}[event.key];
    if (step) { event.preventDefault(); if (!event.repeat) goTo(index + step); }
  });
  document.querySelector('.clean-toggle').addEventListener('click', event => {
    const clean = document.body.classList.toggle('is-film-clean');
    event.currentTarget.setAttribute('aria-pressed', String(clean));
    event.currentTarget.title = clean ? '显示页面文字' : '隐藏文字，只看画面';
  });
  window.homeFilm = {goTo, get index() { return index; }, get progress() { return index / 2; }, get atEnd() { return active() && index === 2 && !motion; }};
  window.addEventListener('site:page', event => {
    finish(); touch = null;
    document.body.classList.toggle('mobile-home-active', event.detail.route === 'home');
    if (event.detail.route === 'home') {
      goTo(event.detail.homeSection ?? index, 'instant');
      window.scrollTo(0, 0);
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
  reduced.addEventListener('change', finish);
  index = Math.max(0, scenes.findIndex(scene => '#' + scene.id === location.hash));
  document.body.classList.toggle('mobile-home-active', active());
  normalize();
})();
