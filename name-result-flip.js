const here = new URL('.', import.meta.url);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function formatStory(story) {
  story.querySelectorAll('.name-result__chapters article').forEach(article => {
    const heading = document.createElement('header');
    const body = document.createElement('div');
    body.className = 'name-result__chapter-body';
    heading.append(...article.querySelectorAll(':scope > span, :scope > h3'));
    body.append(...article.querySelectorAll(':scope > p'));
    article.replaceChildren(heading, body);
  });
}

export function mountResultFlip(root, careers) {
  let disposed = false;
  const figure = root.querySelector('.name-result__art');
  const frontImage = figure.querySelector('img');
  const number = Number(frontImage.getAttribute('src').match(/\/(\d+)\.webp$/)[1]);
  const career = careers[number - 1];
  const story = root.querySelector('.name-result__story');
  story.id = 'persona-story';
  story.dataset.face = 'front';
  formatStory(story);
  const originalStory = story.innerHTML;
  const history = document.createElement('div');
  history.innerHTML = `<p class="name-kicker">HISTORICAL FIGURE / 历史人物</p>
    <h2 id="name-result-about"></h2><p class="history-persona"></p>
    <p class="name-result__intro"></p><div class="name-result__chapters">
      <article><span>01 / 性格特质</span><h3>与你呼应的特质</h3><p></p></article>
      <article><span>02 / 现代职业</span><h3>对应的职业方向</h3><p class="history-roles"></p></article>
    </div>`;
  const title = history.querySelector('h2');
  title.textContent = career.person;
  if (career.personLabel !== career.person) {
    const detail = document.createElement('span');
    detail.className = 'history-name-detail';
    detail.textContent = career.personLabel.slice(career.person.length);
    title.append(detail);
  }
  history.querySelector('.history-persona').textContent = `对应书写人格 · ${career.persona}`;
  history.querySelector('.name-result__intro').textContent = career.bridge;
  history.querySelector('article p').textContent = career.traits;
  history.querySelector('.history-roles').textContent = career.roles;
  const work = history.querySelector('article:last-child');
  career.careerParagraphs.forEach(text => { const paragraph = document.createElement('p'); paragraph.textContent = text; work.append(paragraph); });
  formatStory(history);
  const historicalStory = history.innerHTML;
  const stage = document.createElement('div');
  stage.className = 'flip-stage';
  stage.innerHTML = `<div class="flip-lift"><div class="flip-card" id="persona-card" aria-label="人格卡正反面">
    <button type="button" class="flip-face flip-front" aria-hidden="false" disabled></button>
    <div class="flip-face flip-back" aria-hidden="true" inert><img width="1086" height="1448" alt=""></div>
  </div></div>`;
  const front = stage.querySelector('.flip-front');
  const back = stage.querySelector('.flip-back');
  const card = stage.querySelector('.flip-card');
  const lift = stage.querySelector('.flip-lift');
  front.setAttribute('aria-label', `${career.persona}人格人物画，点击翻转查看对应历史人物`);
  frontImage.loading = 'eager';
  front.append(frontImage);
  const backImage = back.querySelector('img');
  backImage.alt = `${career.persona}的现代职业人物画：${career.person}，${career.roles}`;
  backImage.src = new URL(`assets/name/personas/history/${String(number).padStart(2, '0')}.webp`, here).href;
  figure.prepend(stage);
  const hint = document.createElement('p');
  hint.className = 'flip-hint';
  hint.textContent = '正在载入另一面…';
  const invitation = document.createElement('div');
  invitation.className = 'flip-invitation';
  invitation.id = 'history-reveal';
  const invitationTitle = document.createElement('h3');
  invitationTitle.className = 'flip-invitation__title';
  invitationTitle.textContent = '看看你和哪位历史人物相似';
  const invitationCopy = document.createElement('p');
  invitationCopy.className = 'flip-invitation__copy';
  invitationCopy.textContent = '翻开这张人格卡，发现与你呼应的历史人物。';
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'flip-button'; button.disabled = true;
  button.textContent = '点击揭晓历史人物';
  button.setAttribute('aria-label', button.textContent);
  button.setAttribute('aria-controls', 'persona-card persona-story'); button.setAttribute('aria-pressed', 'false');
  const status = document.createElement('p');
  status.className = 'sr-only'; status.setAttribute('role', 'status'); status.textContent = '当前展示性格人物画';
  figure.append(hint, status);
  invitation.append(invitationTitle, invitationCopy, button);
  story.append(invitation);
  const frontHeight = story.getBoundingClientRect().height;
  story.classList.add('is-history'); story.innerHTML = historicalStory;
  story.append(invitation);
  const historyHeight = story.getBoundingClientRect().height;
  story.classList.remove('is-history'); story.innerHTML = originalStory;
  story.append(invitation);
  story.style.setProperty('--story-height', `${Math.ceil(Math.max(frontHeight, historyHeight, figure.getBoundingClientRect().height))}px`);
  let showingBack = false, busy = false, timeline;
  const showFace = backIsVisible => {
    front.setAttribute('aria-hidden', String(backIsVisible)); front.inert = backIsVisible;
    back.setAttribute('aria-hidden', String(!backIsVisible)); back.inert = !backIsVisible;
    const face = backIsVisible ? 'history' : 'front';
    if (story.dataset.face !== face) {
      story.innerHTML = backIsVisible ? historicalStory : originalStory;
      story.append(invitation);
      story.dataset.face = face;
      story.classList.toggle('is-history', backIsVisible);
    }
    invitationTitle.textContent = backIsVisible ? '回到你的书写人格' : '看看你和哪位历史人物相似';
    invitationCopy.textContent = backIsVisible ? '点击返回，继续查看你的性格解读。' : '翻开这张人格卡，发现与你呼应的历史人物。';
    button.textContent = backIsVisible ? '返回书写人格解读' : '点击揭晓历史人物';
    button.setAttribute('aria-label', button.textContent);
    button.setAttribute('aria-pressed', String(backIsVisible));
    button.classList.toggle('is-back', backIsVisible);
    hint.textContent = backIsVisible ? '查看历史人物解读，下方可返回你的书写人格' : '点击人物画，也可以揭晓历史人物';
    figure.querySelector('figcaption span').textContent = backIsVisible ? '对应历史人物' : '性格人物画';
    status.textContent = backIsVisible ? `当前展示${career.personLabel}的历史人物画与对应解读` : '当前展示性格人物画与人格解读';
  };
  function flip() {
    if (busy || button.disabled) return;
    const restoreFocus = document.activeElement === button || document.activeElement === front;
    busy = true; button.disabled = true;
    const nextBack = !showingBack;
    const complete = () => {
      showingBack = nextBack; showFace(showingBack);
      lift.style.willChange = ''; card.style.willChange = '';
      button.disabled = false; busy = false;
      if (restoreFocus && root.closest('[data-page]').classList.contains('page--active')) button.focus({preventScroll: true});
    };
    if (reducedMotion.matches || !window.gsap) {
      if (window.gsap) gsap.set(card, {rotationY: nextBack ? 180 : 0});
      else card.style.transform = `rotateY(${nextBack ? 180 : 0}deg)`;
      complete();
      return;
    }
    lift.style.willChange = 'transform'; card.style.willChange = 'transform';
    timeline = gsap.timeline({onComplete: complete})
      .to(lift, {y: -6, scale: 1.015, duration: .12, ease: 'power2.out'}, 0)
      .to(card, {rotationY: nextBack ? 180 : 0, duration: .6, ease: 'power2.inOut'}, .08)
      .call(() => showFace(nextBack), [], .38)
      .to(lift, {y: 0, scale: 1, duration: .12, ease: 'power2.out'}, .68);
  }
  front.addEventListener('click', flip);
  button.addEventListener('click', flip);
  const motionChange = () => { if (reducedMotion.matches && busy) timeline?.progress(1); };
  reducedMotion.addEventListener('change', motionChange);
  Promise.all([frontImage.decode(), backImage.decode()]).then(() => {
    if (disposed || !stage.isConnected) return;
    hint.textContent = '点击人物画，也可以揭晓历史人物'; button.disabled = false; front.disabled = false;
  }).catch(() => {
    if (!disposed && stage.isConnected) { hint.textContent = '人物图载入失败，请刷新重试。'; status.textContent = hint.textContent; }
  });
  return {
    finish() { if (busy) timeline?.progress(1); },
    dispose() {
      disposed = true;
      timeline?.kill();
      reducedMotion.removeEventListener('change', motionChange);
      front.removeEventListener('click', flip);
      button.removeEventListener('click', flip);
    }
  };
}

