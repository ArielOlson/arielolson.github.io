import * as THREE from 'three';
import { PALETTE, FOG_DENSITY, NEEDLE } from './world.js';
import { rng, GLSL_FOG } from './util.js';
import {
  QUAY_Z, DRIVE, STREET_W, AVE_W, ROWS, X_LIMIT, LAND_FAR, PARK,
  blockZ, streetZ, avenueX, AVE_MIN, AVE_MAX, inPark, GLSL_GRID,
} from './grid.js';

// Life at street level: the ground the city stands on, the lamps along every
// street, the traffic running through them, the quay at the water's edge, and
// a couple of aircraft crossing overhead. Everything here reads its layout from
// grid.js, so it lines up with the buildings.

export function createStreets({ mobile }) {
  const rows = mobile ? 12 : ROWS;
  const farZ = blockZ(rows - 1)[1];
  const ground = createGround(mobile ? 5.2 : 2.6);
  const quay = createQuay();
  const lamps = createLamps(rows, farZ, mobile);
  const traffic = createTraffic(rows, farZ, mobile);
  const aircraft = createAircraft();

  const group = new THREE.Group();
  group.add(ground.mesh, quay, lamps.points, traffic.points, aircraft.points);

  return {
    group,
    pointMaterials: [lamps.points.material, traffic.points.material, aircraft.points.material],
    update(time, power) {
      ground.mesh.material.uniforms.uPower.value = power;
      lamps.points.material.uniforms.uPower.value = power;
      traffic.points.material.uniforms.uTime.value = time;
      traffic.points.material.uniforms.uPower.value = power;
      aircraft.update(time);
    },
  };
}

// --- ground ---------------------------------------------------------------

function createGround(lampStep) {
  const w = X_LIMIT * 2 + 80;
  const d = QUAY_Z - LAND_FAR;
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.02, (QUAY_Z + LAND_FAR) / 2);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPower: { value: 1 },
      uStep: { value: lampStep },
      uAsphalt: { value: PALETTE.asphalt },
      uPavement: { value: PALETTE.pavement },
      uPark: { value: PALETTE.park },
      uLamp: { value: PALETTE.lamp },
      uNeedle: { value: new THREE.Vector2(NEEDLE.x, NEEDLE.z) },
      uFogColor: { value: PALETTE.fog },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uPower, uStep;
      uniform vec3 uAsphalt, uPavement, uPark, uLamp;
      uniform vec2 uNeedle;
      varying vec3 vWorld;
      varying float vDepth;
      ${GLSL_GRID}
      ${GLSL_FOG}

      float band(float d, float hw, float aa) { return 1.0 - smoothstep(hw - aa, hw + aa, d); }
      // offset from the nearest of a row of lamps placed every stepv from origin
      float along(float v, float origin, float stepv) { return mod(v - origin + stepv * 0.5, stepv) - stepv * 0.5; }
      float pool(float a, float c) { return exp(-(a * a + c * c) * 3.2); }

      void main() {
        vec2 p = vWorld.xz;
        float aa = max(fwidth(p.x), fwidth(p.y)) * 0.8 + 0.01;
        bool park = inParkG(p);

        float sd = streetDist(p.y);
        float ad = avenueDist(p.x);
        float onDrive = step(p.y, DRIVE_NEAR) * step(DRIVE_FAR, p.y);
        float promenade = step(p.y, QUAY_Z) * step(DRIVE_NEAR, p.y);

        float road = max(max(band(sd, STREET_W * 0.5, aa), band(ad, AVE_W * 0.5, aa)), onDrive);
        float walk = max(band(sd, STREET_W * 0.5 + 0.3, aa), band(ad, AVE_W * 0.5 + 0.3, aa));
        if (park) { road = 0.0; walk = 0.0; }

        vec3 col = uPavement * 0.45;                      // block interiors, mostly under buildings
        col = mix(col, uPavement, max(walk, promenade));
        col = mix(col, uAsphalt, road);

        // a pool of light under every lamp, placed exactly where lamps.js puts them
        float poolS = pool(along(p.x, -X_LIMIT, uStep), sd - (STREET_W * 0.5 + 0.12));
        float poolA = pool(along(p.y, DRIVE_FAR, uStep), ad - (AVE_W * 0.5 + 0.12));
        float poolP = pool(along(p.x, -X_LIMIT, 1.7), p.y - (QUAY_Z - 0.18)) * 1.2;
        float poolD = pool(along(p.x, -X_LIMIT + 1.3, uStep), p.y - (DRIVE_FAR - 0.12));
        float pools = park ? 0.0 : max(max(poolS, poolA), max(poolP, poolD));
        col += uLamp * pools * 0.085 * uPower;
        // shop windows spill onto the pavement; traffic keeps the roads faintly lit
        col += vec3(1.0, 0.78, 0.58) * walk * (1.0 - road) * 0.018 * uPower;
        col += uLamp * road * 0.008 * uPower;
        float dash = step(0.5, fract(p.x / 1.1)) * band(sd, 0.035, aa) + step(0.5, fract(p.y / 1.1)) * band(ad, 0.035, aa)
                   + step(0.5, fract(p.x / 1.1)) * band(abs(p.y - (DRIVE_NEAR + DRIVE_FAR) * 0.5), 0.035, aa) * onDrive;
        col += uLamp * dash * road * 0.035 * uPower;

        // Seattle Center: dark lawn, a paved plaza round the Needle, lit paths out
        if (park) {
          col = uPark;
          vec2 q = p - uNeedle;
          float r = length(q);
          float plaza = 1.0 - smoothstep(4.6, 4.9, r);
          float ang = atan(q.y, q.x);
          float spoke = band(abs(sin(ang * 3.0 + 0.4)) * r, 0.35, aa * 2.0) * step(4.6, r);
          col = mix(col, uPavement, max(plaza, spoke));
          col += uLamp * 0.12 * uPower * exp(-pow(r - 4.75, 2.0) * 2.0);
        }

        gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh };
}

