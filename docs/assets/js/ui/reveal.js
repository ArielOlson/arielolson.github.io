// Sections ease in as they arrive; grids cascade. Anything already on screen
// at load is left alone, so the first view is never blank.

export function initReveals(reduced) {
  const reveals = [...document.querySelectorAll('[data-reveal]')];
  const counters = [...document.querySelectorAll('.cnt')];
  if (reduced || !('IntersectionObserver' in window)) return;

  const kids = (el) => [...el.children];

  for (const el of reveals) {
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.92) continue;
    if (el.hasAttribute('data-stagger')) kids(el).forEach((k) => k.classList.add('rv-hide'));
    else el.classList.add('rv-hide');
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      const targets = el.hasAttribute('data-stagger') ? kids(el) : [el];
      targets.forEach((k, i) => {
        k.style.transitionDelay = i * 60 + 'ms';
        k.classList.remove('rv-hide');
        k.classList.add('rv-in');
      });
      io.unobserve(el);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  reveals.forEach((el) => io.observe(el));

  // figures count up when they first come into view
  const cio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      countUp(e.target);
      cio.unobserve(e.target);
    }
  }, { threshold: 0.6 });
  counters.forEach((el) => cio.observe(el));
}

function countUp(el) {
  const to = parseFloat(el.dataset.to);
  if (!Number.isFinite(to)) return;
  const pre = el.dataset.pre || '';
  const dur = 1200;
  let t0 = 0;
  el.textContent = pre + '0';
  const step = (now) => {
    if (!t0) t0 = now;
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = pre + Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
