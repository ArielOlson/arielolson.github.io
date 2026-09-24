import * as THREE from 'three';
import { PALETTE, NEEDLE, FOG_DENSITY } from './world.js';
import { GLSL_FOG } from './util.js';

// The Space Needle, built from its real proportions (fractions of the 605 ft
// height, measured off photographs). Victor Steinbrueck's hourglass tripod:
// three legs, each a pair of white members that split into an A at the ground,
// pinch in at a waist a little under halfway and lean back out to the top house.
// The top house, bottom to top: a ribbed white skirt, the restaurant glazing, the
// thin halo ring at the widest point (138 ft across), the observation deck glass,
// a sloped white roof, the cap drum with its lip, the lantern and the spire.
// The SkyLine level sits at 100 ft, a white disc wider than the legs around it.

const Y_TOP = 0.822;      // legs meet the skirt of the top house
const Y_WAIST = 0.47;
const R_BASE = 0.08;
const R_WAIST = 0.032;
const R_TOP = 0.05;

function legRadius(t) {
  if (t <= Y_WAIST) return R_WAIST + (R_BASE - R_WAIST) * Math.pow(1 - t / Y_WAIST, 1.25);
  return R_WAIST + (R_TOP - R_WAIST) * Math.pow((t - Y_WAIST) / (Y_TOP - Y_WAIST), 1.7);
}

// half the angle between the two members of one leg
function pairSpread(t) {
  if (t <= Y_WAIST) return 0.018 + 0.13 * Math.pow(1 - t / Y_WAIST, 1.6);
  return 0.018 + 0.11 * Math.pow((t - Y_WAIST) / (Y_TOP - Y_WAIST), 2.2);
}

// lathe sections, [radius, height] as fractions of H, from the bottom up
const SKIRT = [
  [0.000, 0.8175], [0.030, 0.818], [0.050, 0.8195], [0.064, 0.8245],
  [0.076, 0.831], [0.085, 0.839], [0.0895, 0.846], [0.091, 0.850],
];
const SLAB = [[0.084, 0.8497], [0.0925, 0.8497], [0.0925, 0.8515], [0.084, 0.8515]];
const HALO = [[0.086, 0.8655], [0.1165, 0.8662], [0.1172, 0.8683], [0.086, 0.8690]];
const ROOF = [
  [0.0895, 0.8855], [0.0895, 0.8875], [0.080, 0.8915], [0.066, 0.8975],
  [0.052, 0.9035], [0.041, 0.9085], [0.0375, 0.9105],
];
const CAP = [
  [0.0375, 0.9105], [0.0365, 0.919], [0.0372, 0.9235], [0.0425, 0.9262],
  [0.0425, 0.9282], [0.0300, 0.9290],
];
const LANTERN_ROOF = [[0.0285, 0.9375], [0.020, 0.9405], [0.008, 0.9435], [0.0, 0.9445]];

