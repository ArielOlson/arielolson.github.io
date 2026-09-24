// Where everything sits, and the palette the scene is lit with.
// Units are loosely metres / 10. Camera looks toward -z; the ice runs from the
// viewer out to the waterfront at z = -32, the city climbs behind it.

import * as THREE from 'three';

export const PALETTE = {
  zenith:  new THREE.Color('#03050A'),
  sky:     new THREE.Color('#080C18'),
  horizon: new THREE.Color('#15111C'),
  glow:    new THREE.Color('#3A1828'),   // city light on low cloud, rose-leaning
  fog:     new THREE.Color('#110E18'),

  facade:  new THREE.Color('#0A0D16'),
  street:  new THREE.Color('#3A1A2C'),   // sodium-free, rose-tinted street glow
  warm:    new THREE.Color('#FFE6D2'),
  frost:   new THREE.Color('#F4F1F5'),
  rose:    new THREE.Color('#FF7FB0'),
  ice:     new THREE.Color('#7FD9F0'),
  beacon:  new THREE.Color('#FF3B52'),
  iceTint: new THREE.Color('#0A1322'),
};

export const FOG_DENSITY = 0.0094;

// New York stands nearest and brightest; Seattle further back and dimmer.
export const ESB    = { x: 8,   z: -40, h: 34 };
export const NEEDLE = { x: -30, z: -60, h: 27 };

export const WATERFRONT_Z = -32;
