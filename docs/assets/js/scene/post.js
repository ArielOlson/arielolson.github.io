import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Safety net ahead of bloom. Bloom's blur spreads any invalid pixel into a black
// square, so NaN or Inf is replaced and runaway values are capped before it runs.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = clamp(c, 0.0, 48.0);
    }
  `,
};

// render -> sanitise -> bloom (linear HDR, so only genuine light sources glow)
//        -> output (tone mapping + sRGB)
//        -> finish (vignette, a trace of chromatic aberration, film grain)
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.36 },
    uAberr: { value: 0.0012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uAberr;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uAberr * 8.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col *= 1.0 - uVignette * smoothstep(0.08, 0.62, r2 * 1.5);
      col += (hash(vUv * uRes + fract(uTime * 7.0) * 113.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPost(renderer, scene, camera, { width, height, dpr, samples }) {
  const target = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
    type: THREE.HalfFloatType,
    samples,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);

  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(SanitizeShader));

  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.7, 0.55, 1.15);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

  return {
    composer,
    bloom,
    finish,
    setSize(w, h, d) {
      composer.setPixelRatio(d);
      composer.setSize(w, h);
      finish.uniforms.uRes.value.set(w * d, h * d);
    },
    render(time) {
      finish.uniforms.uTime.value = time;
      composer.render();
    },
  };
}
