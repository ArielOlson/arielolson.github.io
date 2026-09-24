import * as THREE from 'three';
import { PALETTE, FOG_DENSITY } from './world.js';
import { createSky, createStars } from './sky.js';
import { createCity } from './city.js';
import { createNeedle } from './landmarks.js';
import { createIce } from './ice.js';
import { createTrace } from './trace.js';
import { createSnow } from './snow.js';
import { createPost } from './post.js';
import { createStory, SHOTS } from './story.js';
import { damp, clamp01, easeOutCubic, easeInOutCubic } from './util.js';

const INTRO_DOLLY = [0, 7, 30];   // the establishing shot starts further out and higher

export function startScene({ canvas, reduced, onFirstFrame, onLost }) {
  const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  let dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  let width = window.innerWidth;
  let height = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral keeps the rose and ice on-hue; filmic curves drift saturated pink toward orange.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(PALETTE.zenith, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(PALETTE.fog, FOG_DENSITY);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 900);

  const sky = createSky();
  const stars = createStars(mobile ? 700 : 1600);
  const city = createCity({ mobile });
  const needle = createNeedle();
  const trace = createTrace();
  const snow = createSnow(mobile ? 900 : 2400);
  const iceQuality = mobile ? 0.3 : 0.5;
  const ice = createIce({ width: width * dpr, height: height * dpr, quality: iceQuality });

  scene.add(sky, stars, city.mesh, city.beacons, needle.group, ice.mesh, trace.mesh, trace.spray, snow.points);

  const post = createPost(renderer, scene, camera, { width, height, dpr, samples: mobile ? 0 : 4 });

  const pointMats = [stars.material, city.beacons.material, snow.material, trace.spray.material];
  function applyDpr() {
    for (const m of pointMats) m.uniforms.uDpr.value = dpr;
  }
  applyDpr();

  const story = createStory(SHOTS);
  story.layout();

  // --- state --------------------------------------------------------------
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const target = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let time = 0, morph = 0, draw = reduced ? 1 : 0, power = reduced ? 1 : 0;
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  let frame = 0, perfSum = 0, perfCount = 0, degraded = false;

  const first = story.sample(0);
  cam.pos.fromArray(first.pos);
  cam.look.fromArray(first.look);
  if (!reduced) cam.pos.add(new THREE.Vector3().fromArray(INTRO_DOLLY));
  morph = first.morph;

  if (!mobile && !reduced) {
    window.addEventListener('pointermove', (e) => {
      tmx = e.clientX / window.innerWidth - 0.5;
      tmy = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    onLost?.();
  });

  function fovFor(aspect) {
    return aspect < 0.8 ? 68 : aspect < 1.25 ? 56 : 45;
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    camera.aspect = width / height;
    camera.fov = fovFor(camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    post.setSize(width, height, dpr);
    ice.setSize(width * dpr, height * dpr, iceQuality);
    applyDpr();
    story.layout();
    if (reduced) renderStatic();
  }
  camera.fov = fovFor(camera.aspect);
  camera.updateProjectionMatrix();
  post.setSize(width, height, dpr);

  function place() {
    camera.position.set(cam.pos.x + mx * 1.4, cam.pos.y - my * 0.8, cam.pos.z);
    camera.lookAt(cam.look);
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
  }

  function renderStatic() {
    const s = story.sample(0);
    cam.pos.fromArray(s.pos);
    cam.look.fromArray(s.look);
    place();
    trace.update(0.016, 0, 1, false);
    needle.update(0, 1);
    post.render(0);
  }

  let firstFramed = false;
  function markFirst() {
    if (!firstFramed) {
      firstFramed = true;
      onFirstFrame?.();
    }
  }

  function update(dt, scrollY, covered) {
    if (reduced) return;
    time += dt;
    frame++;

    // intro: the city switches on window by window while the camera dollies in
    const intro = easeOutCubic(clamp01((time - 0.15) / 3.4));
    power = easeInOutCubic(clamp01((time - 0.3) / 2.6));
    const introDraw = easeInOutCubic(clamp01((time - 1.1) / 2.4));

    const shot = story.sample(scrollY);
    target.pos.fromArray(shot.pos).addScaledVector(new THREE.Vector3().fromArray(INTRO_DOLLY), 1 - intro);
    target.look.fromArray(shot.look);

    cam.pos.x = damp(cam.pos.x, target.pos.x, 2.4, dt);
    cam.pos.y = damp(cam.pos.y, target.pos.y, 2.4, dt);
    cam.pos.z = damp(cam.pos.z, target.pos.z, 2.4, dt);
    cam.look.x = damp(cam.look.x, target.look.x, 2.8, dt);
    cam.look.y = damp(cam.look.y, target.look.y, 2.8, dt);
    cam.look.z = damp(cam.look.z, target.look.z, 2.8, dt);
    mx = damp(mx, tmx, 2.0, dt);
    my = damp(my, tmy, 2.0, dt);

    morph = damp(morph, shot.morph, 3.0, dt);
    draw = damp(draw, Math.min(shot.draw, introDraw), 3.4, dt);

    place();

    city.material.uniforms.uTime.value = time;
    city.material.uniforms.uPower.value = power;
    city.beacons.material.uniforms.uTime.value = time;
    city.beacons.material.uniforms.uPower.value = power;
    stars.material.uniforms.uTime.value = time;
    sky.material.uniforms.uTime.value = time;
    snow.material.uniforms.uTime.value = time;
    needle.update(time, power);
    ice.update(time);
    trace.update(dt, morph, draw, true);

    // behind an opaque reading panel the scene barely shows; draw it less often
    if (covered && frame % 3 !== 0) return;

    const t0 = performance.now();
    post.render(time);
    markFirst();

    // if the device cannot keep up after the intro, step the resolution down once
    if (!degraded && time > 4 && time < 9) {
      perfSum += performance.now() - t0 + dt * 1000 * 0.5;
      perfCount++;
    } else if (!degraded && time >= 9 && perfCount > 30) {
      if (perfSum / perfCount > 30 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.4);
        degraded = true;
        resize();
      }
      perfCount = -1;
    }
  }

  if (reduced) {
    renderStatic();
    markFirst();
  }

  // Development hook for rendering the social card from the live scene.
  if (new URLSearchParams(location.search).has('capture')) {
    window.__scene = { renderer, post, story, cam, place, get power() { return power; } };
  }

  return { update, resize, layout: () => story.layout() };
}
