(() => {
  const root = document.getElementById('name-app');
  const message = root.querySelector('[data-name-load-message]');
  const retry = root.querySelector('[data-name-retry]');
  const entry = new URL('name-experience.js?v=name14', document.currentScript.src);
  let attempt = 0;
  async function load() {
    retry.hidden = true;
    message.textContent = '正在打开寻字体验…';
    try {
      const url = new URL(entry);
      if (attempt++) url.searchParams.set('retry', String(Date.now()));
      await import(url.href);
    } catch {
      message.textContent = location.protocol === 'file:'
        ? '请通过网站地址打开寻字体验。'
        : '寻字暂时未能载入，请重试。';
      retry.hidden = false;
    }
  }
  retry.addEventListener('click', load);
  load();
})();
