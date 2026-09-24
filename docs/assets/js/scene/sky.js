import * as THREE from 'three';
import { PALETTE } from './world.js';
import { rng, GLSL_NOISE } from './util.js';

// Gradient dome. Near the horizon, toward the city, the sky picks up the rose
// cast of light bouncing off low cloud; overhead it falls to near black.
export function createSky() {
  const geo = new THREE.SphereGeometry(420, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith:  { value: PALETTE.zenith },
      uSky:     { value: PALETTE.sky },
      uHorizon: { value: PALETTE.horizon },
      uGlow:    { value: PALETTE.glow },
      uTime:    { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uSky, uHorizon, uGlow;
      uniform float uTime;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main() {
        float h = vDir.y;
        vec3 col = mix(uHorizon, uSky, smoothstep(-0.02, 0.2, h));
        col = mix(col, uZenith, smoothstep(0.18, 0.75, h));

        // light pollution: a low band, strongest over the city (toward -z)
        float toward = smoothstep(-0.35, 1.0, -vDir.z);
        float band = exp(-max(h, 0.0) * 13.0) * toward * 0.75;
        col += uGlow * band;

        // faint drifting cloud catching that glow
        vec2 cp = vDir.xz / max(h + 0.12, 0.05);
        float cloud = fbm(cp * 0.9 + vec2(uTime * 0.004, 0.0));
        col += uGlow * 0.35 * smoothstep(0.55, 0.85, cloud) * band;

        col = mix(col, uHorizon * 0.6, smoothstep(0.0, -0.1, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

export function createStars(count) {
  const r = rng(7331);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // upper hemisphere, thinning toward the horizon where the glow washes them out
    const u = r(), v = r();
    const theta = u * Math.PI * 2;
    const y = 0.08 + Math.pow(v, 0.7) * 0.92;
    const s = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(theta) * s * 380;
    pos[i * 3 + 1] = y * 380;
    pos[i * 3 + 2] = Math.sin(theta) * s * 380;
    seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uDpr: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uDpr;
      varying float vA;
      void main() {
        float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 2.2) + aSeed * 40.0);
        vA = tw * (0.25 + aSeed * 0.75) * smoothstep(20.0, 120.0, position.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.8 + aSeed * 1.6) * uDpr;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * vA * 1.4, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -9;
  return pts;
}
