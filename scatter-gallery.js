(() => {
  const field = document.querySelector('.works-page .works-grid');
  if (!field || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fine = window.matchMedia('(pointer:fine)');
  if (!fine.matches) return;
  field.querySelectorAll('.work').forEach((card) => {
    const reset = () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--glow-x', '50%');
      card.style.setProperty('--glow-y', '50%');
    };
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty('--rx', `${(0.5 - y) * 9}deg`);
      card.style.setProperty('--ry', `${(x - 0.5) * 11}deg`);
      card.style.setProperty('--glow-x', `${x * 100}%`);
      card.style.setProperty('--glow-y', `${y * 100}%`);
    });
    card.addEventListener('pointerleave', reset);
    card.addEventListener('blur', reset, true);
  });
})();
