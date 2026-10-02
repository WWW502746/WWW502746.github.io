(() => {
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const progress = document.createElement('div');
  progress.className = 'reading-progress'; progress.setAttribute('aria-hidden','true'); document.body.append(progress);
  const controls = document.createElement('nav');
  controls.className = 'experience-controls'; controls.setAttribute('aria-label','连续观看');
  controls.innerHTML = '<button data-prev aria-label="上一件作品">←</button><span class="work-counter"></span><button data-catalog>返回作品</button><button data-next aria-label="下一件作品">→</button>';
  document.body.append(controls);
  const overviewButton=document.createElement('button');overviewButton.textContent='全部作品';overviewButton.setAttribute('aria-haspopup','dialog');controls.insertBefore(overviewButton,controls.querySelector('[data-next]'));
  const picker=document.createElement('dialog');picker.className='work-picker';picker.setAttribute('aria-label','作品速览');document.body.append(picker);
  picker.innerHTML='<header><span>作品速览</span><button aria-label="关闭作品速览">关闭 ×</button></header><div class="work-picker__list"></div>';
  const works = [...document.querySelectorAll('.work')];
  const detail = document.querySelector('.detail-page');
  works.forEach(work=>{const b=document.createElement('button');const img=work.querySelector('img').cloneNode();img.loading='lazy';const title=document.createElement('span');title.textContent=work.querySelector('strong').textContent;b.append(img,title);b.onclick=()=>{picker.close();work.click();};picker.querySelector('.work-picker__list').append(b);});
  overviewButton.onclick=()=>picker.showModal();picker.querySelector('header button').onclick=()=>picker.close();
  picker.addEventListener('click',e=>{if(e.target===picker)picker.close();});
  const gallery=document.querySelector('.image-dialog'), galleryImage=gallery.querySelector(':scope > img');
  const zoom=document.createElement('button');zoom.textContent='＋';zoom.title='放大图像';zoom.setAttribute('aria-label','放大图像');gallery.querySelector('header > div').prepend(zoom);
  let zoomed=false;
  function setZoom(next){zoomed=next;gallery.classList.toggle('is-zoomed',next);zoom.textContent=next?'−':'＋';zoom.setAttribute('aria-label',next?'还原图像':'放大图像');gsap.to(galleryImage,{scale:next?2:1,x:0,y:0,duration:reduce()?0:.5,ease:'power3.out',overwrite:true});}
  zoom.onclick=()=>setZoom(!zoomed);galleryImage.addEventListener('dblclick',()=>setZoom(!zoomed));gallery.addEventListener('close',()=>setZoom(false));
  gallery.querySelectorAll('[data-gallery-prev],[data-gallery-next]').forEach(b=>b.addEventListener('click',()=>setZoom(false)));
  gallery.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight')setZoom(false);});
  let drag=null;
  galleryImage.addEventListener('pointerdown',e=>{if(!zoomed)return;drag={x:e.clientX,y:e.clientY,px:Number(gsap.getProperty(galleryImage,'x')),py:Number(gsap.getProperty(galleryImage,'y'))};gsap.killTweensOf(galleryImage);galleryImage.setPointerCapture(e.pointerId);e.preventDefault();});
  galleryImage.addEventListener('pointermove',e=>{if(!drag)return;gsap.set(galleryImage,{x:gsap.utils.clamp(-galleryImage.clientWidth/2,galleryImage.clientWidth/2,drag.px+e.clientX-drag.x),y:gsap.utils.clamp(-galleryImage.clientHeight/2,galleryImage.clientHeight/2,drag.py+e.clientY-drag.y)});});
  galleryImage.addEventListener('pointerup',()=>drag=null);galleryImage.addEventListener('pointercancel',()=>drag=null);
  function advance(delta) {
    const index = works.findIndex(w => w.dataset.model === detail.dataset.work);
    works[(index + delta + works.length) % works.length].click();
  }
  controls.querySelector('[data-prev]').onclick = () => advance(-1);
  controls.querySelector('[data-next]').onclick = () => advance(1);
  controls.querySelector('[data-catalog]').onclick = () => document.querySelector('.detail-back').click();
  let motion, flight, flightTimeline, flightSource, returnFlightTarget, detailOrigin;
  let flightTargets=[], landingTargets=[], lightCleanup = () => {};
  const disposeFlight = () => {
    flightTimeline?.kill(); flightTimeline=null;
    if (flight) { flight.remove(); flight=null; }
    if (flightSource) gsap.set(flightSource,{clearProps:'opacity,visibility'});
    if (flightTargets.length) gsap.set(flightTargets,{clearProps:'opacity,visibility'});
    if (landingTargets.length) gsap.set(landingTargets,{clearProps:'opacity,visibility,transform'});
    flightSource=null; returnFlightTarget=null; flightTargets=[]; landingTargets=[];
    document.body.classList.remove('has-flight');
  };
  // Capture the original image before existing routing handlers update the work.
  document.addEventListener('click', e => {
    if (window.pageMotion?.busy && e.target.closest('.route-link,.scroll-cue,[data-next-work],.experience-controls')) {
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    const link = e.target.closest('.route-link');
    if (!link) return;
    disposeFlight();
    const active = document.querySelector('.page--active');
    if (link.dataset.route === 'detail' && active !== detail) detailOrigin = {route:active.dataset.page,button:link};
    const destination = link.matches('.detail-back') && window.pageMotion?.enabled ? window.pageMotion.returnRoute : link.dataset.route;
    // Retrace the selected exhibit into the existing archive, without cloning a page.
    if (window.pageMotion?.enabled && !reduce() && active === detail && destination === 'works') {
      const stone = detail.querySelector('.detail__stone'), r = stone.getBoundingClientRect();
      const target = works.find(work => work.dataset.model === detail.dataset.work);
      if (target && r.top >= 0 && r.bottom <= innerHeight + 30) {
        flight = target.querySelector('img').cloneNode(); flight.className='flight-image'; flight.alt=''; flight.setAttribute('aria-hidden','true');
        Object.assign(flight.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
        document.body.append(flight); document.body.classList.add('has-flight');
        returnFlightTarget=target; flightSource=stone;
        flightTimeline=gsap.timeline().fromTo(flight,{opacity:0},{opacity:1,duration:.28},0).to(stone,{autoAlpha:0,duration:.28},0);
        return;
      }
    }
    const img = link.querySelector('img');
    if (reduce() || link.dataset.route !== 'detail' || !img || !img.getClientRects().length) return;
    const r = img.getBoundingClientRect();
    if (r.bottom<0 || r.top>innerHeight) return;
    flight = img.cloneNode(); flight.className='flight-image'; flight.alt=''; flight.setAttribute('aria-hidden','true');
    Object.assign(flight.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',filter:getComputedStyle(img).filter});
    document.body.append(flight); document.body.classList.add('has-flight');
    flightSource=link;
    const catalog=link.closest('.archive-catalog');
    flightTargets=catalog?[...catalog.querySelectorAll('.archive-object,.archive-detail,.scene-caption,.archive-catalog__footer,.archive-atmosphere,.archive-floor')].filter(node=>node!==link):[];
    gsap.set(link,{autoAlpha:0});
    flightTimeline=gsap.timeline({defaults:{overwrite:'auto'}})
      .to(flight,{scale:1.025,duration:.42,ease:'sine.inOut'},0)
      .to(flightTargets,{autoAlpha:0,duration:.38,stagger:{amount:.08,from:'end'},ease:'power2.out'},0);
  }, true);
  function mount() {
    motion?.revert(); lightCleanup();
    const page = document.querySelector('.page--active');
    if (!page) return;
    const isDetail = page === detail;
    const isLanding = Boolean(flight && isDetail);
    if (!isDetail) detail.style.removeProperty('animation');
    controls.querySelector('.work-counter').textContent = `${detail.dataset.workNumber || '01'} / ${String(works.length).padStart(2,'0')}`;
    gsap.to(controls,{autoAlpha:isDetail?1:0,duration:reduce()?0:.35,overwrite:true});
    if (flight && returnFlightTarget && !isDetail) {
      const target = returnFlightTarget, rect = target.querySelector('img').getBoundingClientRect();
      flightTimeline?.kill(); landingTargets=[target]; gsap.set(target,{autoAlpha:0});
      flightTimeline=gsap.timeline({onComplete:disposeFlight})
        .to(flight,{x:rect.left-parseFloat(flight.style.left),y:rect.top-parseFloat(flight.style.top),scaleX:rect.width/parseFloat(flight.style.width),scaleY:rect.height/parseFloat(flight.style.height),duration:.78,ease:'power3.inOut'},0)
        .to(target,{autoAlpha:1,duration:.22},.64)
        .to(flight,{autoAlpha:0,duration:.22},.64);
    } else if (isLanding) {
      detail.style.animation='none';
      const stone=document.querySelector('.detail__stone');
      const target=stone.getBoundingClientRect();
      const start=flight.getBoundingClientRect();
      const aspect=flight.naturalWidth/flight.naturalHeight;
      const width=Math.min(target.width,target.height*aspect);
      const height=width/aspect;
      const left=target.left+(target.width-width)/2;
      const top=target.top+(target.height-height)/2;
      const scaleX=Number(gsap.getProperty(flight,'scaleX'))*width/start.width;
      const scaleY=Number(gsap.getProperty(flight,'scaleY'))*height/start.height;
      const meta=[...detail.querySelectorAll('.detail-back,.detail-meta > *,.detail-position,.work-chapters')];
      landingTargets=[stone,...meta];
      flightTimeline?.kill();
      gsap.set(stone,{autoAlpha:0});
      gsap.set(meta,{autoAlpha:0,y:14});
      flightTimeline=gsap.timeline({defaults:{overwrite:'auto'},onComplete:disposeFlight})
        .to(flight,{x:left-parseFloat(flight.style.left),y:top-parseFloat(flight.style.top),scaleX,scaleY,duration:.86,ease:'power3.inOut'},0)
        .to(flight,{filter:'grayscale(1) brightness(.78)',duration:.54,ease:'sine.inOut'},.18)
        .to(meta,{autoAlpha:1,y:0,duration:.54,stagger:.035,ease:'power3.out'},.42)
        .to(stone,{autoAlpha:1,duration:.34,ease:'power1.out'},.66)
        .to(flight,{autoAlpha:0,duration:.34,ease:'power1.out'},.68);
    } else disposeFlight();
    motion=gsap.matchMedia();
    motion.add({desktop:'(min-width:801px)',mobile:'(max-width:800px)',reduce:'(prefers-reduced-motion: reduce)'}, context => {
      const minimal=context.conditions.reduce;
      const moduleHome=page===home && window.pageMotion?.enabled;
      if (moduleHome) gsap.set(progress,{scaleX:(moduleIndex+1)/(sections.length+1)});
      else gsap.fromTo(progress,{scaleX:0},{scaleX:1,ease:'none',scrollTrigger:{trigger:page,start:'top top',end:'bottom bottom',scrub:true}});
      const reveal=moduleHome?[]:[...page.querySelectorAll('.reveal')];
      reveal.forEach(el=>el.classList.add('motion-owned','is-visible'));
      if (!minimal) {
        const introTargets=[...page.querySelectorAll(isLanding?'.hero__copy > *, .works-intro > *':'.hero__copy > *, .works-intro > *, .detail-meta > h1, .detail-description')];
        gsap.from(introTargets,{autoAlpha:0,y:16,stagger:.065,duration:.8,ease:'power3.out',clearProps:'opacity,visibility,transform'});
        reveal.forEach(el=>gsap.fromTo(el,{y:30,autoAlpha:0},{y:0,autoAlpha:1,duration:.95,ease:'power2.out',scrollTrigger:{trigger:el,start:'top 92%',once:true}}));
        if(context.conditions.desktop && !moduleHome) page.querySelectorAll('.hero__stone,.feature-card figure img').forEach(el=>gsap.fromTo(el,{y:0},{y:24,ease:'none',scrollTrigger:{trigger:el.parentElement,start:'top top',end:'bottom top',scrub:.6}}));
      }
      if(isDetail) document.querySelectorAll('.work-chapters button').forEach(button=>{
        const section=document.getElementById(button.dataset.detailTarget);
        if(!section || !section.getClientRects().length) return;
        const active=()=>{document.querySelectorAll('.work-chapters button').forEach(b=>b.setAttribute('aria-current',String(b===button)));};
        ScrollTrigger.create({trigger:section,start:'top 42%',end:'bottom 42%',onEnter:active,onEnterBack:active});
      });
      return ()=>reveal.forEach(el=>el.classList.remove('motion-owned'));
    });
    const cleanup=[];
    page.querySelectorAll('[data-light-surface]').forEach(surface=>{
      surface.tabIndex=0;
      surface.setAttribute('aria-label','移动指针或使用方向键调整侧光');
      const value={x:52,y:46};
      const render=()=>{surface.style.setProperty('--x',value.x+'%');surface.style.setProperty('--y',value.y+'%');};
      const x=gsap.quickTo(value,'x',{duration:.4,onUpdate:render});
      const y=gsap.quickTo(value,'y',{duration:.4,onUpdate:render});
      const move=e=>{const r=surface.getBoundingClientRect(); x(gsap.utils.clamp(0,100,(e.clientX-r.left)/r.width*100)); y(gsap.utils.clamp(0,100,(e.clientY-r.top)/r.height*100));};
      const key=e=>{const d={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]}[e.key]; if(!d)return; e.preventDefault();value.x=gsap.utils.clamp(0,100,value.x+d[0]);value.y=gsap.utils.clamp(0,100,value.y+d[1]);render();};
      surface.addEventListener('pointermove',move);surface.addEventListener('keydown',key);
      cleanup.push(()=>{surface.removeEventListener('pointermove',move);surface.removeEventListener('keydown',key);x.tween.kill();y.tween.kill();});
    });
    lightCleanup=()=>cleanup.forEach(fn=>fn());
    requestAnimationFrame(()=>ScrollTrigger.refresh());
  }
  window.addEventListener('site:page',()=>requestAnimationFrame(mount));
  let refreshTimer, pendingRefresh=false;
  const refreshWhenIdle=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(pendingRefresh){pendingRefresh=false;ScrollTrigger.refresh();}},350);};
  window.addEventListener('scroll',refreshWhenIdle,{passive:true});
  document.fonts.ready.then(()=>{pendingRefresh=true;refreshWhenIdle();});
  document.querySelectorAll('main img').forEach(img=>img.addEventListener('load',()=>{pendingRefresh=true;refreshWhenIdle();},{once:true}));

  // A module index, not scroll coordinates, owns the desktop exhibition.
  const desktop = matchMedia('(min-width:801px) and (pointer:fine)');
  const home = document.querySelector('[data-page="home"]');
  const sections = [home.querySelector('.hero'),...home.querySelectorAll('.editorial-screen')];
  const interstitials = [...home.querySelectorAll('.statement,.archive-invite')];
  const worksModules = [...document.querySelectorAll('[data-works-module]')];
  let routeMotion, moduleMotion, routeCleanup, moduleIndex = 0, worksModuleIndex = 0;
  let lastWheel = 0, wheelSum = 0, wheelUsed = false, wheelDirection = 0;
  const activeRoute = () => document.querySelector('.page--active')?.dataset.page;
  const overlayOpen = () => document.body.classList.contains('is-locked') || document.querySelector('dialog[open]') || document.fullscreenElement;
  const mainRoute = () => desktop.matches && ['home','works','name-gateway'].includes(activeRoute()) && !overlayOpen();
  function syncRoute() {
    document.body.classList.toggle('is-module-route',desktop.matches && ['home','works','name-gateway'].includes(activeRoute()));
    const page = document.querySelector('.works-page');
    if (activeRoute() !== 'works') document.body.classList.remove('is-glyph-field');
    else document.body.classList.toggle('is-glyph-field', page.scrollTop >= page.clientHeight * .5);
  }
  function restore(index = null) {
    moduleMotion?.kill(); moduleMotion=null;
    if(index!==null)moduleIndex=gsap.utils.clamp(0,sections.length-1,index);
    sections.forEach((el,i)=>{
      el.classList.toggle('is-current-module',i===moduleIndex);
      el.inert=desktop.matches && i!==moduleIndex;
      if(desktop.matches)el.setAttribute('aria-hidden',String(i!==moduleIndex));
      else el.removeAttribute('aria-hidden');
      gsap.set(el,{clearProps:'opacity,visibility,transform,willChange'});
    });
    interstitials.forEach(el=>{
      el.inert=desktop.matches;
      if(desktop.matches)el.setAttribute('aria-hidden','true');
      else el.removeAttribute('aria-hidden');
    });
    home.dataset.module=String(moduleIndex);
    document.body.classList.remove('is-section-moving');
    if(desktop.matches && activeRoute()==='home') {
      window.scrollTo({top:0,behavior:'instant'});
      gsap.set(progress,{scaleX:(moduleIndex+1)/(sections.length+1)});
    }
  }
  function restoreWorks(index = worksModuleIndex) {
    worksModuleIndex = gsap.utils.clamp(0, worksModules.length - 1, index);
    worksModules.forEach((el, i) => {
      el.classList.add('is-current-module');
      el.inert = false;
      el.setAttribute('aria-hidden', 'false');
    });
    const page = document.querySelector('.works-page');
    requestAnimationFrame(() => { page.scrollTop = index === 1 ? page.scrollHeight : 0; });
  }
  function change(target, activate, immediate) {
    routeMotion?.kill(); routeCleanup?.(); restore();
    const outgoing = document.querySelector('.page--active');
    const isReturn = outgoing === detail && target !== detail;
    const focusTarget = isReturn ? (target.dataset.page==='works'
      ? works.find(work=>work.dataset.model===detail.dataset.work) : detailOrigin?.button) : null;
    if (immediate || reduce() || outgoing===target || !desktop.matches) {
      disposeFlight(); activate();
      if (focusTarget && target.contains(focusTarget)) focusTarget.focus({preventScroll:true});
      return;
    }
    const shared = Boolean(flight);
    const order={home:0,works:1,'name-gateway':2,name:3,detail:3};
    const direction = isReturn ? -1 : Math.sign((order[target.dataset.page]??1)-(order[outgoing.dataset.page]??1)) || 1;
    const separate = target.dataset.page==='name' || outgoing.dataset.page==='name';
    const distance = shared ? 0 : separate ? 0 : 42 * direction;
    document.body.classList.add('is-route-moving');
    routeCleanup = () => {
      gsap.set([outgoing,target],{clearProps:'opacity,visibility,transform'});
      document.body.classList.remove('is-route-moving');
      routeMotion=null; routeCleanup=null;
    };
    routeMotion=gsap.timeline({onComplete:()=>{
      routeCleanup?.();
      if (focusTarget && target.contains(focusTarget)) focusTarget.focus({preventScroll:true});
      ScrollTrigger.refresh();
    }});
    routeMotion.to(outgoing,{opacity:0,y:-distance*.6,x:separate?-22:0,duration:.32,ease:'power2.in'},0)
      .call(activate,[],.32)
      .fromTo(target,{opacity:0,y:distance,x:separate?22:0},{opacity:1,y:0,x:0,duration:.72,ease:'power3.out',immediateRender:false},.32);
    // Existing shared-element landing finishes after the page has become visible.
    if (shared) routeMotion.to({}, {duration:.35});
  }
  function section(index) {
    if (!mainRoute() || window.pageMotion.busy || activeRoute()!=='home') return;
    if (index>=sections.length) { showPage('works'); return; }
    if (index<0 || index===moduleIndex) return;
    const outgoing=sections[moduleIndex],incoming=sections[index],direction=Math.sign(index-moduleIndex);
    moduleIndex=index;
    if (reduce()) { restore();return; }
    if(outgoing.contains(document.activeElement))document.activeElement.blur();
    outgoing.inert=true; document.body.classList.add('is-section-moving');
    gsap.set([outgoing,incoming],{willChange:'transform,opacity'});
    gsap.set(incoming,{autoAlpha:1,yPercent:direction*100});
    // Both panels travel a full viewport: no partial overlay or interstitial resting state.
    moduleMotion=gsap.timeline({defaults:{ease:'power3.inOut'},onComplete:()=>restore()})
      .to(outgoing,{yPercent:-direction*100,autoAlpha:0,duration:.78},0)
      .to(incoming,{yPercent:0,duration:.78},0);
  }
  function step(direction) {
    if (!mainRoute()) return;
    // A transition owns the current gesture. Never turn its inertia tail into another page change.
    if(window.pageMotion.busy)return;
    if (activeRoute()==='works') { showPage(direction > 0 ? 'name-gateway' : 'home', false, direction < 0 ? sections.length - 1 : null); return; }
    if (activeRoute()==='name-gateway') { if(direction<0)showPage('works'); return; }
    section(moduleIndex+direction);
  }
  window.pageMotion={change,section,restore,restoreWorks,syncRoute,enterWorks:previousRoute=>restoreWorks(previousRoute==='name-gateway'?worksModules.length-1:previousRoute==='works'?worksModuleIndex:0),get index(){return moduleIndex;},get enabled(){return desktop.matches;},
    get busy(){return Boolean(routeMotion || moduleMotion);},get returnRoute(){return detailOrigin?.route || 'works';}};
  const syncDesktop = () => {
    if(routeMotion) routeMotion.progress(1);
    document.body.classList.toggle('has-page-motion',desktop.matches);restore();syncRoute();
  };
  document.querySelector('.works-page').addEventListener('scroll', () => {
    if (activeRoute() === 'works') document.body.classList.toggle('is-glyph-field', document.querySelector('.works-page').scrollTop >= innerHeight * .5);
  }, {passive:true});
  desktop.addEventListener('change',syncDesktop); syncDesktop();
  const handleWheel = (event, forwarded = false) => {
    if (!desktop.matches || overlayOpen() || event.ctrlKey || event.metaKey) return;
    if (!mainRoute() && !window.pageMotion.busy) return;
    if (Math.abs(event.deltaX)>Math.abs(event.deltaY)) return;
    // Keep extending the consumed gesture while a page is moving, but never queue another step.
    // The next trackpad gesture must first go quiet; a fresh mouse-wheel notch still works at once.
    if(window.pageMotion.busy){lastWheel=performance.now();wheelUsed=true;return;}
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
    if(!delta)return;
    if (activeRoute() === 'works') {
      const page = document.querySelector('.works-page');
      const atTop = page.scrollTop <= 1, atBottom = page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
      if ((delta > 0 && atBottom) || (delta < 0 && atTop)) { event.preventDefault(); step(Math.sign(delta)); return; }
      if (forwarded) { event.preventDefault(); page.scrollBy({top: delta, behavior: 'auto'}); }
      return;
    }
    event.preventDefault();
    const now=performance.now(),direction=Math.sign(delta);
    // Native wheel notches remain separate even when issued less than 220 ms apart.
    // Small, decaying trackpad events still belong to the already-consumed gesture.
    const notch=event.deltaMode!==0 || (event.deltaX===0 && Number.isInteger(delta) && Math.abs(delta)>=80 && Math.abs(delta)%10===0);
    if(notch || now-lastWheel>180 || direction!==wheelDirection){wheelSum=0;wheelUsed=false;}
    lastWheel=now;wheelDirection=direction;
    if(wheelUsed)return;
    wheelSum+=delta;
    if(Math.abs(wheelSum)>=28){wheelUsed=true;step(direction);}
  };
  window.addEventListener('wheel',handleWheel,{passive:false});
  window.addEventListener('message',event=>{
    const frame = document.querySelector('.glyph-field-frame');
    const data = event.data;
    if (!frame || event.source !== frame.contentWindow || data?.type !== 'beilin-glyph-wheel' || !Number.isFinite(data.deltaY)) return;
    handleWheel({deltaX:0,deltaY:data.deltaY,deltaMode:data.deltaMode || 0,ctrlKey:false,metaKey:false,preventDefault(){}}, true);
  });
  window.addEventListener('keydown',event=>{
    if (!mainRoute() || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,select,[contenteditable=true],[data-light-surface]')) return;
    const direction={ArrowDown:1,PageDown:1,ArrowUp:-1,PageUp:-1}[event.key]
      || (event.key===' ' && !event.target.closest('button,a') ? (event.shiftKey?-1:1) : 0);
    if(direction){event.preventDefault();if(!event.repeat)step(direction);}
    if(activeRoute()==='home' && ['Home','End'].includes(event.key)){event.preventDefault();section(event.key==='Home'?0:sections.length-1);}
  });
  window.addEventListener('resize',()=>{if(routeMotion)routeMotion.progress(1);restore();});
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{
    if(routeMotion)routeMotion.progress(1);restore();disposeFlight();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(routeMotion)routeMotion.progress(1);restore();disposeFlight();}});
})();
