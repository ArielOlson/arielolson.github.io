import { smooth, lerp } from './util.js';

// One camera shot per section of the page. Each is anchored to the section
// itself (its start, centre or end reaching the viewport), not to a fixed
// scroll percentage, so the choreography survives any change to the content.
//
//   pos / look   camera position and target
//   morph        0 serpentine, 1 compounding curve, 2 figure eight, 3 serpentine again
//   draw         how much of the trace is carved (0 erases it, 1 draws it whole)
export const SHOTS = [
  // both skylines across the ice, an establishing shot
  { id: 'hero',        at: 'start',  pos: [0, 4.6, 30],    look: [-4, 7.5, -40],  morph: 0,    draw: 1 },
  // push in as the line lifts into a growth curve
  { id: 'profile',     at: 'center', pos: [-2, 5.2, 17],   look: [0, 8.5, -22],   morph: 1,    draw: 1 },
  // New York now: the Empire State to the right of the text
  { id: 'now',         at: 'center', pos: [-10, 6, 10],    look: [-2, 14, -40],   morph: 1,    draw: 1 },
  // Seattle before: across the water to the Needle
  { id: 'practice',    at: 'center', pos: [-44, 5, -8],    look: [-30, 12, -60],  morph: 1,    draw: 1 },
  // rise for an overview while the work is discussed
  { id: 'work',        at: 'center', pos: [-18, 14, 12],   look: [-4, 6, -32],    morph: 1.35, draw: 1 },
  // overhead, the figure eight on the ice
  { id: 'ice',         at: 'center', pos: [-16, 22, 14],   look: [-4, 0, -6],     morph: 2,    draw: 1 },
  // the career path as one lateral move, west to east
  { id: 'career',      at: 'start',  pos: [-58, 6, 8],     look: [-36, 9, -52],   morph: 2.5,  draw: 1 },
  { id: 'career',      at: 'end',    pos: [34, 6, 8],      look: [12, 11, -42],   morph: 3,    draw: 1 },
  // the line is lifted off the ice here, so it can be cut again
  { id: 'credentials', at: 'center', pos: [8, 7, 20],      look: [2, 10, -40],    morph: 3,    draw: 0 },
  // pull back high and wide; the blade re-cuts from the Needle to the Empire State
  { id: 'contact',     at: 'center', pos: [0, 17, 46],     look: [-8, 8, -46],    morph: 3,    draw: 1 },
];

export function createStory(shots = SHOTS) {
  let anchors = [];

  function layout() {
    const vh = window.innerHeight;
    const max = Math.max(0, document.documentElement.scrollHeight - vh);
    anchors = [];
    for (const s of shots) {
      const el = document.getElementById(s.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      let y = top + r.height / 2 - vh / 2;
      if (s.at === 'start') y = top;
      if (s.at === 'end') y = top + r.height - vh;
      anchors.push({ y: Math.min(max, Math.max(0, y)), s });
    }
    for (let i = 1; i < anchors.length; i++) {
      if (anchors[i].y <= anchors[i - 1].y) anchors[i].y = anchors[i - 1].y + 1;
    }
  }

  const out = { pos: [0, 0, 0], look: [0, 0, 0], morph: 0, draw: 1 };

  function sample(scrollY) {
    if (!anchors.length) return out;
    let i = 0;
    while (i < anchors.length - 1 && scrollY > anchors[i + 1].y) i++;
    const a = anchors[i];
    const b = anchors[Math.min(i + 1, anchors.length - 1)];
    const span = b.y - a.y;
    const f = span > 0 ? smooth(Math.min(1, Math.max(0, (scrollY - a.y) / span))) : 0;
    for (let k = 0; k < 3; k++) {
      out.pos[k] = lerp(a.s.pos[k], b.s.pos[k], f);
      out.look[k] = lerp(a.s.look[k], b.s.look[k], f);
    }
    out.morph = lerp(a.s.morph, b.s.morph, f);
    out.draw = lerp(a.s.draw, b.s.draw, f);
    return out;
  }

  return { layout, sample };
}
