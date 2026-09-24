import * as THREE from 'three';
import { PALETTE, ESB, NEEDLE, FOG_DENSITY } from './world.js';
import { rng, gauss, GLSL_NOISE, GLSL_FOG } from './util.js';

// Kinds of instance, read by the shader.
const KIND_BUILDING = 0;
const KIND_SPIRE = 1;
const KIND_ESB = 2;
const KIND_MAST = 3;

// Rows of the skyline, nearest first. Far rows fade into the fog, which is
// what gives the city depth rather than reading as a flat backdrop.
const ROWS = [
  { z: -34,  x0: -72,  x1: 72,  hBase: 2.2, hVar: 8,  fill: 0.92 },
  { z: -44,  x0: -88,  x1: 88,  hBase: 3.2, hVar: 16, fill: 0.95 },
  { z: -56,  x0: -104, x1: 104, hBase: 2.8, hVar: 14, fill: 0.9 },
  { z: -71,  x0: -125, x1: 125, hBase: 2.4, hVar: 12, fill: 0.82 },
  { z: -90,  x0: -150, x1: 150, hBase: 2.0, hVar: 10, fill: 0.72 },
  { z: -114, x0: -180, x1: 180, hBase: 1.6, hVar: 8,  fill: 0.6 },
];

// Manhattan core around the Empire State, a lower Seattle cluster around the
// Needle, open water between.
function heightProfile(x) {
  return 0.3 + 1.15 * gauss(x, ESB.x + 1, 22) + 0.45 * gauss(x, NEEDLE.x - 1, 19) + 0.22 * gauss(x, 44, 28);
}

// Empire State tiers as fractions of total height (443 m to the mast tip).
// Setbacks bunch in the bottom 13%, the shaft runs clean to 0.72, then the crown.
const ESB_TIERS = [
  [0.000, 0.068, 4.3, 0.55],
  [0.068, 0.106, 3.5, 0.58],
  [0.106, 0.135, 2.7, 0.62],
  [0.135, 0.722, 2.0, 0.70],
  [0.722, 0.745, 1.55, 0.72],
  [0.745, 0.845, 1.15, 0.74],
  [0.845, 0.880, 0.72, 0.78],
  [0.880, 0.912, 0.42, 0.85],
];

