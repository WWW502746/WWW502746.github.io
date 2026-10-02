history.scrollRestoration = "manual";
const pages = [...document.querySelectorAll("[data-page]")];
const transition = document.querySelector(".transition");
const navButtons = [...document.querySelectorAll(".site-header [data-route]")];
const drawer = document.querySelector(".menu-drawer");
const about = document.querySelector(".about-panel");
const cursor = document.querySelector(".cursor");
const detailPage = document.querySelector(".detail-page");
const artworkButtons = [...document.querySelectorAll(".work")];
const artifactViewers = [...document.querySelectorAll("[data-artifact-viewer]")];
const glyphFieldFrame = document.querySelector(".glyph-field-frame");
if (glyphFieldFrame) {
  const localPreview = ["localhost", "127.0.0.1"].includes(location.hostname) && location.port === "4175";
  glyphFieldFrame.src = localPreview ? "http://127.0.0.1:3002/lab/glyph-field" : "/lab/glyph-field/";
}
const steleCover = "assets/works/stele/cover-v1.webp";
const workImages = {
  floral360: [
    {src:"assets/works/floral/cover-v1.webp", caption:"花碣 / 全貌", alt:"花碣的层叠花瓣、相向双禽与回纹边饰"},
    {src:"assets/works/floral/flower-v1.webp", caption:"花碣 / 花心", alt:"花碣中央层叠花瓣的石刻细节", label:"花心", note:"层层花瓣从石面展开，明暗停在起伏之间。"},
    {src:"assets/works/floral/birds-v1.webp", caption:"花碣 / 双禽", alt:"花枝下相向的双禽与卷草纹", label:"双禽", note:"双禽隔枝相望，卷草把两侧的线条连在一起。"}
  ],
  dragon360: [
    {src:"assets/works/dragon/cover-v1.webp", caption:"龙首 / 全貌", alt:"张口昂首的灰石龙首，眉角与卷曲须纹清晰可见"},
    {src:"assets/works/dragon/eye-v1.webp", caption:"龙首 / 眉目", alt:"龙首眼部、眉脊与角的雕刻细节", label:"眉目", note:"眉脊层层挑起，目光凝在石的深处。"},
    {src:"assets/works/dragon/mane-v1.webp", caption:"龙首 / 须纹", alt:"龙首卷曲的颊纹与下颌石刻线条", label:"须纹", note:"线条在颊侧回旋，沿下颌汇成无声的波纹。"}
  ],
  stele360: [
    {src:steleCover, caption:"巡碑 / 全貌", alt:"巡碑在侧光下的全貌"},
    {src:"assets/works/stele/crest-v1.webp", caption:"巡碑 / 碑额", alt:"巡碑碑额的双兽与云纹", label:"碑额", note:"双兽相向，守住一段无声的文字。"},
    {src:"assets/works/stele/fracture-v1.webp", caption:"巡碑 / 断痕", alt:"巡碑刻字和裂隙的细节", label:"断痕", note:"裂隙穿过字行，石仍然完整。"}
  ],
  head360: [
    {src:"assets/works/head/cover-v1.webp", caption:"碑首 / 全貌", alt:"圆拱碑首的两面盘龙浮雕与风化石面"},
    {src:"assets/works/head/dragon-v1.webp", caption:"碑首 / 龙纹", alt:"碑首盘龙的头部与卷曲身形浮雕", label:"龙纹", note:"盘曲的线条藏在拱面之下，光沿着鳞纹缓缓展开。"},
    {src:"assets/works/head/edge-v1.webp", caption:"碑首 / 石缘", alt:"碑首圆拱边缘、斑驳石质与浮雕转折", label:"石缘", note:"棱角被磨圆，深浅不一的斑痕留在石上。"}
  ],
  fragment360: [
    {src:"assets/works/fragment/cover-v2.webp", caption:"残碑 / 全貌", alt:"残碑的锯齿状断口、竖列刻字与残缺边缘"},
    {src:"assets/works/fragment/crown-v2.webp", caption:"残碑 / 断口", alt:"残碑顶部断口与风化石面的近景", label:"断口", note:"边缘已经散去，断面仍留着石的纹理。"},
    {src:"assets/works/fragment/inscription-v2.webp", caption:"残碑 / 刻痕", alt:"残碑字行、斜向裂隙与几何边饰的细节", label:"刻痕", note:"裂隙穿过字行，未尽的笔画停在石上。"}
  ]
};
const workRoutes = { stele360: 'stele', fragment360: 'fragment', head360: 'head', dragon360: 'dragon', floral360: 'floral' };

