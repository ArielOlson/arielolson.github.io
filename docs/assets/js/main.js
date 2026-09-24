// Entry point. Page behaviour lives in ui/, the WebGL scene in scene/.
// The scene is imported dynamically, so if WebGL is missing or fails the page
// still works in full and falls back to a CSS gradient.

import { initReveals } from './ui/reveal.js';
import { initCareer } from './ui/career.js';
import { initType } from './ui/type.js';
import { initSpotlight } from './ui/spotlight.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rail = document.getElementById('rail');
const stage = document.getElementById('stage');
const canvas = document.getElementById('gl');

initReveals(reduced);
initSpotlight();
const career = initCareer(reduced);
const type = initType(reduced);

let scene = null;

function fallback() {
  stage.classList.add('no-gl');
  canvas.style.display = 'none';
  scene = null;
}

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

// One retry: a dropped connection on a phone should not cost the scene for the whole visit.
const loadScene = () =>
  import('./scene/index.js').catch(
    // a fresh URL, since browsers may cache the failed fetch under the original one
    () => new Promise((resolve) => setTimeout(resolve, 1200)).then(() => import('./scene/index.js?retry'))
  );

if (hasWebGL2()) {
  loadScene()
    .then(({ startScene }) => {
      scene = startScene({
        canvas,
        reduced,
        onFirstFrame: () => stage.classList.add('ready'),
        onLost: fallback,
      });
    })
    .catch((err) => {
      console.warn('3D scene unavailable, using the static background.', err);
      fallback();
    });
} else {
  fallback();
}

// A reading panel is opaque in its middle; when one fills the viewport the
// scene behind it can be drawn at a lower rate.
const panels = [...document.querySelectorAll('.band.solid')];
function covered() {
  const vh = window.innerHeight;
  for (const el of panels) {
    const r = el.getBoundingClientRect();
    const inset = r.height * 0.12;
    if (r.top + inset <= 0 && r.bottom - inset >= vh) return true;
  }
  return false;
}

// One loop drives everything. Scroll is read here once per frame rather than
// from a scroll listener.
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
  last = now;

  const y = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  rail.style.transform = 'scaleX(' + (max > 0 ? y / max : 0).toFixed(4) + ')';

  career.update(dt);
  type.update();
  if (scene) scene.update(dt, y, covered());
}
requestAnimationFrame(frame);

function relayout() {
  career.measure();
  if (scene) scene.layout();
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    career.measure();
    if (scene) scene.resize();
  }, 120);
}, { passive: true });

window.addEventListener('load', relayout);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