export function createCity({ mobile }) {
  const r = rng(20260924);
  const items = [];
  const beacons = [];

  const add = (x, y, z, w, h, d, kind, extra = {}) => {
    items.push({ x, y, z, w, h, d, kind, seed: r(), tint: extra.tint ?? 0, lit: extra.lit ?? 0.5 });
  };

  const rows = mobile ? ROWS.slice(0, 5) : ROWS;

  for (const row of rows) {
    let x = row.x0;
    while (x < row.x1) {
      const w = 1.2 + r() * 3.0;
      const d = 1.4 + r() * 3.2;
      const mid = x + w / 2;
      x += w + 0.15 + r() * 0.8;

      if (r() > row.fill) continue;
      // open water in front of the Needle, a clear face in front of the Empire State
      if (mid > NEEDLE.x - 9 && mid < NEEDLE.x + 9 && row.z > NEEDLE.z - 2) continue;
      if (Math.abs(mid - ESB.x) < w / 2 + 5.5 && row.z > ESB.z - 5) continue;

      const z = row.z + (r() - 0.5) * 2.4;
      const prof = heightProfile(mid);
      const h = Math.min(24, row.hBase + Math.pow(r(), 1.55) * row.hVar * prof);
      const tint = gauss(mid, NEEDLE.x, 34);
      const lit = 0.24 + r() * 0.4;

      add(mid, 0, z, w, h, d, KIND_BUILDING, { tint, lit });

      if (h > row.hBase + row.hVar * 0.45 && r() < 0.55) {
        const w2 = w * (0.45 + r() * 0.25);
        const d2 = d * (0.45 + r() * 0.25);
        const h2 = h * (0.16 + r() * 0.26);
        add(mid + (r() - 0.5) * 0.3, h, z, w2, h2, d2, KIND_BUILDING, { tint, lit });
        if (r() < 0.35) {
          const hs = 1.4 + r() * 4;
          add(mid, h + h2, z, 0.12, hs, 0.12, KIND_SPIRE, { tint });
          if (row.z > -80) beacons.push([mid, h + h2 + hs, z]);
        } else if (h + h2 > 15 && row.z > -80) {
          beacons.push([mid, h + h2 + 0.1, z]);
        }
      }
    }
  }

  // Empire State
  for (const [a, b, hw, dr] of ESB_TIERS) {
    const y0 = a * ESB.h, y1 = b * ESB.h;
    add(ESB.x, y0, ESB.z, hw * 2, y1 - y0, hw * 2 * dr, KIND_ESB, { lit: 0.74 });
  }
  add(ESB.x, 0.912 * ESB.h, ESB.z, 0.18, 0.088 * ESB.h, 0.18, KIND_MAST);
  beacons.push([ESB.x, ESB.h + 0.2, ESB.z]);
  beacons.push([NEEDLE.x, NEEDLE.h + 0.15, NEEDLE.z]);

  // --- instanced mesh -------------------------------------------------------
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);

  const n = items.length;
  const aSeed = new Float32Array(n);
  const aTint = new Float32Array(n);
  const aLit = new Float32Array(n);
  const aKind = new Float32Array(n);

  const material = createFacadeMaterial();
  const mesh = new THREE.InstancedMesh(box, material, n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  items.forEach((it, i) => {
    p.set(it.x, it.y, it.z);
    s.set(it.w, it.h, it.d);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    aSeed[i] = it.seed;
    aTint[i] = it.tint;
    aLit[i] = it.lit;
    aKind[i] = it.kind;
  });
  box.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  box.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 1));
  box.setAttribute('aLit', new THREE.InstancedBufferAttribute(aLit, 1));
  box.setAttribute('aKind', new THREE.InstancedBufferAttribute(aKind, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;

  return { mesh, material, beacons: createBeacons(beacons), count: n };
}

function createFacadeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:  { value: 0 },
      uPower: { value: 1 },
      uFacade: { value: PALETTE.facade },
      uStreet: { value: PALETTE.street },
      uWarm:  { value: PALETTE.warm },
      uFrost: { value: PALETTE.frost },
      uRose:  { value: PALETTE.rose },
      uIce:   { value: PALETTE.ice },
      uGlow:  { value: PALETTE.glow },
      uFloodY0: { value: 0.56 * ESB.h },
      uFloodY1: { value: 0.76 * ESB.h },
      uFogColor: { value: PALETTE.fog },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed, aTint, aLit, aKind;
      varying vec3 vObj, vNormal, vScale, vWorld;
      varying float vSeed, vTint, vLitA, vKind, vDepth;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vObj = position;
        vNormal = normal;
        vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vSeed = aSeed; vTint = aTint; vLitA = aLit; vKind = aKind;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPower, uFloodY0, uFloodY1;
      uniform vec3 uFacade, uStreet, uWarm, uFrost, uRose, uIce, uGlow;
      varying vec3 vObj, vNormal, vScale, vWorld;
      varying float vSeed, vTint, vLitA, vKind, vDepth;
      ${GLSL_NOISE}
      ${GLSL_FOG}

      void main() {
        vec3 n = normalize(vNormal);
        bool side = abs(n.y) < 0.5;
        bool esb = vKind > 1.5 && vKind < 2.5;

        // facade: moonlit from the upper left, lifted near the street by city glow
        vec3 base = uFacade * (abs(n.x) > 0.5 ? 0.72 : 1.0);
        base += uStreet * exp(-vWorld.y * 0.5) * 0.55;
        if (!side) base = uFacade * 1.25 + uGlow * 0.05;

        vec3 col = base;

        if (vKind > 2.5) {
          // Empire State mast, lit frost fading to rose at the tip
          float t = clamp(vObj.y, 0.0, 1.0);
          col = mix(uFrost, uRose, t) * (1.6 + t * 1.8) * uPower;
          gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
          return;
        }

        if (side && vKind < 0.5 || side && esb) {
          vec2 f = abs(n.x) > 0.5 ? vec2(vObj.z * vScale.z, vObj.y * vScale.y)
                                  : vec2(vObj.x * vScale.x, vObj.y * vScale.y);
          vec2 cellSize = esb ? vec2(0.15, 0.24) : vec2(0.22, 0.3);
          vec2 g = f / cellSize;
          vec2 cell = floor(g);
          vec2 fr = fract(g);
          vec2 fw = fwidth(g);

          float faceId = abs(n.x) > 0.5 ? 13.1 * sign(n.x) : 5.3 * sign(n.z);
          vec2 key = cell + vec2(vSeed * 97.0 + faceId, vSeed * 31.0);

          // window pane, antialiased
          float mx = esb ? 0.26 : 0.14;
          vec2 aa = fw * 1.5;
          float pane = smoothstep(mx - aa.x, mx + aa.x, fr.x) * (1.0 - smoothstep(1.0 - mx - aa.x, 1.0 - mx + aa.x, fr.x))
                     * smoothstep(0.3 - aa.y, 0.3 + aa.y, fr.y) * (1.0 - smoothstep(0.8 - aa.y, 0.8 + aa.y, fr.y));

          // occupancy, the power-on sweep, and a slow turnover of a few offices
          float h = hash12(key);
          float swap = step(hash12(key * 3.1), 0.08);
          float epoch = floor(uTime / 9.0 + hash12(key * 1.9) * 9.0);
          h = mix(h, hash12(key + epoch * 1.7), swap);
          float on = step(h, vLitA) * step(hash12(key * 1.7 + 4.2), uPower);
          on *= step(0.5, vWorld.y);                     // ground floor reads as lobby, not office

          float ch = hash12(key * 1.37 + 11.0);
          vec3 wc = mix(uWarm, uFrost, 0.35);
          if (ch > 0.84) wc = uRose;
          else if (ch < 0.06) wc = uIce;
          wc = mix(wc, uIce, vTint * 0.4 * step(0.5, hash12(key + 2.1)));
          float inten = (0.85 + 1.7 * pow(hash12(key * 2.9 + 1.3), 2.0)) * mix(0.4, 1.0, hash12(key * 5.3));

          vec3 lit = wc * inten * on * pane;

          // past a certain distance a window is smaller than a pixel: fade the
          // pattern to its average instead of letting it shimmer
          float detail = 1.0 - smoothstep(0.35, 0.95, max(fw.x, fw.y));
          vec3 avg = mix(uWarm, uFrost, 0.4) * vLitA * 0.48 * uPower;
          col += mix(avg, lit, detail);

          if (esb) {
            // the crown is floodlit rose from below, piers catching the light
            float flood = smoothstep(uFloodY0, uFloodY1, vWorld.y);
            float pier = 0.55 + 0.45 * smoothstep(0.15, 0.5, abs(fr.x - 0.5) * 2.0);
            col += uRose * flood * pier * 1.25 * uPower;
          }
        }

        // a faint roofline catching the sky glow gives each block a silhouette
        float roof = smoothstep(vScale.y - 0.08, vScale.y, vObj.y * vScale.y);
        col += uGlow * roof * 0.25;

        gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
      }
    `,
  });
}

function createBeacons(list) {
  const pos = new Float32Array(list.length * 3);
  const phase = new Float32Array(list.length);
  list.forEach((b, i) => {
    pos.set(b, i * 3);
    phase[i] = (i * 0.618) % 1;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uDpr: { value: 1 },
      uPower: { value: 1 },
      uColor: { value: PALETTE.beacon },
      uFogColor: { value: PALETTE.fog },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      uniform float uTime, uDpr;
      varying float vBlink, vDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        vBlink = pow(max(0.0, sin(uTime * 1.9 + aPhase * 6.2831)), 8.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(260.0 / vDepth, 2.0, 9.0) * uDpr;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPower;
      varying float vBlink, vDepth;
      ${GLSL_FOG}
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        vec3 c = uColor * (0.25 + vBlink * 4.5) * a * uPower;
        float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        gl_FragColor = vec4(c * (1.0 - f * 0.8), 1.0);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
