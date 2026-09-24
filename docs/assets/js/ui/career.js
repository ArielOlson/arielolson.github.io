// The career section pins and pans sideways as the page scrolls, with damping
// so the cards glide rather than snap. Narrow, short or reduced-motion
// viewports get a plain vertical list instead.

export function initCareer(reduced) {
  const section = document.getElementById('career');
  const track = document.getElementById('htrack');
  const bar = document.getElementById('hprogbar');
  let span = 0;
  let x = 0;

  const active = () => !reduced && window.innerWidth >= 760 && window.innerHeight >= 480;

  function measure() {
    if (!section || !track) return;
    if (!active()) {
      section.style.height = '';
      track.style.transform = '';
      span = 0;
      return;
    }
    span = Math.max(0, track.scrollWidth - window.innerWidth);
    section.style.height = window.innerHeight + span * 1.08 + 'px';
  }

  function update(dt) {
    if (!span) return;
    const r = section.getBoundingClientRect();
    const travel = section.offsetHeight - window.innerHeight;
    const p = travel > 0 ? Math.min(1, Math.max(0, -r.top / travel)) : 0;
    x += (-span * p - x) * (1 - Math.exp(-9 * dt));
    track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
    if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
  }

  measure();
  return { measure, update };
}
