// Two typographic moments.
//   The name rises in letter by letter on load, as the establishing shot.
//   The profile statement lights up word by word at reading pace as the
//   pinned section scrolls past.

export function initType(reduced) {
  if (!reduced) splitName();
  const statement = reduced ? null : splitStatement();
  return {
    update() {
      if (statement) statement();
    },
  };
}

function splitName() {
  const h1 = document.querySelector('#hero h1');
  if (!h1) return;
  h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());
  let i = 0;
  for (const node of [...h1.childNodes]) {
    if (node.nodeType !== Node.TEXT_NODE) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        node.setAttribute('aria-hidden', 'true');
        node.style.setProperty('--i', String(i + 2));
        node.classList.add('ch-late');
      }
      continue;
    }
    const frag = document.createDocumentFragment();
    for (const word of node.textContent.split(/\s+/).filter(Boolean)) {
      const w = document.createElement('span');
      w.className = 'word';
      w.setAttribute('aria-hidden', 'true');
      for (const letter of word) {
        const c = document.createElement('span');
        c.className = 'ch';
        c.style.setProperty('--i', String(i++));
        c.textContent = letter;
        w.append(c);
      }
      frag.append(w);
    }
    node.replaceWith(frag);
  }
}

function splitStatement() {
  const section = document.getElementById('profile');
  const p = section && section.querySelector('.statement');
  const note = section && section.querySelector('.statement-note');
  if (!p) return null;

  const words = [];
  const wrap = (textNode) => {
    const frag = document.createDocumentFragment();
    for (const part of textNode.textContent.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.append(document.createTextNode(' '));
        continue;
      }
      const s = document.createElement('span');
      s.className = 'wd';
      s.textContent = part;
      words.push(s);
      frag.append(s);
    }
    textNode.replaceWith(frag);
  };
  const walk = (el) => {
    for (const n of [...el.childNodes]) {
      if (n.nodeType === Node.TEXT_NODE) wrap(n);
      else if (n.nodeType === Node.ELEMENT_NODE) walk(n);
    }
  };
  walk(p);
  p.classList.add('is-split');

  let lastP = -1;
  return function update() {
    const r = section.getBoundingClientRect();
    const travel = section.offsetHeight - window.innerHeight;
    // start lighting as the statement arrives, finish before the pin releases
    const prog = Math.min(1, Math.max(0, (window.innerHeight * 0.55 - r.top) / (travel + window.innerHeight * 0.3)));
    if (Math.abs(prog - lastP) < 0.002) return;
    lastP = prog;
    const lit = prog * 1.25 * words.length;
    words.forEach((w, i) => {
      const k = Math.min(1, Math.max(0, lit - i));
      w.style.opacity = (0.16 + 0.84 * k).toFixed(3);
    });
    if (note) note.style.opacity = Math.min(1, Math.max(0, (prog - 0.62) / 0.22)).toFixed(3);
  };
}
