/* 预演台 · 介绍页交互 */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const E = window.PrevizEngine;

  /* ---------------- 场景数据 ---------------- */
  const CAMERAS = [
    { id: 'c1', name: '机位 01', eye: [4.5, 2.2, 4.15], target: [-0.45, 1.12, -0.85], fov: 44, label: '全景' },
    { id: 'c2', name: '机位 02', eye: [-1.9, 1.5, 5.3], target: [-0.95, 1.15, 0.75], fov: 38, label: '双人' },
    { id: 'c3', name: '机位 03', eye: [1.95, 1.62, 2.95], target: [0.18, 1.38, 1.0], fov: 34, label: '近景' },
    { id: 'c4', name: '机位 04', eye: [1.5, 1.6, 2.5], target: [-1.35, 1.42, 0.62], fov: 38, label: '过肩' },
    { id: 'c5', name: '机位 05', eye: [1.42, 1.5, 0.78], target: [0.4, 0.62, -0.75], fov: 36, label: '细节' }
  ];

  function camObject(c) {
    return { id: c.id, type: 'camera', name: c.name, eye: c.eye.slice(), target: c.target.slice(), fov: c.fov, move: null };
  }

  function fullScene(withCameras) {
    const objects = [
      { id: 'p1', type: 'person', name: '人物 A', x: 0.25, z: 1.05, rot: Math.PI, pose: 'stand', visible: true },
      { id: 'p2', type: 'person', name: '人物 B', x: -2.15, z: 0.55, rot: 1.36, pose: 'talk', visible: true },
      { id: 'f1', type: 'prop', kind: 'sofa', name: '沙发', x: -0.55, z: -2.2, rot: 0, visible: true },
      { id: 'f2', type: 'prop', kind: 'table', name: '茶几', x: 0.45, z: -0.75, rot: 0, visible: true },
      { id: 'f3', type: 'prop', kind: 'chair', name: '单人椅', x: 2.35, z: -1.5, rot: -0.5, visible: true },
      { id: 'f4', type: 'prop', kind: 'lamp', name: '落地灯', x: -3.05, z: -2.45, rot: 0, visible: true },
      { id: 'f5', type: 'prop', kind: 'sideboard', name: '边柜', x: -2.55, z: -2.86, rot: 0, visible: true }
    ];
    if (withCameras !== false) CAMERAS.forEach((c) => objects.push(camObject(c)));
    return { objects };
  }

  /* ---------------- 视口 ---------------- */
  const stages = {};

  function mount(name, opts, scene, orbit) {
    const canvas = $('[data-stage="' + name + '"]');
    if (!canvas) return null;
    const eng = E.create(canvas, scene || fullScene(), opts || {});
    if (orbit) Object.assign(eng.orbit, orbit);
    eng.render();
    stages[name] = eng;
    return eng;
  }

  /* ---------------- 缩略图 ---------------- */
  function drawThumbs() {
    const hero = stages.hero;
    if (!hero) return;
    $$('[data-thumb]').forEach((cv) => {
      const i = +cv.getAttribute('data-thumb');
      const c = CAMERAS[i];
      if (c) hero.thumb(cv, camObject(c));
    });
  }

  /* ---------------- 俯视图 ---------------- */
  const PLAN = { s: 62, cx: 329, cy: 279, zc: 1 };
  const px = (x) => PLAN.cx + x * PLAN.s;
  const py = (z) => PLAN.cy + (z - PLAN.zc) * PLAN.s;

  function rotRect(cx, cz, w, d, rot) {
    const hw = w / 2, hd = d / 2, c = Math.cos(rot), s = Math.sin(rot);
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map((p) => [cx + p[0] * c + p[1] * s, cz - p[0] * s + p[1] * c]);
  }

  const FURNITURE = [
    { t: 'rect', x: -3.77, z: -3.07, w: 7.54, h: 0.14, cls: 'wall' },
    { t: 'rect', x: -3.77, z: -3.0, w: 0.14, h: 5.6, cls: 'wall' },
    { t: 'rect', x: 3.63, z: -3.0, w: 0.14, h: 3.6, cls: 'wall' },
    { t: 'rect', x: 0.6, z: -3.04, w: 1.9, h: 0.08, cls: 'win' },
    { t: 'rect', x: -1.8, z: -2.7, w: 2.5, h: 1.0, cls: 'obj' },
    { t: 'rect', x: -1.8, z: -2.7, w: 2.5, h: 0.2, cls: 'obj2' },
    { t: 'rect', x: -0.22, z: -1.11, w: 1.34, h: 0.72, cls: 'obj' },
    { t: 'rect', x: -3.15, z: -3.02, w: 1.2, h: 0.32, cls: 'obj' },
    { t: 'poly', pts: rotRect(2.35, -1.5, 0.98, 0.94, -0.5), cls: 'obj' },
    { t: 'circle', x: -3.05, z: -2.45, r: 0.21, cls: 'obj' }
  ];

  const PEOPLE = [
    { x: 0.25, z: 1.05, rot: Math.PI, label: 'A' },
    { x: -2.15, z: 0.55, rot: 1.36, label: 'B' }
  ];

  const ROUTE = [[-2.15, 0.55], [-1.25, -0.35], [-2.45, -1.55]];

  function drawPlan() {
    const svg = $('#plan');
    if (!svg) return;
    const out = [];
    for (let x = -6; x <= 6; x++) out.push('<line class="pgrid" x1="' + px(x) + '" y1="' + py(-4) + '" x2="' + px(x) + '" y2="' + py(5.6) + '"/>');
    for (let z = -4; z <= 5; z++) out.push('<line class="pgrid" x1="' + px(-6) + '" y1="' + py(z) + '" x2="' + px(6) + '" y2="' + py(z) + '"/>');

    FURNITURE.forEach((f) => {
      if (f.t === 'rect') out.push('<rect class="p' + f.cls + '" x="' + px(f.x) + '" y="' + py(f.z) + '" width="' + f.w * PLAN.s + '" height="' + f.h * PLAN.s + '"/>');
      else if (f.t === 'poly') out.push('<polygon class="p' + f.cls + '" points="' + f.pts.map((p) => px(p[0]) + ',' + py(p[1])).join(' ') + '"/>');
      else out.push('<circle class="p' + f.cls + '" cx="' + px(f.x) + '" cy="' + py(f.z) + '" r="' + f.r * PLAN.s + '"/>');
    });

    out.push('<polyline class="proute" points="' + ROUTE.map((p) => px(p[0]) + ',' + py(p[1])).join(' ') + '"/>');
    ROUTE.forEach((p, i) => {
      out.push('<circle class="prouteno" cx="' + px(p[0]) + '" cy="' + py(p[1]) + '" r="9"/>');
      out.push('<text class="ptxt proutetxt" x="' + px(p[0]) + '" y="' + (py(p[1]) + 3.5) + '">' + (i + 1) + '</text>');
    });

    PEOPLE.forEach((p) => {
      const cx = px(p.x), cy = py(p.z);
      const fx = Math.sin(p.rot), fz = Math.cos(p.rot);
      out.push('<circle class="pbodyring" cx="' + cx + '" cy="' + cy + '" r="13"/>');
      out.push('<circle class="pbody" cx="' + cx + '" cy="' + cy + '" r="8"/>');
      out.push('<path class="pfacing" d="M' + cx + ' ' + cy + ' l' + fx * 30 + ' ' + fz * 30 + '"/>');
      out.push('<text class="ptxt" x="' + (cx + 18) + '" y="' + (cy - 12) + '">' + p.label + '</text>');
    });

    CAMERAS.forEach((cam, i) => {
      const cx = px(cam.eye[0]), cy = py(cam.eye[2]);
      const ang = Math.atan2(cam.target[2] - cam.eye[2], cam.target[0] - cam.eye[0]);
      const half = (cam.fov * Math.PI) / 360;
      const R = 2.3 * PLAN.s;
      const pts = [[cx, cy]];
      for (let a = -half; a <= half + 0.0001; a += half / 6) pts.push([cx + Math.cos(ang + a) * R, cy + Math.sin(ang + a) * R]);
      out.push('<g class="pcam' + (i === 2 ? ' is-sel' : '') + '" data-cam="' + i + '" tabindex="0" role="button" aria-label="机位 ' + (i + 1) + '，视野 ' + cam.fov + ' 度">');
      out.push('<polygon class="pfan" points="' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/>');
      out.push('<circle class="pcamdot" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="6.5"/>');
      out.push('<text class="ptxt pcamnum" x="' + (cx + 11) + '" y="' + (cy + 4) + '">0' + (i + 1) + '</text>');
      out.push('</g>');
    });

    out.push('<g class="pcompass"><path d="M36 470 l0 -26"/><path d="M36 444 l-4 7 h8z"/><text x="36" y="486">N</text></g>');
    out.push('<g class="pscale"><path d="M640 486 h104"/><path d="M640 482 v8"/><path d="M744 482 v8"/><text x="692" y="478">2 m</text></g>');

    svg.innerHTML = out.join('');

    const groups = $$('#plan .pcam');
    const legs = $$('#planLegend button');
    function select(i) {
      groups.forEach((g) => g.classList.toggle('is-sel', +g.getAttribute('data-cam') === i));
      legs.forEach((b) => b.classList.toggle('is-on', +b.getAttribute('data-cam') === i));
    }
    groups.forEach((g) => {
      const i = +g.getAttribute('data-cam');
      g.addEventListener('click', () => select(i));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } });
    });
    legs.forEach((b) => {
      const i = +b.getAttribute('data-cam');
      b.addEventListener('click', () => select(i));
      b.addEventListener('mouseenter', () => groups[i] && groups[i].classList.add('is-hover'));
      b.addEventListener('mouseleave', () => groups[i] && groups[i].classList.remove('is-hover'));
    });
    select(2);
  }

  /* ---------------- 姿势 ---------------- */
  const POSES = {
    stand: { shoulderL: 3, elbowL: 6, shoulderR: -3, elbowR: 6, hipL: 4, kneeL: 3, hipR: -4, kneeR: 3, y: 0, torso: 0 },
    walk: { shoulderL: 26, elbowL: 14, shoulderR: -26, elbowR: 20, hipL: -26, kneeL: 10, hipR: 22, kneeR: 32, y: 26, torso: -3 },
    raise: { shoulderL: -172, elbowL: -6, shoulderR: -4, elbowR: 6, hipL: 4, kneeL: 3, hipR: -4, kneeR: 3, y: 0, torso: 0 },
    hip: { shoulderL: -38, elbowL: 96, shoulderR: 4, elbowR: 8, hipL: 6, kneeL: 4, hipR: -6, kneeR: 4, y: 0, torso: 0 },
    sit: { shoulderL: -22, elbowL: 26, shoulderR: 8, elbowR: 12, hipL: -86, kneeL: 88, hipR: -86, kneeR: 88, y: 66, torso: -3 },
    crouch: { shoulderL: -34, elbowL: 40, shoulderR: 10, elbowR: 14, hipL: -104, kneeL: 118, hipR: -104, kneeR: 118, y: 54, torso: -12 },
    point: { shoulderL: 6, elbowL: 8, shoulderR: -88, elbowR: -4, hipL: 4, kneeL: 3, hipR: -4, kneeR: 3, y: 0, torso: 0 },
    talk: { shoulderL: -30, elbowL: 54, shoulderR: 12, elbowR: 32, hipL: 5, kneeL: 3, hipR: -5, kneeR: 3, y: 0, torso: 0 }
  };
  const JOINTS = ['shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR'];
  let rigPose = Object.assign({}, POSES.stand);

  function applyPose(p) {
    JOINTS.forEach((j) => {
      const el = $('[data-joint="' + j + '"]');
      if (el) el.setAttribute('transform', 'rotate(' + (p[j] || 0) + ' 0 0)');
    });
    const root = $('#rigRoot');
    if (root) root.setAttribute('transform', 'translate(150 ' + (261 + (p.y || 0)) + ')');
    const torso = $('#rigTorso');
    if (torso) torso.setAttribute('transform', 'rotate(' + (p.torso || 0) + ' 0 0)');
  }

  function setPose(name) {
    const to = POSES[name];
    if (!to) return;
    const from = Object.assign({}, rigPose);
    const t0 = performance.now();
    const dur = reduce ? 0 : 520;
    function step(t) {
      const k = dur ? Math.min(1, (t - t0) / dur) : 1;
      const e = 1 - Math.pow(1 - k, 3);
      const cur = {};
      JOINTS.concat(['y', 'torso']).forEach((key) => { cur[key] = from[key] + (to[key] - from[key]) * e; });
      rigPose = cur;
      applyPose(cur);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initRig() {
    if (!$('#rigRoot')) return;
    applyPose(rigPose);
    $$('#posePills button').forEach((b) => {
      b.addEventListener('click', () => {
        $$('#posePills button').forEach((x) => x.classList.remove('is-on'));
        b.classList.add('is-on');
        setPose(b.getAttribute('data-pose'));
      });
    });
  }

  /* ---------------- 运镜 ---------------- */
  const MOVES = {
    push: { label: '推镜', eye: 0.2, fov: -2 },
    pull: { label: '拉镜', eye: -0.22, fov: 3 },
    panL: { label: '左摇', yaw: -11 },
    panR: { label: '右摇', yaw: 11 },
    tiltU: { label: '俯仰抬', tilt: 0.85 },
    tiltD: { label: '俯拍压', tilt: -0.85 },
    truckL: { label: '左移', truck: -0.9 },
    truckR: { label: '右移', truck: 0.9 }
  };

  function initMoves() {
    const eng = stages.moves;
    if (!eng) return;
    const base = { eye: CAMERAS[0].eye.slice(), target: CAMERAS[0].target.slice(), fov: CAMERAS[0].fov };
    const label = $('#moveLabel');

    $$('#movePills button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = MOVES[btn.getAttribute('data-move')];
        if (!m) return;
        $$('#movePills button').forEach((x) => x.classList.remove('is-on'));
        btn.classList.add('is-on');
        if (label) label.textContent = m.label + ' · 机位 01';

        let eye = base.eye.slice(), target = base.target.slice();
        const dir = norm(sub(target, eye));
        const right = norm(cross(dir, [0, 1, 0]));
        const up = cross(right, dir);

        if (m.eye) {
          const d = dist(eye, target);
          const amt = m.eye * d;
          eye = add(eye, mul(dir, amt));
          target = add(eye, mul(dir, d - amt * 0.15));
        }
        if (m.yaw) {
          const a = (m.yaw * Math.PI) / 180;
          const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
          target = [eye[0] + dx * Math.cos(a) - dz * Math.sin(a), eye[1] + dy, eye[2] + dx * Math.sin(a) + dz * Math.cos(a)];
        }
        if (m.tilt) { target[1] += m.tilt; eye[1] += m.tilt * 0.25; }
        if (m.truck) { eye = add(eye, mul(right, m.truck)); target = add(target, mul(right, m.truck)); }
        const fov = Math.max(18, Math.min(110, base.fov + (m.fov || 0)));
        tweenCam(eng, { eye, target, fov }, 1.15);
      });
    });

    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  }

  let camTweenRaf = 0;

  function tweenCam(eng, to, dur) {
    const cam = eng.activeCam;
    if (!cam) return;
    if (camTweenRaf) { cancelAnimationFrame(camTweenRaf); camTweenRaf = 0; }
    const from = { eye: cam.eye.slice(), target: cam.target.slice(), fov: cam.fov };
    const t0 = performance.now();
    function step(t) {
      const k = Math.min(1, (t - t0) / (dur * 1000));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      cam.eye = [0, 1, 2].map((i) => from.eye[i] + (to.eye[i] - from.eye[i]) * e);
      cam.target = [0, 1, 2].map((i) => from.target[i] + (to.target[i] - from.target[i]) * e);
      cam.fov = from.fov + (to.fov - from.fov) * e;
      eng.render();
      camTweenRaf = k < 1 ? requestAnimationFrame(step) : 0;
    }
    camTweenRaf = requestAnimationFrame(step);
  }

  /* ---------------- 镜头（滚动切换） ---------------- */
  function initShots() {
    const eng = stages.shots;
    const sec = $('#shots');
    if (!eng || !sec) return;
    const strip = $('#shotsStrip');
    const cut = $('#shotsCut');

    CAMERAS.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'mini' + (i === 0 ? ' is-on' : '');
      el.innerHTML = '<canvas></canvas><b>0' + (i + 1) + '</b><span>' + c.label + '</span>';
      strip.appendChild(el);
      const cv = el.querySelector('canvas');
      requestAnimationFrame(() => eng.thumb(cv, camObject(c)));
    });

    let current = -1;
    function apply(i) {
      if (i === current) return;
      current = i;
      const c = CAMERAS[i];
      eng.activeCam = eng.scene.objects.filter((o) => o.id === c.id)[0];
      eng.mode = 'camera';
      eng.render();
      if (cut) cut.textContent = 'CUT 0' + (i + 1);
      $$('#shotsStrip .mini').forEach((el, k) => el.classList.toggle('is-on', k === i));
    }

    let queued = false;
    function update() {
      const rect = sec.getBoundingClientRect();
      const total = sec.offsetHeight - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      apply(Math.min(CAMERAS.length - 1, Math.floor(p * CAMERAS.length * 0.999)));
    }
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; update(); });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------------- AI 导演演示 ---------------- */
  const AI_CAMS = [
    { id: 'a1', name: '机位 01', eye: [4.5, 2.2, 4.15], target: [-0.45, 1.12, -0.85], fov: 44 },
    { id: 'a2', name: '机位 02', eye: [-1.9, 1.5, 5.3], target: [-0.95, 1.15, 0.75], fov: 38 },
    { id: 'a3', name: '机位 03', eye: [1.95, 1.62, 2.95], target: [0.18, 1.38, 1.0], fov: 34 }
  ];

  function initAI() {
    const canvas = $('[data-stage="ai"]');
    if (!canvas) return;
    const scene = { objects: [] };
    const eng = E.create(canvas, scene, { theme: 'dark' });
    eng.orbit = { yaw: 0.7, pitch: 0.44, dist: 11.8, target: [0.1, 1.15, -0.9] };
    eng.render();

    const log = $('#aiLog');
    const chips = $('#aiChips');
    const badge = $('#aiBadge');
    let busy = false;
    let animRaf = 0;

    function animate() {
      if (animRaf) return;
      let last = performance.now();
      const loop = (t) => {
        const dt = Math.min(0.05, (t - last) / 1000);
        last = t;
        let active = false;
        scene.objects.forEach((o) => {
          if (o.reveal != null && o.reveal < 1) { o.reveal = Math.min(1, o.reveal + dt * 3.2); active = true; }
          if (o.pulse > 0) { o.pulse = Math.max(0, o.pulse - dt * 0.8); active = true; }
        });
        eng.render();
        animRaf = active ? requestAnimationFrame(loop) : 0;
      };
      animRaf = requestAnimationFrame(loop);
    }

    function add(o) {
      o.reveal = 0;
      o.pulse = 1;
      scene.objects.push(o);
      animate();
      if (badge) badge.textContent = scene.objects.length ? '客厅 · ' + scene.objects.length + ' 个对象' : '空房间';
    }

    function msg(role, html, actions) {
      const el = document.createElement('div');
      el.className = 'ai-msg ai-msg--' + role;
      if (role === 'ai') {
        el.innerHTML = '<div class="ai-msg__meta"><i>AI</i>导演</div>' + html +
          (actions ? '<div class="ai-chips">' + actions.map((a) => '<span>' + a + '</span>').join('') + '</div>' : '');
      } else {
        el.textContent = html;
      }
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));

    async function buildRoom() {
      if (scene.objects.some((o) => o.kind === 'sofa')) {
        msg('ai', '客厅已经在了。可以让我<b>加人</b>、<b>加机位</b>，或者<b>让两个人坐下</b>。');
        return;
      }
      msg('ai', '先摆客厅：双人沙发、茶几、单人椅、落地灯、边柜。', ['＋5 道具']);
      const items = [
        ['sofa', '沙发', -0.55, -2.2, 0],
        ['table', '茶几', 0.45, -0.75, 0],
        ['chair', '单人椅', 2.35, -1.5, -0.5],
        ['lamp', '落地灯', -3.05, -2.45, 0],
        ['sideboard', '边柜', -2.55, -2.86, 0]
      ];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        add({ id: 'f' + i, type: 'prop', kind: it[0], name: it[1], x: it[2], z: it[3], rot: it[4], visible: true });
        await sleep(230);
      }
      await sleep(160);
      msg('ai', '两个人：A 站在茶几前，B 在左边侧身面向 A。', ['＋2 人物']);
      add({ id: 'p1', type: 'person', name: 'A', x: 0.25, z: 1.05, rot: Math.PI, pose: 'stand', visible: true });
      await sleep(280);
      add({ id: 'p2', type: 'person', name: 'B', x: -2.15, z: 0.55, rot: 1.36, pose: 'talk', visible: true });
      await sleep(280);
      msg('ai', '三台机位：01 全景、02 双人、03 近景贴 A 的侧脸。', ['＋3 机位']);
      for (let i = 0; i < AI_CAMS.length; i++) {
        const c = AI_CAMS[i];
        add({ id: c.id, type: 'camera', name: c.name, eye: c.eye.slice(), target: c.target.slice(), fov: c.fov, move: null });
        await sleep(260);
      }
      eng.activeCam = scene.objects.filter((o) => o.id === 'a3')[0];
      setChips([['让两个人坐下', sit], ['在 B 周围加一圈机位', ring], ['重新说一次', reset]]);
    }

    async function sit() {
      const people = scene.objects.filter((o) => o.type === 'person');
      if (!people.length) return msg('ai', '场景里还没有人。先让我<b>搭一个客厅</b>。');
      msg('ai', '坐下。坐姿会自动沉身，脚落在地面。', ['改 2 个姿势']);
      people.forEach((p, i) => {
        setTimeout(() => { p.pose = 'sit'; p.pulse = 1; eng.render(); }, i * 220);
      });
      await sleep(600);
      const sofa = scene.objects.filter((o) => o.kind === 'sofa')[0];
      const chair = scene.objects.filter((o) => o.kind === 'chair')[0];
      if (people[0] && sofa) { people[0].x = sofa.x + 0.15; people[0].z = sofa.z + 0.02; people[0].rot = 0; }
      if (people[1] && chair) { people[1].x = chair.x - 0.05; people[1].z = chair.z - 0.05; people[1].rot = chair.rot; }
      eng.render();
      await sleep(200);
      msg('ai', '他们坐在沙发和单人椅上了。');
      setChips([['在 B 周围加一圈机位', ring], ['重新说一次', reset]]);
    }

    async function ring() {
      const b = scene.objects.filter((o) => o.type === 'person')[1];
      if (!b) return msg('ai', '还没有 B。先让我<b>搭一个客厅</b>。');
      msg('ai', '在 B 周围加四台，都朝向 B 的头部。', ['＋4 机位']);
      const target = [b.x, 1.25, b.z];
      const defs = [[2.2, 0.55], [2.6, -0.55], [2.8, Math.PI], [3.0, 0.4, 2.4]];
      for (let i = 0; i < defs.length; i++) {
        const d = defs[i];
        const eye = d[2] ? [target[0] + Math.cos(d[1]) * 0.4, d[2], target[2] + 0.6] : [target[0] + Math.sin(d[1]) * d[0], 1.5, target[2] + Math.cos(d[1]) * d[0]];
        add({ id: 'r' + i, type: 'camera', name: '机位 0' + (4 + i), eye, target: target.slice(), fov: 34 + i * 3, move: null });
        await sleep(260);
      }
      msg('ai', 'B 现在有四个角度可用。');
    }

    async function reset() {
      scene.objects.length = 0;
      eng.activeCam = null;
      eng.render();
      if (badge) badge.textContent = '空房间';
      log.innerHTML = '';
      msg('ai', '清空了。说一句「<b>搭一个客厅，两个人，三个机位</b>」开始。');
      setChips([['搭一个客厅，两个人，三个机位', room], ['让两个人坐下', sit]]);
    }

    function setChips(list) {
      chips.innerHTML = '';
      list.forEach(([text, fn]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', async () => {
          if (busy) return;
          busy = true;
          chips.querySelectorAll('button').forEach((x) => { x.disabled = true; });
          msg('me', text);
          try { await fn(); } finally {
            busy = false;
            chips.querySelectorAll('button').forEach((x) => { x.disabled = false; });
          }
        });
        chips.appendChild(b);
      });
    }

    function room() { return buildRoom(); }

    msg('ai', '我是预演台的 AI 导演。说一句话，我把人、道具和机位摆进这个空房间。');
    setChips([['搭一个客厅，两个人，三个机位', room], ['让两个人坐下', sit], ['在 B 周围加一圈机位', ring]]);
  }

  /* ---------------- 导出演示 ---------------- */
  function initExport() {
    const btn = $('[data-render]');
    const bar = $('#renderBar');
    const status = $('#renderStatus');
    if (!btn || !bar) return;
    let busy = false;
    btn.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      btn.textContent = '渲染中…';
      const t0 = performance.now();
      const dur = reduce ? 0 : 2600;
      function step(t) {
        const k = dur ? Math.min(1, (t - t0) / dur) : 1;
        bar.style.width = (k * 100).toFixed(1) + '%';
        if (status) status.textContent = k < 1 ? '渲染中 ' + Math.round(k * 100) + '% · 片长 9.4 秒' : '完成 · render.mp4 · 28.6 MB';
        if (k < 1) requestAnimationFrame(step);
        else { busy = false; btn.textContent = '再渲染一次'; }
      }
      requestAnimationFrame(step);
    });
  }

  /* ---------------- 导航 ---------------- */
  function initNav() {
    const menu = $('.nav__menu');
    const links = $('.nav__links');
    if (!menu || !links) return;
    menu.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
      links.style.display = open ? 'flex' : '';
      links.style.position = open ? 'absolute' : '';
      links.style.top = open ? '48px' : '';
      links.style.left = '0';
      links.style.right = '0';
      links.style.flexDirection = 'column';
      links.style.gap = '0';
      links.style.background = 'rgba(22,22,23,.98)';
      links.style.padding = open ? '8px 22px 16px' : '';
      links.style.fontSize = open ? '15px' : '';
      links.querySelectorAll('a').forEach((a) => {
        a.style.padding = open ? '12px 0' : '';
        a.style.borderBottom = open ? '1px solid rgba(255,255,255,.08)' : '';
      });
    });
    links.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      if (document.body.classList.contains('nav-open')) menu.click();
    }));
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    const hero = mount('hero', { theme: 'dark' }, fullScene(), { yaw: 0.7, pitch: 0.44, dist: 11.8, target: [0.1, 1.15, -0.9] });
    mount('scene', { theme: 'light', selected: 'f2' }, fullScene(), { yaw: 0.18, pitch: 0.56, dist: 9.4, target: [0.0, 0.95, -0.5] });
    mount('shots', { theme: 'light' }, fullScene(), {});
    const moves = mount('moves', { theme: 'dark' }, fullScene(), {});
    if (moves) {
      moves.mode = 'camera';
      moves.activeCam = moves.scene.objects.filter((o) => o.id === 'c1')[0];
      moves.render();
    }

    drawPlan();
    initRig();
    initMoves();
    initShots();
    initAI();
    initExport();
    initNav();
    window.__stages = stages; // 调试用

    requestAnimationFrame(drawThumbs);
    window.addEventListener('resize', () => {
      Object.keys(stages).forEach((k) => stages[k].resize());
      setTimeout(drawThumbs, 60);
    });

    // hero 里那台视口缓慢转一点，像产品转台
    if (!reduce && hero) {
      let last = performance.now();
      let visible = true;
      const heroEl = document.querySelector('.hero');
      if (heroEl && window.IntersectionObserver) {
        new IntersectionObserver(function (entries) {
          visible = entries[0].isIntersecting;
          last = performance.now();
        }, { threshold: 0 }).observe(heroEl);
      }
      const loop = (t) => {
        const dt = Math.min(0.04, (t - last) / 1000);
        last = t;
        if (!document.hidden && visible) {
          hero.orbit.yaw += dt * 0.035;
          hero.render();
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      document.addEventListener('visibilitychange', () => { last = performance.now(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();