export function createNeedle() {
  const H = NEEDLE.h;
  const group = new THREE.Group();
  group.position.set(NEEDLE.x, 0, NEEDLE.z);

  const lathe = (pts, mat, segs = 96) =>
    new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, t]) => new THREE.Vector2(r * H, t * H)), segs), mat);

  // floodlit white paint; the skirt carries its radial ribs
  const legWhite = litMaterial({ base: '#E6E8EF', up: '#FFF1EA', flood: 0.8, fall: 0.008, under: 0.25, over: 0.1, rim: '#8FA4C2' });
  const skirtWhite = litMaterial({ base: '#EDEEF3', up: '#FFF3EC', flood: 0.12, fall: 0.0, under: 0.72, over: 0.0, rim: '#8FA4C2', ribs: 60 });
  const roofWhite = litMaterial({ base: '#E9EBF1', up: '#E6EEFF', flood: 0.1, fall: 0.0, under: 0.35, over: 0.48, rim: '#8FA4C2' });
  const dark = litMaterial({ base: '#262A34', up: '#C9B8C6', flood: 0.35, fall: 0.03, under: 0.2, over: 0.2, rim: '#3C4A62' });
  const lattice = litMaterial({ base: '#262A34', up: '#C9B8C6', flood: 0.3, fall: 0.03, under: 0.0, over: 0.0, rim: '#3C4A62', lattice: 6 });
  const materials = [legWhite, skirtWhite, roofWhite, dark, lattice];

  // --- the tripod ---------------------------------------------------------
  const MEMBER = 0.13;
  const legAngle = (leg) => Math.PI / 2 + leg * (Math.PI * 2 / 3);
  for (let leg = 0; leg < 3; leg++) {
    for (const sign of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const t = (i / 48) * (Y_TOP + 0.004);
        const a = legAngle(leg) + sign * pairSpread(t);
        const r = legRadius(t) * H;
        pts.push(new THREE.Vector3(Math.cos(a) * r, t * H, Math.sin(a) * r));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, MEMBER, 6, false);
      group.add(new THREE.Mesh(geo, legWhite));
    }
  }

  // ties from each leg back to the core, and across each leg's pair of members
  const tieR = 0.055;
  for (const t of [0.075, 0.33, Y_WAIST, 0.64]) {
    const y = t * H;
    const r = legRadius(t) * H;
    for (let leg = 0; leg < 3; leg++) {
      const a = legAngle(leg);
      const s = pairSpread(t);
      const outer = new THREE.Vector3(Math.cos(a) * r * Math.cos(s), y, Math.sin(a) * r * Math.cos(s));
      const inner = new THREE.Vector3(Math.cos(a) * 0.018 * H, y, Math.sin(a) * 0.018 * H);
      group.add(bar(inner, outer, tieR, legWhite));
      if (s > 0.04) {
        const p = new THREE.Vector3(Math.cos(a - s) * r, y, Math.sin(a - s) * r);
        const q = new THREE.Vector3(Math.cos(a + s) * r, y, Math.sin(a + s) * r);
        group.add(bar(p, q, tieR, legWhite));
      }
    }
  }

  // --- the SkyLine level at 100 ft ----------------------------------------
  group.add(lathe([
    [0.0, 0.158], [0.066, 0.158], [0.072, 0.161], [0.072, 0.166],
    [0.086, 0.1665], [0.086, 0.1705], [0.080, 0.1725], [0.0, 0.1735],
  ], roofWhite, 64));
  const skylineGlass = windowBand(0.071 * H, 0.0048 * H, 64, 0.95, PALETTE.warm);
  skylineGlass.position.y = 0.1635 * H;
  group.add(skylineGlass);

  // --- the core, with its elevators ---------------------------------------
  const coreMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * H, 0.019 * H, Y_TOP * H, 18), lattice);
  coreMesh.position.y = (Y_TOP * H) / 2;
  group.add(coreMesh);

  const cabMat = new THREE.MeshBasicMaterial({ color: '#FFC98A' });
  const cabs = [0, 1, 2].map((i) => {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.46, 0.16), cabMat);
    const a = legAngle(i) + Math.PI / 3;
    cab.position.set(Math.cos(a) * 0.02 * H, 0, Math.sin(a) * 0.02 * H);
    cab.rotation.y = -a + Math.PI / 2;
    group.add(cab);
    return { cab, period: 22 + i * 5, phase: i * 0.37 };
  });

  // --- the top house -------------------------------------------------------
  group.add(lathe(SKIRT, skirtWhite));
  group.add(lathe(SLAB, roofWhite));

  const restaurant = windowBand(0.0868 * H, 0.0145 * H, 120, 0.9, new THREE.Color('#FFB978'));
  restaurant.position.y = 0.8585 * H;
  group.add(restaurant);

  // the halo, the thin white ring at the widest point
  const haloMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
  group.add(lathe(HALO, haloMat, 128));

  const deck = windowBand(0.0858 * H, 0.0165 * H, 96, 0.34, PALETTE.ice);
  deck.position.y = 0.8772 * H;
  group.add(deck);

  group.add(lathe(ROOF, roofWhite));
  group.add(lathe(CAP, legWhite, 64));

  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * H, 0.03 * H, 0.0085 * H, 48), dark);
  lantern.position.y = 0.9332 * H;
  group.add(lantern);
  const lanternGlass = windowBand(0.0288 * H, 0.0042 * H, 48, 0.85, PALETTE.ice);
  lanternGlass.position.y = 0.9335 * H;
  group.add(lanternGlass);
  group.add(lathe(LANTERN_ROOF, dark, 48));

  // --- the spire ----------------------------------------------------------
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.0014 * H, 0.004 * H, 0.056 * H, 8), roofWhite);
  spire.position.y = 0.944 * H + 0.028 * H;
  group.add(spire);

  // --- the pavilion at the foot -------------------------------------------
  group.add(lathe([[0.0, 0.03], [0.108, 0.03], [0.114, 0.027], [0.114, 0.0]], dark, 64));
  const pavilionGlass = windowBand(0.1148 * H, 0.02 * H, 64, 0.9, PALETTE.warm);
  pavilionGlass.position.y = 0.012 * H;
  group.add(pavilionGlass);

  const bands = [skylineGlass, restaurant, deck, lanternGlass, pavilionGlass].map((m) => m.material);

  return {
    group,
    update(time, power) {
      for (const { cab, period, phase } of cabs) {
        // ride up, pause at the top, ride down, pause at the bottom
        const u = ((time / period) + phase) % 1;
        const k = u < 0.4 ? u / 0.4 : u < 0.5 ? 1 : u < 0.9 ? 1 - (u - 0.5) / 0.4 : 0;
        const e = k * k * (3 - 2 * k);
        cab.position.y = 0.04 * H + e * (Y_TOP - 0.06) * H;
      }
      // the halo is the brightest white on the tower, kept just under the bloom threshold
      haloMat.color.setScalar(0.2 + 0.88 * power);
      cabMat.color.set('#FFC98A').multiplyScalar(1.5 * power);
      for (const m of materials) m.uniforms.uPower.value = power;
      for (const m of bands) m.uniforms.uPower.value = power;
    },
  };
}

