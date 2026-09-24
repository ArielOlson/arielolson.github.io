import * as THREE from 'three';
import { PALETTE, NEEDLE, FOG_DENSITY } from './world.js';
import { GLSL_FOG } from './util.js';

// The Space Needle, as geometry. Proportions follow the real tower: 184 m to
// the tip, observation deck at 158 m (0.86 of the height), a top house wider
// than the tripod's footprint, legs that taper to a waist and flare again to
// carry the saucer.
export function createNeedle() {
  const H = NEEDLE.h;
  const group = new THREE.Group();
  group.position.set(NEEDLE.x, 0, NEEDLE.z);

  const metal = structureMaterial({ base: '#2A3242', up: '#C9B8C4', upFall: 0.075, rim: '#5B7898' });
  const topMetal = structureMaterial({ base: '#4A5264', up: '#DDE6F0', upFall: 0.0, rim: '#8AA4C0', upBoost: 0.06 });

  // --- legs: three pairs, hourglass profile -------------------------------
  const rBase = 0.118 * H, rWaist = 0.028 * H, rTop = 0.062 * H;
  const yWaist = 0.62 * H, yTop = 0.735 * H;
  const radiusAt = (y) => {
    if (y <= yWaist) return rWaist + (rBase - rWaist) * Math.pow(1 - y / yWaist, 1.6);
    const t = (y - yWaist) / (yTop - yWaist);
    return rWaist + (rTop - rWaist) * Math.pow(t, 1.5);
  };

  for (let leg = 0; leg < 3; leg++) {
    const theta = Math.PI / 2 + leg * (Math.PI * 2 / 3);
    for (const spread of [-0.085, 0.085]) {
      const a = theta + spread;
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const y = (i / 24) * yTop;
        const r = radiusAt(y);
        pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.13, 6, false);
      group.add(new THREE.Mesh(tube, metal));
    }
  }

  // waist collar and the SkyLine level ring at 100 ft
  const collar = new THREE.Mesh(new THREE.TorusGeometry(rWaist + 0.06, 0.09, 8, 48), metal);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = yWaist;
  group.add(collar);

  const skyline = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * H, 0.05 * H, 0.022 * H, 40), topMetal);
  skyline.position.y = 0.165 * H;
  group.add(skyline);
  const skylineWin = windowBand(0.0505 * H, 0.012 * H, 40, 0.9);
  skylineWin.position.y = 0.165 * H;
  group.add(skylineWin);

  // --- core ---------------------------------------------------------------
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.019 * H, 0.023 * H, 0.72 * H, 16), metal);
  core.position.y = 0.36 * H;
  group.add(core);

  // --- top house, lathed from its section ---------------------------------
  const section = [
    [0.020, 0.700], [0.060, 0.735], [0.100, 0.768], [0.128, 0.795],
    [0.136, 0.804], [0.132, 0.812], [0.106, 0.818], [0.100, 0.822],
    [0.100, 0.846], [0.086, 0.852], [0.060, 0.866], [0.030, 0.880],
    [0.012, 0.886],
  ].map(([r, y]) => new THREE.Vector2(r * H, y * H));
  const house = new THREE.Mesh(new THREE.LatheGeometry(section, 72), topMetal);
  group.add(house);

  // halo lip, lit ice blue the way the real one is lit at night
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.136 * H, 0.1, 8, 96),
    new THREE.MeshBasicMaterial({ color: PALETTE.ice.clone().multiplyScalar(3.2) })
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.804 * H;
  group.add(halo);

  // glazed observation level
  const glazing = windowBand(0.1015 * H, 0.022 * H, 96, 1.8);
  glazing.position.y = 0.834 * H;
  group.add(glazing);

  // --- mast ---------------------------------------------------------------
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0025 * H, 0.007 * H, 0.114 * H, 8), metal);
  mast.position.y = 0.886 * H + 0.057 * H;
  group.add(mast);

  // --- elevator cab riding the core ---------------------------------------
  const cab = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshBasicMaterial({ color: PALETTE.warm.clone().multiplyScalar(4) })
  );
  group.add(cab);

  const materials = [metal, topMetal, skylineWin.material, glazing.material];

  return {
    group,
    update(time, power) {
      const t = 0.5 - 0.5 * Math.cos((time / 26) * Math.PI * 2);
      cab.position.set(0, 0.03 * H + t * 0.66 * H, 0.027 * H);
      halo.material.color.copy(PALETTE.ice).multiplyScalar(3.2 * power);
      for (const m of materials) if (m.uniforms && m.uniforms.uPower) m.uniforms.uPower.value = power;
    },
  };
}

// Dark metal lit by a cool moon from the upper left, an uplight washing the
// base, a rim picking out the silhouette against the sky. Fogged to match the city.
function structureMaterial({ base, up, upFall, rim, upBoost = 0 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(base) },
      uUp: { value: new THREE.Color(up) },
      uRim: { value: new THREE.Color(rim) },
      uUpFall: { value: upFall },
      uUpBoost: { value: upBoost },
      uPower: { value: 1 },
      uMoon: { value: new THREE.Vector3(-0.5, 0.75, 0.3).normalize() },
      uFogColor: { value: PALETTE.fog },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN, vWorld;
      varying float vDepth;
      void main() {
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
      uniform float uUpFall, uUpBoost, uPower;
      varying vec3 vN, vWorld;
      varying float vDepth;
      ${GLSL_FOG}
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(cameraPosition - vWorld);
        float ndl = max(dot(n, uMoon), 0.0);
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 col = uBase * (0.3 + 0.7 * ndl);
        col += uUp * (exp(-vWorld.y * uUpFall) * 0.55 + uUpBoost) * uPower;
        col += uRim * rim * 0.9;
        gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
      }
    `,
  });
}

// A lit band of glazing with vertical mullions.
function windowBand(radius, height, segments, intensity) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, segments, 1, true);
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: PALETTE.warm },
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
        float mull = smoothstep(0.08, 0.2, abs(fract(vUv.x * ${segments.toFixed(1)}) - 0.5) * 2.0);
        vec3 col = uColor * uIntensity * mull * uPower;
        gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}
