import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { PALETTE, FOG_DENSITY } from './world.js';
import { GLSL_NOISE } from './util.js';

// A sheet of black ice: a true mirror of the scene, broken up by frost, fine
// scratches and the faint arcs of old blade marks, with the reflection
// strengthening toward grazing angles the way it does on real ice.
const IceShader = {
  name: 'IceShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uReflect: { value: 1 },
    uTint: { value: PALETTE.iceTint },
    uGlow: { value: PALETTE.glow },
    uFogColor: { value: PALETTE.fog },
    uFogDensity: { value: FOG_DENSITY },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vProj;
    varying vec3 vWorld;
    varying float vDepth;
    void main() {
      vProj = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 color, uTint, uGlow, uFogColor;
    uniform float uTime, uReflect, uFogDensity;
    varying vec4 vProj;
    varying vec3 vWorld;
    varying float vDepth;
    ${GLSL_NOISE}

    // a thin bright line where |d| is near zero
    float etch(float d, float w) { return 1.0 - smoothstep(0.0, w, abs(d)); }

    void main() {
      vec2 p = vWorld.xz;
      float frost = fbm(p * 0.22);
      float fine  = fbm(p * 2.4 + 9.0);

      // long directional scratches
      vec2 q = vec2(p.x * 0.9 + p.y * 0.4, p.y * 7.0);
      float scratch = smoothstep(0.78, 0.98, vnoise(q)) * smoothstep(0.4, 0.8, fine);

      // arcs left by earlier skaters
      float arcs = 0.0;
      arcs += etch(length(p - vec2(-6.0, -4.0)) - 9.0 + fbm(p * 0.6) * 0.6, 0.05);
      arcs += etch(length(p - vec2(11.0, 2.0)) - 6.5 + fbm(p * 0.7) * 0.5, 0.04);
      arcs += etch(length(p - vec2(-18.0, 8.0)) - 12.0 + fbm(p * 0.5) * 0.8, 0.05);
      arcs *= smoothstep(-26.0, -6.0, p.y) * (1.0 - smoothstep(12.0, 30.0, p.y));

      // reflection, disturbed by the surface
      vec2 wob = (vec2(fbm(p * 0.7 + 3.1), fbm(p * 0.7 - 7.3)) - 0.5) * 0.05;
      wob += (vec2(fine) - 0.5) * 0.006;
      vec4 uv = vProj;
      uv.xy += wob * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb * uReflect;

      vec3 view = normalize(cameraPosition - vWorld);
      float fres = 0.1 + 0.5 * pow(1.0 - clamp(view.y, 0.0, 1.0), 3.0);

      vec3 col = uTint * (0.55 + 0.9 * frost);
      col += refl * fres * (0.55 + 0.35 * frost);
      col += uGlow * 0.08 * scratch;
      col += vec3(0.75, 0.85, 1.0) * arcs * 0.05;

      float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
      col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createIce({ width, height, quality }) {
  const geo = new THREE.PlaneGeometry(720, 720);
  const ice = new Reflector(geo, {
    clipBias: 0.003,
    textureWidth: Math.max(256, Math.round(width * quality)),
    textureHeight: Math.max(256, Math.round(height * quality)),
    color: 0xffffff,
    multisample: 0,
    shader: IceShader,
  });
  ice.rotation.x = -Math.PI / 2;
  ice.position.set(0, 0, -60);

  return {
    mesh: ice,
    setSize(w, h, q) {
      ice.getRenderTarget().setSize(Math.max(256, Math.round(w * q)), Math.max(256, Math.round(h * q)));
    },
    update(time) {
      ice.material.uniforms.uTime.value = time;
    },
  };
}