// A straight cylinder between two points.
function bar(a, b, radius, mat) {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 5), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

// Painted steel at night: a little moonlight, floodlights from the base that
// fade with height, undersides and tops that catch the lights around them, a
// cool rim against the sky. `ribs` scores radial fins into a lathe surface;
// `lattice` draws the core's X-bracing, lit by the stairs inside it.
// Kept under the bloom threshold, so the white reads as paint, not as a lamp.
function litMaterial({ base, up, flood, fall, under, over, rim, ribs = 0, lattice = 0 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(base) },
      uUp: { value: new THREE.Color(up) },
      uRim: { value: new THREE.Color(rim) },
      uFlood: { value: flood },
      uFall: { value: fall },
      uUnder: { value: under },
      uOver: { value: over },
      uPower: { value: 1 },
      uMoon: { value: new THREE.Vector3(-0.5, 0.75, 0.3).normalize() },
      uFogColor: { value: PALETTE.fog },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN, vWorld;
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uUp, uRim, uMoon;
      uniform float uFlood, uFall, uUnder, uOver, uPower;
      varying vec3 vN, vWorld;
      varying vec2 vUv;
      varying float vDepth;
      ${GLSL_FOG}
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(cameraPosition - vWorld);
        float ndl = max(dot(n, uMoon), 0.0);
        float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
        float lit = uFlood * exp(-max(vWorld.y, 0.0) * uFall)
                  + uUnder * max(-n.y, 0.0) + uOver * max(n.y, 0.0);
        vec3 col = uBase * (0.04 + 0.14 * ndl) + uBase * uUp * lit * uPower;
        ${ribs ? `
        // fins: shade between them, fade out before they alias
        float a = vUv.x * ${ribs.toFixed(1)};
        float w = fwidth(a);
        float fin = smoothstep(0.3, 0.5, abs(fract(a) - 0.5));
        col *= mix(1.0, mix(0.62, 1.0, fin), 1.0 - smoothstep(0.25, 0.6, w));
        ` : ''}
        ${lattice ? `
        float lu = vUv.x * ${lattice.toFixed(1)};
        float lv = vWorld.y / 0.62;
        float lw = fwidth(lu + lv) * 1.2;
        float x1 = smoothstep(0.43 - lw, 0.47, abs(fract(lu + lv) - 0.5));
        float x2 = smoothstep(0.43 - lw, 0.47, abs(fract(lu - lv) - 0.5));
        float brace = mix(max(x1, x2), 0.16, smoothstep(0.2, 0.5, lw));
        col += vec3(1.0, 0.8, 0.62) * brace * 0.3 * uPower;
        ` : ''}
        col += uRim * rim * 0.3;
        gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
      }
    `,
  });
}

// A lit band of glazing with mullions and a darker sill and head.
function windowBand(radius, height, segments, intensity, color) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, segments, 1, true);
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: color },
      uIntensity: { value: intensity },
      uPower: { value: 1 },
      uFogColor: { value: PALETTE.fog },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity, uPower;
      varying vec2 vUv;
      varying float vDepth;
      ${GLSL_FOG}
      void main() {
        float a = vUv.x * ${segments.toFixed(1)};
        float w = fwidth(a);
        float mull = mix(smoothstep(0.06, 0.18, abs(fract(a) - 0.5) * 2.0), 0.82, smoothstep(0.3, 0.7, w));
        float edge = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
        vec3 col = uColor * uIntensity * mull * mix(0.35, 1.0, edge) * uPower;
        gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}
