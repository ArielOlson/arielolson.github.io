// Where everything sits, and the palette the scene is lit with.
// Units are loosely metres / 10. Camera looks toward -z; the frozen harbour
// runs from the viewer to the quay at z = -30.2, the city climbs behind it.

import * as THREE from 'three';

export const PALETTE = {
  zenith:  new THREE.Color('#03050A'),
  sky:     new THREE.Color('#080C18'),
  horizon: new THREE.Color('#15111C'),
  glow:    new THREE.Color('#3A1828'),   // city light on low cloud, rose-leaning
  fog:     new THREE.Color('#110E18'),

  facade:  new THREE.Color('#0A0D16'),
  street:  new THREE.Color('#3A1A2C'),   // rose-tinted street glow on the lower floors
  warm:    new THREE.Color('#FFE6D2'),
  frost:   new THREE.Color('#F4F1F5'),
  rose:    new THREE.Color('#FF7FB0'),
  ice:     new THREE.Color('#7FD9F0'),
  beacon:  new THREE.Color('#FF3B52'),
  iceTint: new THREE.Color('#0A1322'),

  asphalt:  new THREE.Color('#0B0D13'),
  pavement: new THREE.Color('#15161E'),
  park:     new THREE.Color('#0A110F'),
  lamp:     new THREE.Color('#FFE2C6'),
  headlight: new THREE.Color('#F2F4FF'),
  taillight: new THREE.Color('#FF2E3E'),
};

export const FOG_DENSITY = 0.0094;

// New York stands nearest and brightest; Seattle further back and dimmer.
// Both sit on the street grid in grid.js: the Empire State inside one
// Manhattan block, the Needle at the centre of the Seattle Center superblock.
export const ESB    = { x: 8,     z: -45.35, h: 34 };
export const NEEDLE = { x: -28.4, z: -58.55, h: 26 };
