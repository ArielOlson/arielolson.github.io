// The street grid, shared by the buildings, the ground, the lamps and the traffic
// so they always agree. Blocks run in rows back from the waterfront; avenues run
// toward the viewer.
//
//   z   quay -30.2 | promenade | waterfront drive | block | street | block | ...
//   x   ... | avenue | block | avenue | block | ...

export const QUAY_Z = -30.2;                         // where the ice meets the land
export const DRIVE = { near: -30.8, far: -32.8 };    // the waterfront drive
export const BLOCK_D = 7.5;
export const STREET_W = 1.3;
export const PITCH_Z = BLOCK_D + STREET_W;           // 8.8
export const AVE_W = 1.2;
export const PITCH_X = 10.4;
export const AVE_ORIGIN = 13.2;                      // an avenue centre line
export const ROWS = 17;                              // block rows back to z ~ -182
export const X_LIMIT = 150;
export const LAND_FAR = -200;

// Seattle Center: a 2 x 2 superblock with the avenue and street through it removed
export const PARK = { x0: -38.2, x1: -18.6, z0: -66.7, z1: -50.4 };

export function blockZ(k) {
  const top = DRIVE.far - k * PITCH_Z;
  return [top, top - BLOCK_D];
}

// centre line of the street behind block k
export function streetZ(k) {
  return DRIVE.far - k * PITCH_Z - BLOCK_D - STREET_W / 2;
}

export function avenueX(i) {
  return AVE_ORIGIN + i * PITCH_X;
}

export const AVE_MIN = Math.ceil((-X_LIMIT - AVE_ORIGIN) / PITCH_X);
export const AVE_MAX = Math.floor((X_LIMIT - AVE_ORIGIN) / PITCH_X);

export function inPark(x, z, pad = 0) {
  return x > PARK.x0 - pad && x < PARK.x1 + pad && z > PARK.z0 - pad && z < PARK.z1 + pad;
}

// GLSL mirror of the same grid, for the ground shader
export const GLSL_GRID = /* glsl */ `
  const float QUAY_Z = ${QUAY_Z.toFixed(3)};
  const float DRIVE_NEAR = ${DRIVE.near.toFixed(3)};
  const float DRIVE_FAR = ${DRIVE.far.toFixed(3)};
  const float BLOCK_D = ${BLOCK_D.toFixed(3)};
  const float STREET_W = ${STREET_W.toFixed(3)};
  const float PITCH_Z = ${PITCH_Z.toFixed(3)};
  const float AVE_W = ${AVE_W.toFixed(3)};
  const float PITCH_X = ${PITCH_X.toFixed(3)};
  const float AVE_ORIGIN = ${AVE_ORIGIN.toFixed(3)};
  const float X_LIMIT = ${X_LIMIT.toFixed(3)};
  const vec4 PARK = vec4(${PARK.x0.toFixed(3)}, ${PARK.x1.toFixed(3)}, ${PARK.z0.toFixed(3)}, ${PARK.z1.toFixed(3)});

  bool inParkG(vec2 p) {
    return p.x > PARK.x && p.x < PARK.y && p.y > PARK.z && p.y < PARK.w;
  }
  // signed distance from the nearest cross street's centre line, and that street's half width
  float streetDist(float z) {
    float u = DRIVE_FAR - z;                       // 0 at the drive's far edge, grows inland
    float m = mod(u - (BLOCK_D + STREET_W * 0.5) + PITCH_Z * 0.5, PITCH_Z) - PITCH_Z * 0.5;
    return abs(m);
  }
  float avenueDist(float x) {
    float m = mod(x - AVE_ORIGIN + PITCH_X * 0.5, PITCH_X) - PITCH_X * 0.5;
    return abs(m);
  }
`;
