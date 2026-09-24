(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rail = document.getElementById('rail');

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function docProgress() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    return h > 0 ? clamp01(window.scrollY / h) : 0;
  }

  /* ---------------- reveals ---------------- */

  var reveals = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  var counters = Array.prototype.slice.call(document.querySelectorAll('.cnt'));

  function kidsOf(el) { return Array.prototype.slice.call(el.children); }

  function countUp(el) {
    var to = parseFloat(el.getAttribute('data-to'));
    if (!isFinite(to)) return;
    var pre = el.getAttribute('data-pre') || '';
    var t0 = 0, dur = 1100;
    el.textContent = pre + '0';
    function step(now) {
      if (!t0) t0 = now;
      var k = Math.min(1, (now - t0) / dur);
      el.textContent = pre + Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if (!reduced && 'IntersectionObserver' in window) {
    reveals.forEach(function (el) {
      if (el.getBoundingClientRect().top <= window.innerHeight * 0.92) return;
      if (el.hasAttribute('data-stagger')) {
        kidsOf(el).forEach(function (k) { k.classList.add('rv-hide'); });
      } else {
        el.classList.add('rv-hide');
      }
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        if (el.hasAttribute('data-stagger')) {
          kidsOf(el).forEach(function (k, i) {
            k.style.transitionDelay = (i * 55) + 'ms';
            k.classList.remove('rv-hide');
            k.classList.add('rv-in');
          });
        } else {
          el.classList.remove('rv-hide');
          el.classList.add('rv-in');
        }
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });

    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        countUp(e.target);
        cio.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------------- horizontal career track ----------------
     Vertical scroll drives the track sideways, with damping so
     the cards glide rather than snap to the scroll position.
  --------------------------------------------------------- */

  var career = document.getElementById('career');
  var htrack = document.getElementById('htrack');
  var hbar = document.getElementById('hprogbar');
  var hSpan = 0, hCur = 0;

  // short viewports (a shallow Google Sites embed) fall back to a vertical stack
  function horizontalActive() {
    return !reduced && window.innerWidth >= 760 && window.innerHeight >= 480;
  }

  function measureCareer() {
    if (!career || !htrack) return;
    if (!horizontalActive()) {
      career.style.height = '';
      htrack.style.transform = '';
      hSpan = 0;
      return;
    }
    hSpan = Math.max(0, htrack.scrollWidth - window.innerWidth);
    career.style.height = (window.innerHeight + hSpan * 1.08) + 'px';
  }

  function updateCareer(dt) {
    if (!career || !htrack || !hSpan) return;
    var r = career.getBoundingClientRect();
    var travel = career.offsetHeight - window.innerHeight;
    var p = travel > 0 ? clamp01(-r.top / travel) : 0;
    var target = -hSpan * p;
    hCur += (target - hCur) * Math.min(1, dt * 7.5);
    htrack.style.transform = 'translate3d(' + hCur.toFixed(2) + 'px,0,0)';
    if (hbar) hbar.style.width = (p * 100).toFixed(1) + '%';
  }

  /* ---------------- 3D scene ---------------- */

  var stage = document.getElementById('stage');
  var canvas = document.getElementById('gl');

  function failSoft() { stage.classList.add('no-gl'); canvas.style.display = 'none'; }

  var sceneTick = null;
  if (typeof THREE === 'undefined') failSoft();
  else {
    try { sceneTick = buildScene(); }
    catch (err) { failSoft(); sceneTick = null; }
  }

  function buildScene() {
    var mobile = window.innerWidth < 760;

    var N_ICE   = mobile ?  5000 : 13000;
    var N_CITY  = mobile ? 17000 : 46000;
    var N_TRACE = mobile ?  5000 : 12000;
    var COUNT   = N_ICE + N_CITY + N_TRACE;

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: false, alpha: true, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 220);

    var p0 = new Float32Array(COUNT * 3);
    var p1 = new Float32Array(COUNT * 3);
    var p2 = new Float32Array(COUNT * 3);
    var seed = new Float32Array(COUNT * 3);
    var meta = new Float32Array(COUNT * 2);

    var w = 0;
    function put(type, t, x0, y0, z0, x1, y1, z1, x2, y2, z2) {
      var i3 = w * 3, i2 = w * 2;
      p0[i3] = x0; p0[i3 + 1] = y0; p0[i3 + 2] = z0;
      p1[i3] = x1; p1[i3 + 1] = y1; p1[i3 + 2] = z1;
      p2[i3] = x2; p2[i3 + 1] = y2; p2[i3 + 2] = z2;
      seed[i3] = Math.random(); seed[i3 + 1] = Math.random(); seed[i3 + 2] = Math.random();
      meta[i2] = type; meta[i2 + 1] = t;
      w++;
    }
    function still(type, x, y, z) { put(type, 0, x, y, z, x, y, z, x, y, z); }
    function stillD(type, d, x, y, z) { put(type, d, x, y, z, x, y, z, x, y, z); }
    function rnd() { return Math.random(); }
    function gauss() { return (rnd() + rnd() + rnd() - 1.5) * 0.9; }

    /* ice sheet */
    for (var i = 0; i < N_ICE; i++) {
      var x, z;
      if (rnd() < 0.34) {
        if (rnd() < 0.5) {
          x = Math.round((rnd() - 0.5) * 60 / 4) * 4 + gauss() * 0.05;
          z = (rnd() - 0.5) * 70 - 6;
        } else {
          x = (rnd() - 0.5) * 62;
          z = Math.round(((rnd() - 0.5) * 70 - 6) / 4) * 4 + gauss() * 0.05;
        }
      } else {
        var rr = Math.sqrt(rnd()) * 33, aa = rnd() * Math.PI * 2;
        x = Math.cos(aa) * rr;
        z = Math.sin(aa) * rr - 6;
      }
      still(0, x, -0.02 + gauss() * 0.016, z);
    }

    /* layered skyline */
    var LAYERS = [
      { z: -28, spread: 33, hBase: 2.6, hVar:  9, dim: 1.00 },
      { z: -35, spread: 42, hBase: 3.6, hVar: 18, dim: 0.88 },
      { z: -44, spread: 53, hBase: 3.0, hVar: 15, dim: 0.66 },
      { z: -56, spread: 66, hBase: 2.4, hVar: 11, dim: 0.45 },
      { z: -71, spread: 80, hBase: 1.8, hVar:  8, dim: 0.28 }
    ];

    var buildings = [];
    function addBuilding(x, wd, y0b, h, z, dim) {
      buildings.push({ x: x, w: wd, y0: y0b, h: h, z: z, dim: dim });
    }

    // Keep the near layers out of the way of the two landmarks, so each reads
    // as its own silhouette instead of being buried in the generic skyline.
    var BLOCK = [
      { x0: -32, x1: -17, zFront: -43 },
      { x0:   0, x1:  10, zFront: -32 }
    ];
    function blocked(mid, bw, lz) {
      for (var bI = 0; bI < BLOCK.length; bI++) {
        var b = BLOCK[bI];
        if (mid + bw / 2 > b.x0 && mid - bw / 2 < b.x1 && lz > b.zFront) return true;
      }
      return false;
    }

    for (var L = 0; L < LAYERS.length; L++) {
      var ly = LAYERS[L];
      var cx3 = -ly.spread;
      while (cx3 < ly.spread) {
        var bw = 0.9 + rnd() * 2.9;
        var mid = cx3 + bw / 2;
        if (blocked(mid, bw, ly.z)) { cx3 += bw + rnd() * 0.4; continue; }
        var centrality = 1 - Math.min(1, Math.abs(mid) / (ly.spread * 0.8));
        var bh = ly.hBase + Math.pow(rnd(), 1.6) * ly.hVar * (0.3 + centrality * 1.1);
        var zz = ly.z + gauss() * 1.3;

        addBuilding(mid, bw, 0, bh, zz, ly.dim);

        if (bh > ly.hBase + ly.hVar * 0.4 && rnd() < 0.5) {
          var upW = bw * (0.42 + rnd() * 0.24);
          var upH = bh * (1.16 + rnd() * 0.32);
          addBuilding(mid + gauss() * 0.12, upW, bh, upH, zz, ly.dim);
          if (rnd() < 0.35) addBuilding(mid, 0.1, upH, upH + 1.6 + rnd() * 4.5, zz, ly.dim);
        }

        cx3 += bw + rnd() * 0.4;
      }
    }

    // stepped supertalls around the core, all kept below the Empire State
    addBuilding(-14.0, 1.9,  0, 17, -37, 0.90);
    addBuilding(-14.0, 0.9, 17, 22, -37, 0.90);
    addBuilding( -8.0, 2.2,  0, 20, -35, 0.95);
    addBuilding( -8.0, 1.1, 20, 24, -35, 0.95);
    addBuilding( -8.0, 0.1, 24, 28, -35, 0.95);
    addBuilding( -1.5, 2.4,  0, 20, -31, 1.00);
    addBuilding( -1.5, 1.2, 20, 25, -31, 1.00);
    addBuilding( 11.0, 2.0,  0, 18, -36, 0.92);
    addBuilding( 11.0, 1.0, 18, 24, -36, 0.92);
    addBuilding( 15.0, 1.7,  0, 19, -38, 0.88);

    var wts = [], totalW = 0;
    for (var bi = 0; bi < buildings.length; bi++) {
      var B0 = buildings[bi];
      totalW += B0.w * (B0.h - B0.y0) * (0.4 + B0.dim);
      wts.push(totalW);
    }
    function pickBuilding() {
      var r = rnd() * totalW, lo = 0, hi = wts.length - 1;
      while (lo < hi) { var m2 = (lo + hi) >> 1; if (wts[m2] < r) lo = m2 + 1; else hi = m2; }
      return buildings[lo];
    }

    function cityPoint() {
      var B = pickBuilding();
      var span = B.h - B.y0, px, py;
      if (rnd() < 0.34) {
        var e = rnd();
        if (e < 0.38) { px = -B.w / 2; py = B.y0 + rnd() * span; }
        else if (e < 0.76) { px = B.w / 2; py = B.y0 + rnd() * span; }
        else { px = (rnd() - 0.5) * B.w; py = B.h; }
      } else {
        var cols = Math.max(2, Math.round(B.w / 0.36));
        var rows = Math.max(2, Math.round(span / 0.46));
        px = (((rnd() * cols) | 0) / (cols - 1 || 1) - 0.5) * (B.w * 0.84);
        py = B.y0 + (((rnd() * rows) | 0) / (rows - 1 || 1)) * (span * 0.94) + 0.1;
      }
      return { x: B.x + px, y: py, z: B.z + gauss() * 0.25, dim: B.dim };
    }

    /* Two landmarks hidden in the skyline: the Space Needle sits further back
       and dimmer on the left (Seattle, behind her), the Empire State Building
       stands nearest and brightest in the core (New York, now). */

    var LMN = mobile
      ? { nMain: 1400, nRefl: 460, eMain: 2000, eRefl: 620 }
      : { nMain: 3600, nRefl: 1200, eMain: 5200, eRefl: 1600 };
    var N_LM = LMN.nMain + LMN.nRefl + LMN.eMain + LMN.eRefl;

    var NDL_X = -25, NDL_Z = -42, NDL_H = 24, NDL_DIM = 0.85;
    var ESB_X = 5, ESB_Z = -33, ESB_H = 31, ESB_DIM = 1.0;

    /* Space Needle, 184m. Observation deck sits at 158m, which is 0.86 of the
       height; the saucer is 42m across and the tripod feet span 37m, so the
       deck is marginally wider than the base. The legs are near vertical for
       most of their run and flare hard only in the bottom third. */
    function needlePoint() {
      var H = NDL_H;
      var R_BASE = 0.122 * H;
      var R_CORE = 0.016 * H;
      var R_DECK = 0.135 * H;

      var r = rnd(), ang, rad, y, jx = 0, jz = 0, q;

      if (r < 0.28) {                       // three legs, hyperbolic sweep
        ang = Math.floor(rnd() * 3) * 2.0944 + 0.5236;
        var u = rnd();
        rad = (R_BASE - R_CORE) * Math.pow(1 - u, 1.7) + R_CORE;
        y = u * 0.55 * H;
        jx = gauss() * 0.024 * H;
        jz = gauss() * 0.015 * H;
      } else if (r < 0.37) {                // core column
        ang = rnd() * 6.2832;
        rad = R_CORE * (0.85 + rnd() * 0.3);
        y = rnd() * 0.745 * H;
      } else if (r < 0.51) {                // conical underside of the top house
        q = Math.pow(rnd(), 0.75);
        ang = rnd() * 6.2832;
        rad = R_CORE + q * (R_DECK * 0.92 - R_CORE);
        y = 0.660 * H + q * 0.095 * H;
      } else if (r < 0.74) {                // main deck, weighted hard to the rim
        ang = rnd() * 6.2832;
        rad = (rnd() < 0.62) ? R_DECK * (0.95 + rnd() * 0.05)
                             : R_DECK * (0.45 + Math.sqrt(rnd()) * 0.5);
        y = 0.755 * H + rnd() * 0.035 * H;
      } else if (r < 0.84) {                // upper level, steps in off the halo
        ang = rnd() * 6.2832;
        rad = R_DECK * (0.60 + rnd() * 0.06);
        y = 0.790 * H + rnd() * 0.045 * H;
      } else if (r < 0.94) {                // roof cone
        q = rnd();
        ang = rnd() * 6.2832;
        rad = R_DECK * (0.55 * (1 - q) + 0.08);
        y = 0.835 * H + q * 0.050 * H;
      } else {                               // mast
        ang = rnd() * 6.2832;
        rad = 0.006 * H + gauss() * 0.002 * H;
        y = 0.885 * H + rnd() * 0.115 * H;
      }

      return [NDL_X + Math.cos(ang) * rad + jx, y, NDL_Z + Math.sin(ang) * rad + jz];
    }

    /* Empire State, 443m to the antenna tip. The setbacks are all in the
       bottom 13%, the shaft then runs uninterrupted to 0.722H, and the
       stepped crown occupies the top. Shaft and crown carry continuous
       vertical piers, which is what the building actually reads as. */
    var ESB_TIERS = [
      { a: 0.000, b: 0.068, hw: 4.30, dr: 0.55, band: true,  wt: 1.0 },
      { a: 0.068, b: 0.106, hw: 3.50, dr: 0.58, band: false, wt: 1.3 },
      { a: 0.106, b: 0.135, hw: 2.70, dr: 0.62, band: false, wt: 1.3 },
      { a: 0.135, b: 0.722, hw: 2.00, dr: 0.70, band: false, wt: 1.0 },
      { a: 0.722, b: 0.745, hw: 1.55, dr: 0.72, band: false, wt: 3.0 },
      { a: 0.745, b: 0.845, hw: 1.15, dr: 0.74, band: false, wt: 2.4 },
      { a: 0.845, b: 0.880, hw: 0.72, dr: 0.78, band: false, wt: 2.6 },
      { a: 0.880, b: 0.912, hw: 0.42, dr: 0.85, band: false, wt: 2.6 },
      { a: 0.912, b: 1.000, hw: 0.09, dr: 1.00, mast: true,  wt: 1.6 }
    ];
    var TW = [], tAcc = 0;
    for (var ti = 0; ti < ESB_TIERS.length; ti++) {
      var Tt = ESB_TIERS[ti];
      tAcc += Tt.wt * (Tt.hw * 2) * (Tt.b - Tt.a) * ESB_H;
      TW.push(tAcc);
    }

    function empirePoint() {
      var pick = rnd() * TW[TW.length - 1], idx = 0;
      while (idx < TW.length - 1 && TW[idx] < pick) idx++;
      var T = ESB_TIERS[idx];
      var hw = T.hw, halfDep = hw * T.dr;
      var ya = T.a * ESB_H, yb = T.b * ESB_H;
      var r = rnd(), x, y, z;

      if (T.mast) {
        return [ESB_X + gauss() * 0.06, ya + rnd() * (yb - ya), ESB_Z + gauss() * 0.06];
      }

      if (r < 0.12) {                      // setback shelf, a lit horizontal cap
        x = ESB_X + (rnd() - 0.5) * 2 * hw;
        y = yb - rnd() * 0.06;
        z = ESB_Z + (rnd() - 0.5) * 2 * halfDep;
      } else if (r < 0.30) {               // corner edges hold the silhouette
        x = ESB_X + (rnd() < 0.5 ? -hw : hw);
        y = ya + rnd() * (yb - ya);
        z = ESB_Z + (rnd() - 0.5) * 2 * halfDep;
      } else if (T.band) {                 // podium reads as storey bands
        var s = Math.floor(rnd() * 5) / 4;
        x = ESB_X + (rnd() - 0.5) * 1.9 * hw;
        y = ya + s * (yb - ya) * 0.92 + 0.05;
        z = ESB_Z + (rnd() < 0.5 ? -halfDep : halfDep) * 0.92;
      } else {                              // vertical piers
        var piers = Math.max(3, Math.round(hw * 2 / 0.36));
        var pi = Math.floor(rnd() * piers);
        x = ESB_X + (pi / (piers - 1) - 0.5) * 1.88 * hw;
        y = ya + rnd() * (yb - ya);
        z = ESB_Z + (rnd() < 0.5 ? -halfDep : halfDep) * 0.92;
      }
      return [x, y, z];
    }

    var lp;
    for (var ln = 0; ln < LMN.nMain; ln++) { lp = needlePoint(); stillD(1, NDL_DIM, lp[0], lp[1], lp[2]); }
    for (var lnr = 0; lnr < LMN.nRefl; lnr++) { lp = needlePoint(); stillD(2, NDL_DIM, lp[0] + gauss() * 0.22, -lp[1] * 0.86, lp[2] + 1.5); }
    for (var le = 0; le < LMN.eMain; le++) { lp = empirePoint(); stillD(1, ESB_DIM, lp[0], lp[1], lp[2]); }
    for (var ler = 0; ler < LMN.eRefl; ler++) { lp = empirePoint(); stillD(2, ESB_DIM, lp[0] + gauss() * 0.22, -lp[1] * 0.86, lp[2] + 1.5); }

    var cityRest = N_CITY - N_LM;
    var nWindows = Math.round(cityRest * 0.70);
    var nReflect = cityRest - nWindows;
    for (var c = 0; c < nWindows; c++) {
      var cp = cityPoint();
      stillD(1, cp.dim, cp.x, cp.y, cp.z);
    }
    for (var r2 = 0; r2 < nReflect; r2++) {
      var rp = cityPoint();
      stillD(2, rp.dim, rp.x + gauss() * 0.22, -rp.y * 0.86, rp.z + 1.5);
    }

    /* the trace */
    for (var k = 0; k < N_TRACE; k++) {
      var t = k / (N_TRACE - 1);
      var thick = gauss();
      var off = thick * thick * thick * 0.28;
      var spray = rnd() < 0.14;

      // spans from under the Space Needle across to the Empire State
      var ax = -9 + (t - 0.5) * 34;
      var az = Math.sin(t * Math.PI * 3) * 6.5 - 7;
      var ay = 0.05 + (spray ? rnd() * 0.5 : 0);

      var K = 2.9;
      var grow = (Math.exp(K * t) - 1) / (Math.exp(K) - 1);
      var bx2 = (t - 0.5) * 27;
      var by2 = 0.08 + grow * 11.5;
      var bz2 = -9 + Math.sin(t * Math.PI) * 2.2;

      var th = t * Math.PI * 2;
      var den = 1 + Math.sin(th) * Math.sin(th);
      var cx2 = (Math.cos(th) / den) * 15;
      var cz2 = (Math.sin(th) * Math.cos(th) / den) * 26 - 7;
      var cy2 = 0.06 + (spray ? rnd() * 0.6 : 0);

      put(3, t,
        ax + off, ay, az + off,
        bx2 + off, by2 + off * 0.5, bz2 + off,
        cx2 + off, cy2, cz2 + off);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
    geo.setAttribute('aP0', new THREE.BufferAttribute(p0, 3));
    geo.setAttribute('aP1', new THREE.BufferAttribute(p1, 3));
    geo.setAttribute('aP2', new THREE.BufferAttribute(p2, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aMeta', new THREE.BufferAttribute(meta, 2));

    var uniforms = {
      uTime:  { value: 0 },
      uMorph: { value: 0 },
      uDraw:  { value: 0 },
      uDim:   { value: 1 },
      uSize:  { value: mobile ? 20.0 : 26.0 },
      uDpr:   { value: Math.min(window.devicePixelRatio || 1, 2) },
      cRose:  { value: new THREE.Color(0xFF7FB0) },
      cIce:   { value: new THREE.Color(0x7FD9F0) },
      cFrost: { value: new THREE.Color(0xF4F1F5) },
      cSheet: { value: new THREE.Color(0x5B7290) }
    };

    var vert = [
      'attribute vec3 aP0;',
      'attribute vec3 aP1;',
      'attribute vec3 aP2;',
      'attribute vec3 aSeed;',
      'attribute vec2 aMeta;',
      'uniform float uTime, uMorph, uDraw, uDim, uSize, uDpr;',
      'uniform vec3 cRose, cIce, cFrost, cSheet;',
      'varying vec3 vCol;',
      'varying float vA;',
      'float ease(float x){ x = clamp(x,0.0,1.0); return x*x*(3.0-2.0*x); }',
      'void main(){',
      '  float type = aMeta.x;',
      '  float tAlong = aMeta.y;',
      '  float m = clamp(uMorph + (aSeed.x - 0.5) * 0.30, 0.0, 3.0);',
      '  vec3 p;',
      '  if (m < 1.0)      p = mix(aP0, aP1, ease(m));',
      '  else if (m < 2.0) p = mix(aP1, aP2, ease(m - 1.0));',
      '  else              p = mix(aP2, aP0, ease(m - 2.0));',
      '  vec3 col; float alpha; float sizeMul = 1.0;',
      '  if (type < 0.5) {',
      '    col = mix(cSheet, cFrost, aSeed.y * 0.30);',
      '    alpha = 0.16 + aSeed.z * 0.26;',
      '    p.y += sin(uTime * 0.22 + p.x * 0.3 + p.z * 0.18) * 0.014;',
      '  } else if (type < 1.5) {',
      '    vec3 wc = mix(cRose, cFrost, pow(aSeed.y, 2.4) * 0.75);',
      '    wc = mix(wc, cIce, step(0.88, aSeed.z) * 0.5);',
      '    col = wc;',
      '    float lit = step(0.10, fract(aSeed.x * 43.0 + floor(uTime * 0.4) * 0.41));',
      '    alpha = (0.70 + aSeed.z * 0.55) * (0.78 + 0.22 * lit) * (0.35 + tAlong * 0.75);',
      '    sizeMul = 3.6;',
      '  } else if (type < 2.5) {',
      '    col = mix(cRose, cSheet, 0.22);',
      '    alpha = (0.16 + aSeed.z * 0.24) * (0.35 + tAlong * 0.75);',
      '    sizeMul = 3.0;',
      '    p.x += sin(uTime * 0.55 + aSeed.y * 9.0) * 0.10;',
      '    p.z += cos(uTime * 0.44 + aSeed.x * 7.0) * 0.07;',
      '  } else {',
      '    vec3 tc = mix(cFrost, cRose, smoothstep(0.15, 0.95, m) * (1.0 - smoothstep(1.15, 1.85, m)));',
      '    tc = mix(tc, cIce, smoothstep(1.45, 2.05, m) * (1.0 - smoothstep(2.45, 2.95, m)));',
      '    col = tc;',
      '    float vis = step(tAlong, uDraw);',
      '    float head = 1.0 - smoothstep(0.0, 0.05, abs(tAlong - uDraw));',
      '    alpha = vis * (0.55 + aSeed.z * 0.45) + head * 0.85;',
      '    col += head * 0.55;',
      '    sizeMul = 1.5;',
      '  }',
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
      '  float dist = -mv.z;',
      '  float fog = smoothstep(190.0, 10.0, dist);',
      '  gl_Position = projectionMatrix * mv;',
      '  gl_PointSize = clamp(uSize * uDpr * sizeMul * (0.55 + aSeed.z * 0.7) / max(dist, 0.6), 1.0, 34.0);',
      '  vCol = col;',
      '  vA = alpha * fog * uDim;',
      '}'
    ].join('\n');

    var frag = [
      'precision mediump float;',
      'varying vec3 vCol;',
      'varying float vA;',
      'void main(){',
      '  float d = length(gl_PointCoord - vec2(0.5));',
      '  if (d > 0.5) discard;',
      '  float a = smoothstep(0.5, 0.05, d);',
      '  gl_FragColor = vec4(vCol, a * vA);',
      '}'
    ].join('\n');

    var points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending
    }));
    points.frustumCulled = false;
    scene.add(points);

    // The trace carves itself on twice: once under the hero, then again across
    // the closing shot, erasing as the figure eight unwinds and re-cutting
    // left to right between the two landmarks.
    var DRAW = [
      [0.000, 1.00], [0.760, 1.00],
      [0.820, 0.00], [0.940, 1.00],
      [1.000, 1.00]
    ];

    var MORPH = [
      [0.000, 0.00], [0.090, 0.00],
      [0.270, 1.00], [0.400, 1.00],
      [0.520, 2.00], [0.620, 2.00],
      [0.820, 3.00], [1.000, 3.00]
    ];

    var CAM = [
      [0.000,  0.0,  2.2, 21.0,   0.0,  6.0, -20.0],
      [0.090,  0.0,  3.2, 18.5,   0.0,  5.4, -19.0],
      [0.270,  0.0,  7.5, 15.0,   0.0,  5.0, -12.0],
      [0.400,  0.0,  9.0, 13.5,   0.0,  5.5, -11.0],
      [0.520,  0.0, 24.0,  9.0,   0.0,  0.0,  -7.0],
      [0.620,  0.0, 22.0, 11.0,   0.0,  0.0,  -7.0],
      [0.780,  0.0,  8.0, 17.0,   0.0,  5.0, -18.0],
      [0.890,  0.0,  5.0, 22.0,   0.0,  6.0, -20.0],
      [1.000,  0.0, 14.0, 34.0,   0.0,  7.5, -26.0]
    ];

    function lerpRow(table, p) {
      for (var i2 = 0; i2 < table.length - 1; i2++) {
        var a = table[i2], b = table[i2 + 1];
        if (p <= b[0]) {
          var span2 = b[0] - a[0];
          var f = span2 <= 0 ? 0 : (p - a[0]) / span2;
          f = f * f * (3 - 2 * f);
          var out = [];
          for (var c2 = 1; c2 < a.length; c2++) out.push(a[c2] + (b[c2] - a[c2]) * f);
          return out;
        }
      }
      return table[table.length - 1].slice(1);
    }

    function dimFor(p) {
      if (p <= 0.17 || p >= 0.86) return 1.0;
      if (p < 0.24) return 1.0 - (p - 0.17) / 0.07 * 0.28;
      if (p > 0.79) return 0.72 + (p - 0.79) / 0.07 * 0.28;
      return 0.72;
    }

    var tmx = 0, tmy = 0, mx = 0, my = 0;
    if (!mobile) {
      window.addEventListener('pointermove', function (e) {
        tmx = (e.clientX / window.innerWidth - 0.5) * 2;
        tmy = (e.clientY / window.innerHeight - 0.5) * 2;
      }, { passive: true });
    }

    var curMorph = 0, curDim = 1, curDraw = 0;
    var cam = CAM[0].slice(1);
    var look = new THREE.Vector3();

    function place(p, k) {
      var target = lerpRow(CAM, p);
      for (var i3 = 0; i3 < 6; i3++) cam[i3] += (target[i3] - cam[i3]) * k;
      camera.position.set(cam[0] + mx * 1.6, cam[1] + my * -0.9, cam[2]);
      look.set(cam[3], cam[4], cam[5]);
      camera.lookAt(look);
    }

    window.addEventListener('resize', function () {
      var vw = window.innerWidth, vh = window.innerHeight;
      camera.aspect = vw / vh;
      camera.updateProjectionMatrix();
      renderer.setSize(vw, vh, false);
      uniforms.uDpr.value = Math.min(window.devicePixelRatio || 1, 2);
    }, { passive: true });

    place(0, 1);
    renderer.render(scene, camera);

    return function tick(dt, p) {
      if (reduced) {
        uniforms.uMorph.value = 0;
        uniforms.uDim.value = 0.9;
        place(0, 1);
        renderer.render(scene, camera);
        return;
      }
      curMorph += (lerpRow(MORPH, p)[0] - curMorph) * Math.min(1, dt * 3.2);
      curDim += (dimFor(p) - curDim) * Math.min(1, dt * 3.0);
      curDraw += (lerpRow(DRAW, p)[0] - curDraw) * Math.min(1, dt * 3.2);
      mx += (tmx - mx) * Math.min(1, dt * 2.0);
      my += (tmy - my) * Math.min(1, dt * 2.0);
      uniforms.uTime.value += dt;
      uniforms.uMorph.value = curMorph;
      uniforms.uDim.value = curDim;
      uniforms.uDraw.value = curDraw;
      place(p, Math.min(1, dt * 2.4));
      renderer.render(scene, camera);
    };
  }

  /* ---------------- master loop ---------------- */

  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    var p = docProgress();
    rail.style.width = (p * 100).toFixed(2) + '%';
    updateCareer(dt);
    if (sceneTick) sceneTick(dt, p);
  }

  measureCareer();
  window.addEventListener('resize', measureCareer, { passive: true });
  window.addEventListener('load', measureCareer);
  // card widths shift once the display face swaps in
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureCareer);
  requestAnimationFrame(frame);
})();