let currentPage = "home";
let routeTimer;
let transitionTimer;
const routePositions = new Map();
let activeAddress = location.hash.slice(1) || 'home';

function showPage(route, immediate = false, homeSection = null) {
  const target = pages.find((page) => page.dataset.page === route) || pages[0];
  if (!immediate && target.classList.contains("page--active")) immediate = true;
  const enhanced = window.pageMotion?.enabled;

  clearTimeout(routeTimer);
  clearTimeout(transitionTimer);
  if (immediate || enhanced) transition.classList.remove('is-entering');
  if (!immediate && !enhanced) transition.classList.add("is-entering");

  const activate = () => {
    const previousPage = currentPage;
    routePositions.set(activeAddress, window.scrollY);
    pages.forEach((page) => {
      const active = page === target;
      page.classList.toggle("page--active", active);
      page.setAttribute("aria-hidden", String(!active));
    });
    currentPage = target.dataset.page;
    if (currentPage === 'works') window.pageMotion?.enterWorks(previousPage);
    window.pageMotion?.syncRoute();
    if (currentPage === 'home' && enhanced) window.pageMotion.restore(homeSection);
    document.body.classList.toggle("is-name", currentPage === "name");
    if (currentPage !== "detail") artifactViewers.forEach(viewer => viewer.dispatchEvent(new Event("artifact:deactivate")));
    navButtons.forEach((button) => button.classList.toggle("is-current", button.dataset.route === (currentPage === "name-gateway" ? "name" : currentPage)));
    document.body.classList.remove("is-detail-scrolled");
    observeReveals();
    const address = currentPage === "detail"
      ? workRoutes[detailPage.dataset.work]
      : currentPage;
    if (location.hash !== `#${address}`) history.pushState(null, "", `#${address}`);
    activeAddress = address;
    const top = currentPage === 'home' && enhanced ? 0 : routePositions.get(address) || 0;
    window.scrollTo({ top, behavior: "instant" });
    window.dispatchEvent(new CustomEvent("site:page", { detail: { route: currentPage } }));
  };
  // Defer until selectWork's existing click handler has selected the work.
  routeTimer = setTimeout(() => enhanced ? window.pageMotion.change(target, activate, immediate) : activate(), immediate || enhanced ? 0 : 430);

  if (!immediate && !enhanced) {
    transitionTimer = setTimeout(() => transition.classList.remove("is-entering"), 950);
  }
  closeDrawer();
}

document.querySelectorAll(".route-link").forEach((button) => {
  button.addEventListener("click", () => showPage(button.matches('.detail-back') && window.pageMotion?.enabled
    ? window.pageMotion.returnRoute : button.dataset.route, false, button.matches('.brand') ? 0 : null));
});