// The stone edge of the quay, its top catching the promenade lamps.
function createQuay() {
  const geo = new THREE.BoxGeometry(X_LIMIT * 2 + 80, 0.2, 0.45);
  geo.translate(0, 0.1, QUAY_Z + 0.22);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uStone: { value: new THREE.Color('#1A1B24') },
      uLamp: { value: PALETTE.lamp },
      uFogColor: { value: PALETTE.fog },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld, vN;
      varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vN = normal;
        vec4 mv = viewMatrix * wp; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uStone, uLamp;
      varying vec3 vWorld, vN;
      const float X_LIMIT = ${X_LIMIT.toFixed(1)};
      varying float vDepth;
      ${GLSL_FOG}
      void main() {
        // the lamps stand just behind the edge: a lit coping, a dim face below
        float lamp = pow(0.5 + 0.5 * cos((vWorld.x + X_LIMIT) * 6.2832 / 1.7), 4.0);
        vec3 col = uStone * (vN.y > 0.5 ? 1.4 : 0.7);
        col += uLamp * smoothstep(0.16, 0.2, vWorld.y) * (0.03 + 0.06 * lamp);
        col += uLamp * 0.022 * lamp * smoothstep(0.0, 0.2, vWorld.y);
        gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

// --- lamps ----------------------------------------------------------------

function createLamps(rows, farZ, mobile) {
  const r = rng(515);
  const pos = [], seed = [], kind = [];
  const step = mobile ? 5.2 : 2.6;
  const push = (x, y, z, k) => { pos.push(x, y, z); seed.push(r()); kind.push(k); };

  // cross streets, both kerbs
  for (let k = 0; k < rows - 1; k++) {
    const zc = streetZ(k);
    for (const side of [-1, 1]) {
      const z = zc + side * (STREET_W / 2 + 0.12);
      for (let x = -X_LIMIT; x <= X_LIMIT; x += step) {
        if (inPark(x, z, 0.4)) continue;
        push(x + (r() - 0.5) * 0.2, 0.42, z, 0);
      }
    }
  }
  // avenues, both kerbs
  for (let i = AVE_MIN; i <= AVE_MAX; i++) {
    const xc = avenueX(i);
    for (const side of [-1, 1]) {
      const x = xc + side * (AVE_W / 2 + 0.12);
      for (let z = DRIVE.far; z >= farZ; z -= step) {
        if (inPark(x, z, 0.4)) continue;
        push(x, 0.42, z + (r() - 0.5) * 0.2, 0);
      }
    }
  }
  // the waterfront: a close string of lamps along the promenade, and the drive's far kerb
  for (let x = -X_LIMIT; x <= X_LIMIT; x += 1.7) push(x, 0.55, QUAY_Z - 0.18, 1);
  for (let x = -X_LIMIT; x <= X_LIMIT; x += step) push(x + 1.3, 0.42, DRIVE.far - 0.12, 0);
  // Seattle Center: a ring round the Needle's plaza and lamps along the paths
  for (let a = 0; a < 28; a++) {
    const t = (a / 28) * Math.PI * 2;
    push(NEEDLE.x + Math.cos(t) * 4.9, 0.36, NEEDLE.z + Math.sin(t) * 4.9, 2);
  }
  for (let spoke = 0; spoke < 6; spoke++) {
    const t = spoke * (Math.PI / 3) - 0.4 / 3;             // on the paths the ground shader draws
    for (let d = 6.2; d < 11; d += 1.6) {
      const x = NEEDLE.x + Math.cos(t) * d, z = NEEDLE.z + Math.sin(t) * d;
      if (inPark(x, z)) push(x, 0.36, z, 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uDpr: { value: 1 },
      uPower: { value: 1 },
      uLamp: { value: PALETTE.lamp },
      uRose: { value: PALETTE.rose },
      uIce: { value: PALETTE.ice },
      uFogColor: { value: PALETTE.fog },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed, aKind;
      uniform float uDpr, uPower;
      uniform vec3 uLamp, uRose, uIce;
      varying vec3 vCol;
      varying float vDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        vec3 c = uLamp;
        if (aSeed > 0.9) c = mix(uLamp, uRose, 0.7);
        else if (aSeed < 0.04) c = mix(uLamp, uIce, 0.6);
        float big = aKind > 0.5 && aKind < 1.5 ? 1.5 : 1.0;
        // lamps come on in a wave behind the city's windows
        float on = step(aSeed * 0.8 + 0.1, uPower);
        vCol = c * (aKind > 0.5 && aKind < 1.5 ? 2.6 : 1.8) * on;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(190.0 * big / vDepth, 1.0, 7.0) * uDpr;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      varying float vDepth;
      ${GLSL_FOG}
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d);
        float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        gl_FragColor = vec4(vCol * a * (1.0 - f * 0.85), 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points };
}

// --- traffic --------------------------------------------------------------

// Each car runs its lane on a loop, drawn as a headlight coming toward the
// viewer or a taillight going away. Lanes stop at Seattle Center rather than
// driving through the plaza.
function createTraffic(rows, farZ, mobile) {
  const r = rng(808);
  const lanes = [];
  const lane = (x0, z0, x1, z1, type, spacing) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len > 2) lanes.push({ x0, z0, dx: (x1 - x0) / len, dz: (z1 - z0) / len, len, type, spacing });
  };
  const gap = mobile ? 1.8 : 1;

  // the waterfront drive, busiest of all
  lane(-X_LIMIT, -31.45, X_LIMIT, -31.45, 1, 2.3 * gap);
  lane(X_LIMIT, -32.15, -X_LIMIT, -32.15, 0, 2.3 * gap);

  // cross streets, cut where they meet the park
  for (let k = 0; k < rows - 1; k++) {
    const zc = streetZ(k);
    const through = zc < PARK.z1 && zc > PARK.z0;
    const spans = through ? [[-X_LIMIT, PARK.x0 - 0.6], [PARK.x1 + 0.6, X_LIMIT]] : [[-X_LIMIT, X_LIMIT]];
    for (const [a, b] of spans) {
      lane(a, zc - 0.3, b, zc - 0.3, 1, 4.6 * gap);
      lane(b, zc + 0.3, a, zc + 0.3, 0, 4.6 * gap);
    }
  }
  // avenues: headlights come toward the viewer, taillights head inland
  for (let i = AVE_MIN; i <= AVE_MAX; i++) {
    const xc = avenueX(i);
    const through = xc > PARK.x0 && xc < PARK.x1;
    const spans = through ? [[DRIVE.far, PARK.z1 + 0.6], [PARK.z0 - 0.6, farZ]] : [[DRIVE.far, farZ]];
    for (const [near, far] of spans) {
      lane(xc + 0.28, far, xc + 0.28, near, 1, 5 * gap);
      lane(xc - 0.28, near, xc - 0.28, far, 0, 5 * gap);
    }
  }

  // every car is a pair of lamps a car's width apart
  const start = [], dir = [], len = [], phase = [], speed = [], type = [], side = [];
  for (const L of lanes) {
    const n = Math.max(1, Math.floor(L.len / L.spacing));
    for (let c = 0; c < n; c++) {
      const ph = (c + r() * 0.6) / n;
      const sp = 2.2 + r() * 2.6;
      for (const sd of [-1, 1]) {
        start.push(L.x0, 0.17, L.z0);
        dir.push(L.dx, L.dz);
        len.push(L.len);
        phase.push(ph);
        speed.push(sp);
        type.push(L.type);
        side.push(sd);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(start, 3));
  geo.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
  geo.setAttribute('aLen', new THREE.Float32BufferAttribute(len, 1));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  geo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speed, 1));
  geo.setAttribute('aType', new THREE.Float32BufferAttribute(type, 1));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uDpr: { value: 1 },
      uPower: { value: 1 },
      uHead: { value: PALETTE.headlight },
      uTail: { value: PALETTE.taillight },
      uFogColor: { value: PALETTE.fog },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aDir;
      attribute float aLen, aPhase, aSpeed, aType, aSide;
      uniform float uTime, uDpr, uPower;
      uniform vec3 uHead, uTail;
      varying vec3 vCol;
      varying float vDepth;
      void main() {
        // steady progress plus a slow surge, so cars bunch and spread like traffic
        float s = mod(aPhase * aLen + uTime * aSpeed + 1.4 * sin(uTime * 0.37 + aPhase * 41.0), aLen);
        vec3 fwd = vec3(aDir.x, 0.0, aDir.y);
        vec3 across = vec3(-aDir.y, 0.0, aDir.x);
        vec3 p = position + fwd * s + across * aSide * 0.075;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDepth = -mv.z;
        // cars fade in and out at the ends of their lanes rather than popping
        float ends = smoothstep(0.0, 2.0, s) * smoothstep(0.0, 2.0, aLen - s);
        vCol = (aType > 0.5 ? uHead * 1.7 : uTail * 1.5) * ends * uPower;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((aType > 0.5 ? 95.0 : 80.0) / vDepth, 1.2, 4.0) * uDpr;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      varying float vDepth;
      ${GLSL_FOG}
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        gl_FragColor = vec4(vCol * smoothstep(0.5, 0.05, d) * (1.0 - f * 0.9), 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, count: type.length };
}

// --- aircraft -------------------------------------------------------------

// Two aircraft on long, slow passes: red port light, green starboard, white strobe.
function createAircraft() {
  const planes = [
    { y: 34, z: -120, period: 95, offset: 0, dir: 1 },
    { y: 48, z: -170, period: 140, offset: 60, dir: -1 },
  ];
  const n = planes.length * 3;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uDpr: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      uniform float uDpr;
      varying vec3 vCol;
      void main() {
        vCol = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 3.0 * uDpr;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vCol * smoothstep(0.5, 0.0, d), 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.layers.set(1);

  return {
    points,
    update(time) {
      planes.forEach((p, i) => {
        const t = ((time + p.offset) % p.period) / p.period;
        const x = p.dir * (-220 + t * 440);
        const o = i * 9;
        pos.set([x - 0.5 * p.dir, p.y, p.z + 0.3], o);
        pos.set([x + 0.5 * p.dir, p.y, p.z - 0.3], o + 3);
        pos.set([x, p.y + 0.12, p.z], o + 6);
        col.set([2.2, 0.12, 0.15], o);
        col.set([0.2, 2.0, 0.6], o + 3);
        const strobe = (time * 1.1 + i * 0.37) % 1 < 0.06 ? 6 : 0;
        col.set([strobe, strobe, strobe], o + 6);
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
    },
  };
}
