import * as THREE from 'three';
import { PALETTE, FOG_DENSITY } from './world.js';
import { rng, smooth, GLSL_FOG } from './util.js';

// The blade trace. One ribbon, three figures:
//   0  a serpentine edge carved across the ice, beneath both skylines
//   1  the same line lifting off into a compounding curve
//   2  the figure eight, back down on the ice
// Morph runs 0 -> 1 -> 2 -> 0 as the story advances. uDraw carves the line on
// from its start; the head burns hot and throws up ice as it cuts.

const N = 720;

function shapeSerpentine(t) {
  return [-36 + t * 54, 0.05, -11 + Math.sin(t * Math.PI * 3) * 5.5];
}
function shapeGrowth(t) {
  const g = (Math.exp(2.9 * t) - 1) / (Math.exp(2.9) - 1);
  return [-22 + t * 44, 0.35 + g * 14, -16 + Math.sin(t * Math.PI) * 2.5];
}
function shapeFigureEight(t) {
  const th = t * Math.PI * 2;
  const den = 1 + Math.sin(th) * Math.sin(th);
  return [5 + (Math.cos(th) / den) * 13, 0.05, -7 + ((Math.sin(th) * Math.cos(th)) / den) * 20];
}
const SHAPES = [shapeSerpentine, shapeGrowth, shapeFigureEight];

function sampleShape(fn) {
  const pos = new Float32Array(N * 3);
  const tan = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const p = fn(t);
    const a = fn(Math.max(0, t - 0.0015));
    const b = fn(Math.min(1, t + 0.0015));
    let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    pos.set(p, i * 3);
    tan.set([dx / l, dy / l, dz / l], i * 3);
  }
  return { pos, tan };
}

