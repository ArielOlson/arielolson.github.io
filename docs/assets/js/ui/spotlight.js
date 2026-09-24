// Case cards pick up a soft light under the pointer: feedback that the card
// is the thing being looked at. Pointer events only; nothing runs on scroll.

export function initSpotlight() {
  const grid = document.querySelector('.workgrid');
  if (!grid || !matchMedia('(hover: hover)').matches) return;
  grid.addEventListener('pointermove', (e) => {
    const card = e.target.closest('.case');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', e.clientX - r.left + 'px');
    card.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });
}