function selectWork(work) {
    const index = artworkButtons.findIndex(item => item.dataset.model === work.dataset.model);
    const selected = artworkButtons[index];
    if (!selected) return;
    const number = String(index + 1).padStart(2, '0');
    const title = selected.querySelector("figcaption strong").textContent;
    const year = selected.querySelector("figcaption span:last-child").textContent;
    const isModel = work.dataset.model === "stele360";
    const isFragment = work.dataset.model === "fragment360";
    const isHead = work.dataset.model === "head360";
    const isDragon = work.dataset.model === "dragon360";
    const isFloral = work.dataset.model === "floral360";
    const isRelief = isHead || isDragon || isFloral;
    const images = workImages[work.dataset.model];
    const image = images[0].src;
    const detailStone = document.querySelector(".detail__stone");

    document.querySelector(".detail-meta .eyebrow").textContent = `NO. 0${number}`;
    document.querySelector(".detail-meta h1").textContent = title;
    document.querySelector(".detail-meta h1").dataset.lettering = title;
    window.applyLettering?.(document.querySelector(".detail-meta h1"));
    document.querySelector(".detail-meta dl div:first-child dd").textContent = year;
    document.querySelector(".detail-meta dl div:nth-child(2) dd").textContent = isModel ? "灰石 · 数字重构" : "刻石 · 数字重构";
    document.querySelector(".detail-meta dl div:nth-child(3) dd").textContent = isModel ? "243 × 120 × 57 cm" : "数字模型";
    document.querySelector(".detail-description").textContent = isFloral
      ? "花枝自石中舒展，双禽隔茎相望。层叠的花瓣与回旋的卷草，在残缺的边框里留住一场盛放。"
      : isDragon
      ? "角向后舒展，须纹沿颊侧回旋。张开的口衔住一片暗影，石的静默里仍有昂扬之势。"
      : isHead
      ? "盘龙伏于拱面，石缘收住起伏的线条。绕过转角，另一道身影从明暗之间浮现。"
      : isFragment
      ? "断口切开字行，刻痕仍留在石上。绕过残缺的边缘，另一面渐渐显现。"
      : isModel
      ? "双兽相向，云纹绕额。竖列刻字穿过断裂的石面，磨损的边缘留住时间。"
      : "光擦过石面，刻痕显影。文字从沉默中被阅读，又在观看结束后重新隐入黑暗。";
    document.querySelector(".interaction-hint").lastChild.textContent = isRelief ? ` 数字作品 · ${year}` : isModel ? " 概念石刻 · 2026" : ` 虚构档案 · ${year}`;
    detailPage.dataset.work = work.dataset.model;
    document.querySelector('.view-modes [data-mode="trace"]').textContent = isRelief ? '浮雕' : '刻痕';
    document.querySelector('.view-modes [data-mode="text"]').textContent = isRelief ? '纹意' : '释文';
    detailPage.dataset.workNumber = number;
    artifactViewers.forEach(viewer => viewer.dispatchEvent(new Event("artifact:deactivate")));
    setPhotoMode("original");
    detailStone.querySelectorAll("img").forEach((item, index) => {
      item.src = image;
      if (index === 0) item.alt = `作品《${title}》全貌`;
    });
    document.querySelector(".detail-position span:first-child").textContent = number;
    document.querySelector(".detail-position span:last-child").textContent = String(artworkButtons.length).padStart(2, '0');
    document.querySelector('.work-chapters__edition').textContent = `${title} / ${year}`;
    document.querySelectorAll('[data-start-orbit], [data-orbit-chapter]').forEach(button => {
      button.dataset.detailTarget = isFloral ? 'floral-orbit' : isDragon ? 'dragon-orbit' : isHead ? 'head-orbit' : isFragment ? 'fragment-orbit' : 'work-orbit';
    });
    const detailsTitle = document.querySelector('#details-title');
    detailsTitle.textContent = isRelief ? '纹与石之间' : '字与石之间';
    detailsTitle.dataset.lettering = detailsTitle.textContent;
    window.applyLettering?.(detailsTitle);
    document.querySelector('#work-details .work-section-heading > p').innerHTML = isFloral
      ? '花开于石<br />双影相望' : isDragon
      ? '昂首无言<br />纹随势起' : isHead ? '盘曲有形<br />风化无声' : '一笔留下，<br />另一笔被时间带走。';
    document.querySelectorAll('.detail-study').forEach((figure, detailIndex) => {
      const item = images[detailIndex + 1];
      figure.querySelector('img').src = item.src;
      figure.querySelector('img').alt = item.alt;
      const expand = figure.querySelector('button');
      expand.title = `放大${item.label}细节`;
      expand.setAttribute('aria-label', expand.title);
      figure.querySelector('figcaption span').textContent = `0${detailIndex + 1} / ${item.label}`;
      figure.querySelector('figcaption p').textContent = item.note;
    });
    const next = artworkButtons[(index + 1) % artworkButtons.length];
    const nextButton = document.querySelector("[data-next-work]");
    nextButton.querySelector("span").textContent = next.querySelector("figcaption span").textContent;
    nextButton.querySelector("strong").textContent = next.querySelector("figcaption strong").textContent;
    nextButton.querySelector("strong").dataset.lettering = next.querySelector("figcaption strong").textContent;
    window.applyLettering?.(nextButton.querySelector("strong"));
}