export function createTrace() {
  const samples = SHAPES.map(sampleShape);

  // two vertices per sample, one each side of the line
  const V = N * 2;
  const attr = (k) => new Float32Array(V * k);
  const P = [attr(3), attr(3), attr(3)];
  const D = [attr(3), attr(3), attr(3)];
  const side = attr(1);
  const along = attr(1);
  for (let i = 0; i < N; i++) {
    for (let s = 0; s < 2; s++) {
      const v = i * 2 + s;
      for (let k = 0; k < 3; k++) {
        P[k].set(samples[k].pos.subarray(i * 3, i * 3 + 3), v * 3);
        D[k].set(samples[k].tan.subarray(i * 3, i * 3 + 3), v * 3);
      }
      side[v] = s === 0 ? -1 : 1;
      along[v] = i / (N - 1);
    }
  }
  const index = [];
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    index.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P[0], 3));
  geo.setAttribute('aP0', new THREE.BufferAttribute(P[0], 3));
  geo.setAttribute('aP1', new THREE.BufferAttribute(P[1], 3));
  geo.setAttribute('aP2', new THREE.BufferAttribute(P[2], 3));
  geo.setAttribute('aD0', new THREE.BufferAttribute(D[0], 3));
  geo.setAttribute('aD1', new THREE.BufferAttribute(D[1], 3));
  geo.setAttribute('aD2', new THREE.BufferAttribute(D[2], 3));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aT', new THREE.BufferAttribute(along, 1));
  geo.setIndex(index);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uMorph: { value: 0 },
      uDraw: { value: 0 },
      uWidth: { value: 0.1 },
      uFrost: { value: PALETTE.frost },
      uRose: { value: PALETTE.rose },
      uIce: { value: PALETTE.ice },
      uFogColor: { value: PALETTE.fog },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aP0, aP1, aP2, aD0, aD1, aD2;
      attribute float aSide, aT;
      uniform float uMorph, uWidth;
      varying float vT, vSide, vDepth;
      float ease(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
      void main() {
        float m = clamp(uMorph, 0.0, 3.0);
        vec3 p, d;
        if (m < 1.0)      { float k = ease(m);       p = mix(aP0, aP1, k); d = mix(aD0, aD1, k); }
        else if (m < 2.0) { float k = ease(m - 1.0); p = mix(aP1, aP2, k); d = mix(aD1, aD2, k); }
        else              { float k = ease(m - 2.0); p = mix(aP2, aP0, k); d = mix(aD2, aD0, k); }

        vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
        vec3 dv = (viewMatrix * vec4(d, 0.0)).xyz;
        vec3 c = cross(normalize(dv + 1e-5), vec3(0.0, 0.0, 1.0));
        float l = length(c);
        vec3 sideDir = l > 1e-4 ? c / l : vec3(1.0, 0.0, 0.0);

        // keep a minimum on-screen width so the line never breaks up in the distance
        float w = uWidth * (0.7 + 0.3 * sin(aT * 3.14159)) * max(1.0, -mv.z / 38.0);
        mv.xyz += sideDir * aSide * w;

        vT = aT; vSide = aSide; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uMorph, uDraw;
      uniform vec3 uFrost, uRose, uIce;
      varying float vT, vSide, vDepth;
      ${GLSL_FOG}
      void main() {
        if (vT > uDraw) discard;
        float m = uMorph;
        vec3 c = mix(uFrost, uRose, smoothstep(0.15, 0.95, m) * (1.0 - smoothstep(1.15, 1.85, m)));
        c = mix(c, uIce, smoothstep(1.45, 2.05, m) * (1.0 - smoothstep(2.45, 2.95, m)));

        float core = 1.0 - abs(vSide);
        float body = pow(core, 1.4);
        float gap = uDraw - vT;
        float head = exp(-gap * gap * 1600.0) * step(uDraw, 0.999);
        float tail = smoothstep(0.0, 0.02, vT);

        vec3 col = c * (1.8 * body + head * 9.0) * tail;
        float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        gl_FragColor = vec4(col * (1.0 - f * 0.85), 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  const spray = createSpray();

  // CPU copy of the morph, so the spray can be emitted from the blade's head
  const head = new THREE.Vector3();
  function headPosition(morph, draw) {
    const i = Math.min(N - 1, Math.max(0, Math.round(draw * (N - 1)))) * 3;
    const m = Math.min(3, Math.max(0, morph));
    let a, b, k;
    if (m < 1) { a = 0; b = 1; k = smooth(m); }
    else if (m < 2) { a = 1; b = 2; k = smooth(m - 1); }
    else { a = 2; b = 0; k = smooth(m - 2); }
    const A = samples[a].pos, B = samples[b].pos;
    head.set(A[i] + (B[i] - A[i]) * k, A[i + 1] + (B[i + 1] - A[i + 1]) * k, A[i + 2] + (B[i + 2] - A[i + 2]) * k);
    return head;
  }

  let lastDraw = 0;
  return {
    mesh,
    spray: spray.points,
    material,
    update(dt, morph, draw, animate) {
      material.uniforms.uMorph.value = morph;
      material.uniforms.uDraw.value = draw;
      const speed = (draw - lastDraw) / Math.max(dt, 1e-3);
      lastDraw = draw;
      // only a blade moving forward along the ice throws spray
      const onIce = morph < 0.35 || morph > 1.7;
      const rate = animate && onIce && speed > 0.02 && draw < 0.995 ? Math.min(420, speed * 900) : 0;
      spray.update(dt, rate, headPosition(morph, draw));
    },
  };
}

function createSpray() {
  const MAX = 420;
  const r = rng(99);
  const pos = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3);
  const age = new Float32Array(MAX).fill(1);
  const span = new Float32Array(MAX).fill(1);
  let cursor = 0, owed = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uDpr: { value: 1 }, uColor: { value: PALETTE.frost } },
    vertexShader: /* glsl */ `
      attribute float aLife;
      uniform float uDpr;
      varying float vL;
      void main() {
        vL = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aLife > 0.0 ? clamp(90.0 / -mv.z, 1.0, 6.0) * uDpr * (0.4 + aLife) : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vL;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5 || vL <= 0.0) discard;
        gl_FragColor = vec4(uColor * vL * 2.2 * smoothstep(0.5, 0.0, d), 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  return {
    points,
    update(dt, rate, from) {
      owed += rate * dt;
      while (owed >= 1) {
        owed -= 1;
        const i = cursor;
        cursor = (cursor + 1) % MAX;
        pos[i * 3] = from.x; pos[i * 3 + 1] = from.y + 0.05; pos[i * 3 + 2] = from.z;
        const a = r() * Math.PI * 2;
        const s = 0.6 + r() * 1.6;
        vel[i * 3] = Math.cos(a) * s;
        vel[i * 3 + 1] = 1.0 + r() * 2.2;
        vel[i * 3 + 2] = Math.sin(a) * s;
        age[i] = 0;
        span[i] = 0.5 + r() * 0.8;
      }
      for (let i = 0; i < MAX; i++) {
        if (age[i] >= span[i]) { life[i] = 0; continue; }
        age[i] += dt;
        vel[i * 3 + 1] -= 5.2 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] = Math.max(0.02, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        life[i] = Math.max(0, 1 - age[i] / span[i]);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aLife.needsUpdate = true;
    },
  };
}
