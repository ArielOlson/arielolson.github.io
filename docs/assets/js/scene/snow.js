import * as THREE from 'three';
import { PALETTE } from './world.js';
import { rng } from './util.js';

// Light snow drifting through the whole volume. Near flakes are soft and
// large, far ones pin-sharp, so it reads as depth rather than noise.
export function createSnow(count) {
  const r = rng(4242);
  const base = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  const phase = new Float32Array(count);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    base[i * 3] = (r() - 0.5) * 140;
    base[i * 3 + 1] = r() * 44;
    base[i * 3 + 2] = -70 + r() * 110;
    speed[i] = 0.35 + r() * 0.9;
    phase[i] = r() * 6.283;
    size[i] = 0.5 + r() * 1.1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uDpr: { value: 1 }, uColor: { value: PALETTE.frost } },
    vertexShader: /* glsl */ `
      attribute float aSpeed, aPhase, aSize;
      uniform float uTime, uDpr;
      varying float vA;
      void main() {
        vec3 p = position;
        p.y = mod(position.y - uTime * aSpeed, 44.0);
        p.x = mod(position.x + uTime * 0.3 + sin(uTime * 0.35 + aPhase) * 0.9 + 70.0, 140.0) - 70.0;
        p.z += cos(uTime * 0.28 + aPhase * 1.3) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float depth = -mv.z;
        vA = smoothstep(1.5, 7.0, depth) * (1.0 - smoothstep(55.0, 105.0, depth));
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * 110.0 / depth, 0.6, 5.5) * uDpr;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uColor * vA * 0.42 * smoothstep(0.5, 0.1, d), 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return { points, material };
}