document.querySelectorAll('.work, [data-route="detail"][data-model]').forEach((work) => {
  work.addEventListener("click", () => selectWork(work));
});

window.addEventListener("scroll", () => {
  document.body.classList.toggle("is-detail-scrolled", currentPage === "detail" && window.scrollY > 40);
}, {passive:true});

document.querySelector("[data-next-work]").addEventListener("click", () => {
  const index = artworkButtons.findIndex(work => work.dataset.model === detailPage.dataset.work);
  artworkButtons[(index + 1) % artworkButtons.length].click();
});

function updateLight(surface, event) {
  if (window.gsap) return;
  const rect = surface.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  surface.style.setProperty("--x", `${Math.max(0, Math.min(100, x))}%`);
  surface.style.setProperty("--y", `${Math.max(0, Math.min(100, y))}%`);
}

document.querySelectorAll("[data-light-surface]").forEach((surface) => {
  surface.addEventListener("pointermove", (event) => updateLight(surface, event));
  surface.addEventListener("pointerleave", () => {
    surface.style.setProperty("--x", "52%");
    surface.style.setProperty("--y", "46%");
  });
});

function setPhotoMode(mode) {
  document.querySelectorAll(".view-modes button").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelector(".detail__stone").dataset.mode = mode;
}

document.querySelectorAll(".view-modes button").forEach((button) => {
  button.addEventListener("click", () => setPhotoMode(button.dataset.mode));
});

document.querySelectorAll("[data-detail-target]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById(button.dataset.detailTarget).scrollIntoView({behavior:"smooth", block:"start"});
    if (button.hasAttribute("data-start-orbit")) document.getElementById(button.dataset.detailTarget).querySelector('[data-artifact-viewer]').dispatchEvent(new Event("artifact:activate"));
  });
});

const gallery = document.querySelector(".image-dialog");
let galleryIndex = 0;
function showGalleryImage(index) {
  const galleryImages = workImages[detailPage.dataset.work];
  galleryIndex = (index + galleryImages.length) % galleryImages.length;
  const item = galleryImages[galleryIndex];
  gallery.querySelector("img").src = item.src;
  gallery.querySelector("img").alt = item.alt;
  gallery.querySelector(".image-dialog__caption").textContent = item.caption;
  gallery.querySelector(".image-dialog__count").textContent = `0${galleryIndex + 1} / 03`;
}
document.querySelectorAll("[data-gallery-index]").forEach(button => {
  button.addEventListener("click", () => {
    showGalleryImage(Number(button.dataset.galleryIndex));
    gallery.showModal();
    document.body.classList.add("is-gallery-open");
  });
});
gallery.querySelector("[data-gallery-close]").addEventListener("click", () => gallery.close());
gallery.querySelector("[data-gallery-prev]").addEventListener("click", () => showGalleryImage(galleryIndex - 1));
gallery.querySelector("[data-gallery-next]").addEventListener("click", () => showGalleryImage(galleryIndex + 1));
gallery.addEventListener("close", () => document.body.classList.remove("is-gallery-open"));
gallery.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    showGalleryImage(galleryIndex + (event.key === "ArrowLeft" ? -1 : 1));
  }
});

function openDrawer() {
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-locked");
}

function closeDrawer() {
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  if (!about.classList.contains("is-open")) document.body.classList.remove("is-locked");
}

document.querySelector(".menu-button").addEventListener("click", openDrawer);
document.querySelector(".drawer-close").addEventListener("click", closeDrawer);

document.querySelectorAll(".about-trigger").forEach((button) => {
  button.addEventListener("click", () => {
    closeDrawer();
    about.classList.add("is-open");
    about.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-locked");
  });
});

document.querySelector(".about-close").addEventListener("click", () => {
  about.classList.remove("is-open");
  about.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-locked");
});

document.querySelector(".scroll-cue").addEventListener("click", () => {
  if (window.pageMotion?.enabled) { window.pageMotion.section(1); return; }
  document.querySelector(".statement").scrollIntoView({ behavior: "smooth" });
});

const soundToggle = document.querySelector(".sound-toggle");
let audioContext;
let ambienceGain;

function startAmbience() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  ambienceGain = audioContext.createGain();
  ambienceGain.gain.setValueAtTime(0, audioContext.currentTime);
  ambienceGain.gain.linearRampToValueAtTime(0.018, audioContext.currentTime + 1.4);
  ambienceGain.connect(audioContext.destination);

  [43, 64.5].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const toneGain = audioContext.createGain();
    oscillator.type = index ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    toneGain.gain.value = index ? 0.24 : 0.38;
    oscillator.connect(toneGain).connect(ambienceGain);
    oscillator.start();
  });
}

function stopAmbience() {
  if (!audioContext || !ambienceGain) return;
  ambienceGain.gain.cancelScheduledValues(audioContext.currentTime);
  ambienceGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);
  const closingContext = audioContext;
  setTimeout(() => closingContext.close(), 600);
  audioContext = undefined;
  ambienceGain = undefined;
}

soundToggle.addEventListener("click", () => {
  const next = soundToggle.getAttribute("aria-pressed") !== "true";
  soundToggle.setAttribute("aria-pressed", String(next));
  if (next) startAmbience();
  else stopAmbience();
});

let observer;
function observeReveals() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("is-visible");
    }),
    { threshold: 0.12 }
  );
  document.querySelectorAll(".page--active .reveal").forEach((element) => observer.observe(element));
}

if (matchMedia("(pointer: fine)").matches) {
  window.addEventListener("pointermove", (event) => {
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    cursor.style.opacity = "1";
  });
  document.querySelectorAll("button, [data-light-surface], [data-artifact-viewer]").forEach((target) => {
    target.addEventListener("pointerenter", () => cursor.classList.add("is-hover"));
    target.addEventListener("pointerleave", () => cursor.classList.remove("is-hover"));
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeDrawer();
  about.classList.remove("is-open");
  about.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-locked");
});

function openAddress() {
  const route = location.hash.slice(1);
  const model = route === 'floral' ? 'floral360' : route === 'dragon' ? 'dragon360' : route === 'head' ? 'head360' : ['fragment', 'work-04'].includes(route) ? 'fragment360'
    : ['stele', 'stele360', 'detail', 'work-03'].includes(route) ? 'stele360' : null;
  if (model) {
    selectWork(artworkButtons.find(work => work.dataset.model === model));
    showPage("detail", true);
  } else showPage(route.startsWith('work-') ? 'works' : ["home", "works", "name-gateway", "name"].includes(route) ? route : "home", true);
}

window.addEventListener("load", () => {
  openAddress();
  observeReveals();
  setTimeout(() => document.querySelector(".boot").classList.add("is-gone"), 1050);
});

window.addEventListener("hashchange", openAddress);
