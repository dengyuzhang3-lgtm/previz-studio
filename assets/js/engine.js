/* 预演台 · 网页演示引擎 v2
   画家算法渲染器 + 场景模型 + 拾取 + 姿势骨骼。单位米，Y 轴向上。 */
(function (global) {
  'use strict';

  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp3: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  };

  const LIGHT = V.norm([-0.42, 0.84, 0.34]);

  const THEMES = {
    dark: {
      bg1: '#171e28', bg2: '#080b0f', floor: '#0d1218',
      grid1: 'rgba(190,205,225,0.05)', grid2: 'rgba(190,205,225,0.12)',
      model: [208, 216, 228], room: [146, 157, 174],
      edge: 'rgba(7,9,13,0.55)', accent: '#f0a13a', accentFill: 'rgba(240,161,58,0.10)',
      label: 'rgba(233,237,243,0.6)', dim: 'rgba(180,192,210,0.2)'
    },
    light: {
      bg1: '#f1eee6', bg2: '#d9d3c4', floor: '#e4dfd2',
      grid1: 'rgba(40,45,55,0.055)', grid2: 'rgba(40,45,55,0.13)',
      model: [240, 237, 229], room: [206, 199, 185],
      edge: 'rgba(48,52,60,0.30)', accent: '#a8640f', accentFill: 'rgba(168,100,15,0.10)',
      label: 'rgba(40,45,55,0.58)', dim: 'rgba(40,45,55,0.28)'
    }
  };

  /* ---------- 道具（局部坐标，底面 y=0） ---------- */
  const B = (x, y, z, w, h, d, tone) => ({ x, y, z, w, h, d, tone: tone || 1 });

  const PROPS = {
    sofa: [
      B(0, 0.22, 0, 2.5, 0.44, 0.98),
      B(0, 0.62, -0.4, 2.5, 0.62, 0.18, 0.94),
      B(-1.16, 0.55, 0, 0.18, 0.68, 1.0, 0.97),
      B(1.16, 0.55, 0, 0.18, 0.68, 1.0, 0.97)
    ],
    table: [
      B(0, 0.36, 0, 1.34, 0.07, 0.72, 1.06),
      B(-0.55, 0.17, -0.28, 0.08, 0.34, 0.08, 0.86),
      B(0.55, 0.17, -0.28, 0.08, 0.34, 0.08, 0.86),
      B(-0.55, 0.17, 0.28, 0.08, 0.34, 0.08, 0.86),
      B(0.55, 0.17, 0.28, 0.08, 0.34, 0.08, 0.86)
    ],
    chair: [
      B(0, 0.24, 0, 0.98, 0.46, 0.94),
      B(0, 0.64, -0.36, 0.98, 0.58, 0.16, 0.94),
      B(-0.44, 0.5, 0, 0.1, 0.5, 0.86, 0.97),
      B(0.44, 0.5, 0, 0.1, 0.5, 0.86, 0.97)
    ],
    lamp: [B(0, 0.03, 0, 0.42, 0.06, 0.42, 0.9), B(0, 0.9, 0, 0.05, 1.75, 0.05, 0.95), B(0, 1.86, 0, 0.3, 0.26, 0.3, 1.1)],
    sideboard: [B(0, 0.42, 0, 1.2, 0.84, 0.32, 0.94), B(0, 0.86, 0, 1.24, 0.04, 0.34, 1.06)],
    plant: [B(0, 0.18, 0, 0.36, 0.36, 0.36, 0.92), B(0, 0.6, 0, 0.46, 0.5, 0.46, 1.02)],
    stool: [B(0, 0.22, 0, 0.44, 0.44, 0.44, 0.98)],
    shelf: [B(0, 0.9, 0, 1.1, 1.8, 0.3, 0.95), B(0, 0.5, 0.16, 1.06, 0.04, 0.02, 1.05)]
  };

  const POSE_NAMES = {
    stand: '站立', walk: '行走', raise: '举手', hip: '叉腰',
    sit: '坐姿', crouch: '蹲下', point: '指向', talk: '交谈'
  };

  /* 关节角：rx 为正时肢体向后摆（-z） */
  const POSES = {
    stand: { armL: 0.06, armR: 0.06, elbowL: 0.12, elbowR: 0.12, legL: 0.03, legR: 0.03, kneeL: 0.04, kneeR: 0.04, y: 0 },
    walk: { armL: 0.55, armR: -0.55, elbowL: 0.25, elbowR: 0.2, legL: -0.45, legR: 0.4, kneeL: 0.15, kneeR: 0.55, y: 0.02 },
    raise: { armL: 2.9, armR: 0.08, elbowL: 0.1, elbowR: 0.1, legL: 0.03, legR: 0.03, kneeL: 0.04, kneeR: 0.04, y: 0 },
    hip: { armL: 0.08, armR: 0.5, elbowL: 0.1, elbowR: 1.9, legL: 0.05, legR: 0.02, kneeL: 0.04, kneeR: 0.04, y: 0 },
    sit: { armL: 0.3, armR: 0.3, elbowL: 0.5, elbowR: 0.5, legL: -1.45, legR: -1.45, kneeL: 1.45, kneeR: 1.45, y: -0.42 },
    crouch: { armL: 0.6, armR: 0.6, elbowL: 0.9, elbowR: 0.9, legL: -1.9, legR: -1.9, kneeL: 2.2, kneeR: 2.2, y: -0.5 },
    point: { armL: 0.08, armR: -1.5, elbowL: 0.1, elbowR: 0.05, legL: 0.03, legR: 0.03, kneeL: 0.04, kneeR: 0.04, y: 0 },
    talk: { armL: -0.5, armR: 0.2, elbowL: 1.2, elbowR: 0.4, legL: 0.04, legR: 0.02, kneeL: 0.04, kneeR: 0.04, y: 0 }
  };

  /* ---------- 几何 ---------- */
  const FACES = [
    { i: [0, 1, 2, 3], n: [0, 0, -1] },
    { i: [4, 5, 6, 7], n: [0, 0, 1] },
    { i: [0, 3, 7, 4], n: [-1, 0, 0] },
    { i: [1, 5, 6, 2], n: [1, 0, 0] },
    { i: [0, 4, 5, 1], n: [0, -1, 0] },
    { i: [3, 2, 6, 7], n: [0, 1, 0] }
  ];

  function corners(b) {
    const hw = b.w / 2, hh = b.h / 2, hd = b.d / 2;
    const rx = b.rx || 0, ry = b.ry || 0;
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
    return [
      [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
      [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]
    ].map((p) => {
      const y1 = p[1] * cx - p[2] * sx;
      const z1 = p[1] * sx + p[2] * cx;
      return [b.x + p[0] * cy + z1 * sy, b.y + y1, b.z - p[0] * sy + z1 * cy];
    });
  }

  function rotN(n, rx, ry) {
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
    const y1 = n[1] * cx - n[2] * sx;
    const z1 = n[1] * sx + n[2] * cx;
    return [n[0] * cy + z1 * sy, y1, -n[0] * sy + z1 * cy];
  }

  function propBoxes(o, reveal) {
    const list = PROPS[o.kind] || PROPS.sofa;
    const rot = o.rot || 0;
    const c = Math.cos(rot), s = Math.sin(rot);
    const rise = 1 - (reveal == null ? 1 : reveal);
    return list.map((b) => ({
      x: o.x + b.x * c + b.z * s,
      y: b.y - rise * 0.25,
      z: o.z - b.x * s + b.z * c,
      w: b.w, h: b.h, d: b.d, rx: 0, ry: rot, tone: b.tone
    }));
  }

  function characterBoxes(o, reveal) {
    const p = POSES[o.pose] || POSES.stand;
    const rot = o.rot || 0;
    const c = Math.cos(rot), s = Math.sin(rot);
    const y0 = p.y - (1 - (reveal == null ? 1 : reveal)) * 0.35;
    const out = [];
    const at = (lx, ly, lz) => [o.x + lx * c + lz * s, ly + y0, o.z - lx * s + lz * c];
    const push = (lx, ly, lz, w, h, d, rx, tone) => {
      const q = at(lx, ly, lz);
      out.push({ x: q[0], y: q[1], z: q[2], w, h, d, rx, ry: rot, tone });
    };

    push(0, 1.16, 0, 0.42, 0.6, 0.26, 0, 1);
    push(0, 0.86, 0, 0.34, 0.16, 0.24, 0, 0.95);
    push(0, 1.5, 0, 0.16, 0.12, 0.16, 0, 0.9);

    const head = at(0, 1.65, 0);
    out.push({ x: head[0], y: head[1], z: head[2], r: 0.12, sphere: true, tone: 1.05 });

    [['L', -0.27, p.armL, p.elbowL], ['R', 0.27, p.armR, p.elbowR]].forEach((a) => {
      const sx = a[1], up = a[2], lo = a[3];
      const uy = 1.42 - 0.17 * Math.cos(up), uz = -0.17 * Math.sin(up);
      push(sx, uy, uz, 0.11, 0.34, 0.13, up, 0.93);
      const ey = 1.42 - 0.34 * Math.cos(up), ez = -0.34 * Math.sin(up);
      const fy = ey - 0.15 * Math.cos(up + lo), fz = ez - 0.15 * Math.sin(up + lo);
      push(sx, fy, fz, 0.1, 0.3, 0.11, up + lo, 0.9);
    });

    [['L', -0.1, p.legL, p.kneeL], ['R', 0.1, p.legR, p.kneeR]].forEach((a) => {
      const sx = a[1], hip = a[2], knee = a[3];
      const ty = 0.86 - 0.21 * Math.cos(hip), tz = -0.21 * Math.sin(hip);
      push(sx, ty, tz, 0.14, 0.42, 0.16, hip, 0.88);
      const ky = 0.86 - 0.42 * Math.cos(hip), kz = -0.42 * Math.sin(hip);
      const sy = ky - 0.2 * Math.cos(hip + knee), sz = kz - 0.2 * Math.sin(hip + knee);
      push(sx, sy, sz, 0.13, 0.4, 0.15, hip + knee, 0.85);
    });
    return out;
  }

  function objectBoxes(o) {
    if (o.type === 'person') return characterBoxes(o, o.reveal);
    if (o.type === 'prop') return propBoxes(o, o.reveal);
    return [];
  }

  function objBounds(o) {
    const boxes = objectBoxes(o);
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    boxes.forEach((b) => {
      if (b.sphere) {
        x0 = Math.min(x0, b.x - b.r); x1 = Math.max(x1, b.x + b.r);
        y0 = Math.min(y0, b.y - b.r); y1 = Math.max(y1, b.y + b.r);
        z0 = Math.min(z0, b.z - b.r); z1 = Math.max(z1, b.z + b.r);
        return;
      }
      corners(b).forEach((p) => {
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
        y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
        z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]);
      });
    });
    return { x0, y0, z0, x1, y1, z1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2 };
  }

  /* ---------- 投影 ---------- */
  function basis(eye, target) {
    const f = V.norm(V.sub(target, eye));
    let r = V.cross(f, [0, 1, 0]);
    if (V.len(r) < 1e-4) r = [1, 0, 0];
    r = V.norm(r);
    return { f, r, u: V.cross(r, f) };
  }

  function projector(eye, target, fov, w, h) {
    const b = basis(eye, target);
    const focal = (h / 2) / Math.tan((fov * Math.PI) / 360);
    const fn = (p) => {
      const v = V.sub(p, eye);
      const z = V.dot(v, b.f);
      return { x: w / 2 + (V.dot(v, b.r) / z) * focal, y: h / 2 - (V.dot(v, b.u) / z) * focal, z };
    };
    fn.focal = focal; fn.w = w; fn.h = h; fn.basis = b;
    return fn;
  }

  /* ---------- 渲染 ---------- */
  function renderScene(ctx, w, h, cam, scene, themeName, opts) {
    opts = opts || {};
    const T = THEMES[themeName] || THEMES.dark;
    const proj = projector(cam.eye, cam.target, cam.fov, w, h);
    const near = 0.16;

    const grad = ctx.createRadialGradient(w * 0.42, h * 0.24, 6, w * 0.5, h * 0.55, Math.max(w, h) * 0.9);
    grad.addColorStop(0, T.bg1);
    grad.addColorStop(1, T.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 地面
    const S = 9;
    const fp = [proj([-S, 0, -S]), proj([S, 0, -S]), proj([S, 0, S]), proj([-S, 0, S])];
    if (fp.every((p) => p.z > near)) {
      ctx.beginPath();
      ctx.moveTo(fp[0].x, fp[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(fp[i].x, fp[i].y);
      ctx.closePath();
      ctx.fillStyle = T.floor;
      ctx.fill();
    }
    ctx.lineWidth = 1;
    for (let i = -S; i <= S; i++) {
      ctx.strokeStyle = i % 5 === 0 ? T.grid2 : T.grid1;
      seg(ctx, proj, [-S, 0.002, i], [S, 0.002, i], near);
      seg(ctx, proj, [i, 0.002, -S], [i, 0.002, S], near);
    }

    // 房间
    const walls = [
      { x: 0, y: 1.35, z: -3.0, w: 7.4, h: 2.7, d: 0.14, ry: 0, tone: 1.0, room: true },
      { x: -3.7, y: 1.35, z: -0.2, w: 0.14, h: 2.7, d: 5.6, ry: 0, tone: 0.86, room: true },
      { x: 1.55, y: 1.62, z: -2.92, w: 1.9, h: 1.35, d: 0.06, ry: 0, tone: 0.9, room: true }
    ];
    drawBoxes(ctx, proj, walls, near, T);

    // 物体
    const prims = [];
    (scene.objects || []).forEach((o) => {
      if (o.visible === false) return;
      objectBoxes(o).forEach((b) => pushBox(prims, proj, b, near, T));
    });
    prims.sort((a, b) => b.z - a.z);
    prims.forEach((p) => p.draw(ctx));

    // 机位
    (scene.objects || []).filter((o) => o.type === 'camera').forEach((c) => {
      const active = c === opts.activeCam;
      if (opts.showCams === false) return;
      drawCamera(ctx, proj, c, T, active, c === opts.selectedCam);
    });

    // 选中框
    const sel = (scene.objects || []).filter((o) => o.id === opts.selected)[0];
    if (sel && sel.type !== 'camera') {
      const bb = objBounds(sel);
      drawSel(ctx, proj, bb, T, sel.pulse);
    }
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.35, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, themeName === 'light' ? 'rgba(70,58,38,0.10)' : 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    return { proj, T };
  }

  function seg(ctx, proj, a, b, near) {
    let p = proj(a), q = proj(b);
    if (p.z <= near && q.z <= near) return;
    if (p.z <= near) { const t = (near - p.z) / (q.z - p.z); p = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: near }; }
    else if (q.z <= near) { const t = (near - q.z) / (p.z - q.z); q = { x: q.x + (p.x - q.x) * t, y: q.y + (p.y - q.y) * t, z: near }; }
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }

  function pushBox(prims, proj, b, near, T) {
    if (b.sphere) {
      const p = proj([b.x, b.y, b.z]);
      if (p.z <= near) return;
      const r = (b.r / p.z) * proj.focal;
      const col = T.model.map((c) => Math.min(255, c * (b.tone || 1)));
      prims.push({
        z: p.z,
        draw: (ctx) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
          ctx.fill();
          ctx.strokeStyle = T.edge;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
      return;
    }
    const c8 = corners(b);
    const sc = c8.map(proj);
    if (sc.every((p) => p.z <= near)) return;
    const base = (b.room ? T.room : T.model).map((c) => c * (b.tone || 1));
    FACES.forEach((f) => {
      const idx = f.i;
      if (idx.some((i) => sc[i].z <= near)) return;
      const n = rotN(f.n, b.rx || 0, b.ry || 0);
      const k = 0.72 + 0.28 * Math.max(0, V.dot(n, LIGHT));
      const fill = `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
      const z = (sc[idx[0]].z + sc[idx[1]].z + sc[idx[2]].z + sc[idx[3]].z) / 4;
      prims.push({
        z,
        draw: (ctx) => {
          ctx.beginPath();
          ctx.moveTo(sc[idx[0]].x, sc[idx[0]].y);
          for (let i = 1; i < 4; i++) ctx.lineTo(sc[idx[i]].x, sc[idx[i]].y);
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = T.edge;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    });
  }

  function drawBoxes(ctx, proj, boxes, near, T) {
    const prims = [];
    boxes.forEach((b) => pushBox(prims, proj, b, near, T));
    prims.sort((a, b) => b.z - a.z);
    prims.forEach((p) => p.draw(ctx));
  }

  function drawCamera(ctx, proj, c, T, active, selected) {
    const near = 0.16, d = active ? 2.1 : 1.5, aspect = 16 / 9;
    const bb = basis(c.eye, c.target);
    const hh = Math.tan((c.fov * Math.PI) / 360) * d;
    const hw = hh * aspect;
    const center = V.add(V.mul(bb.f, d), c.eye);
    const pts = [
      V.add(center, V.add(V.mul(bb.r, -hw), V.mul(bb.u, hh))),
      V.add(center, V.add(V.mul(bb.r, hw), V.mul(bb.u, hh))),
      V.add(center, V.add(V.mul(bb.r, hw), V.mul(bb.u, -hh))),
      V.add(center, V.add(V.mul(bb.r, -hw), V.mul(bb.u, -hh)))
    ].map(proj);
    if (pts.some((p) => p.z < near)) return;
    ctx.strokeStyle = active ? T.accent : T.dim;
    ctx.fillStyle = active ? T.accentFill : 'rgba(160,175,195,0.03)';
    ctx.lineWidth = active ? 1.4 : 1;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const eye = proj(c.eye);
    ctx.beginPath();
    pts.forEach((p) => { ctx.moveTo(eye.x, eye.y); ctx.lineTo(p.x, p.y); });
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, selected ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = active ? T.accent : T.label;
    ctx.fill();
    if (selected) {
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, 12, 0, Math.PI * 2);
      ctx.strokeStyle = T.accent;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawSel(ctx, proj, bb, T, pulse) {
    const near = 0.16;
    const c = [
      [bb.x0, bb.y0, bb.z0], [bb.x1, bb.y0, bb.z0], [bb.x1, bb.y1, bb.z0], [bb.x0, bb.y1, bb.z0],
      [bb.x0, bb.y0, bb.z1], [bb.x1, bb.y0, bb.z1], [bb.x1, bb.y1, bb.z1], [bb.x0, bb.y1, bb.z1]
    ].map(proj);
    if (c.some((p) => p.z <= near)) return;
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    ctx.strokeStyle = T.accent;
    ctx.globalAlpha = pulse != null ? 0.35 + pulse * 0.65 : 1;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    edges.forEach((e) => {
      ctx.beginPath();
      ctx.moveTo(c[e[0]].x, c[e[0]].y);
      ctx.lineTo(c[e[1]].x, c[e[1]].y);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = T.accent;
    c.forEach((p) => ctx.fillRect(p.x - 2, p.y - 2, 4, 4));
  }

  /* ---------- 引擎 ---------- */
  function Engine(canvas, scene, opts) {
    this.canvas = canvas;
    canvas.getContext('2d', { alpha: false });
    this.scene = scene;
    this.theme = (opts && opts.theme) || 'dark';
    this.mode = 'director';
    this.sel = null;
    this.activeCam = null;
    this.orbit = { yaw: 0.7, pitch: 0.44, dist: 11.8, target: [0.1, 1.15, -0.9] };
    this.topZoom = 13;
    this.drag = null;
    this.onSelect = null;
    this.onChange = null;
    this._bind();
    this.resize();
    const self = this;
    if (global.ResizeObserver) {
      this.ro = new ResizeObserver(() => self.resize());
      this.ro.observe(canvas.parentNode || canvas);
    }
  }

  Engine.prototype.resize = function () {
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.w = w; this.h = h; this.dpr = dpr;
    this.render();
  };

  Engine.prototype.cameraOf = function () {
    if (this.mode === 'camera' && this.activeCam) {
      return { eye: this.activeCam.eye, target: this.activeCam.target, fov: this.activeCam.fov };
    }
    if (this.mode === 'top') {
      const t = this.orbit.target;
      return { eye: [t[0], this.topZoom, t[2] + 0.001], target: [t[0], 0, t[2]], fov: 38 };
    }
    const o = this.orbit;
    const cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
    return {
      eye: [o.target[0] + o.dist * cp * Math.sin(o.yaw), o.target[1] + o.dist * sp, o.target[2] + o.dist * cp * Math.cos(o.yaw)],
      target: o.target.slice(), fov: 38
    };
  };

  Engine.prototype.render = function () {
    if (!this.w || !this.h) return;
    try { this._render(); } catch (err) { console.error('render', err); }
  };

  Engine.prototype._render = function () {
    const ctx = this.canvas.getContext('2d');
    const dpr = this.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cam = this.cameraOf();
    this.last = cam;
    renderScene(ctx, this.w, this.h, cam, this.scene, this.theme, {
      activeCam: this.activeCam, selected: this.sel, showCams: this.mode !== 'camera'
    });
  };

  Engine.prototype.pick = function (sx, sy) {
    if (this.mode === 'camera') return null;
    const cam = this.cameraOf();
    const proj = projector(cam.eye, cam.target, cam.fov, this.w, this.h);
    let best = null, bestD = Infinity;
    this.scene.objects.forEach((o) => {
      if (o.visible === false) return;
      if (o.type === 'camera') {
        const p = proj(o.eye);
        if (p.z <= 0.1) return;
        const d = Math.hypot(p.x - sx, p.y - sy);
        if (d < 20 && d < bestD) { best = o; bestD = d; }
        return;
      }
      const bb = objBounds(o);
      const p = proj([bb.cx, bb.cy, bb.cz]);
      if (p.z <= 0.1) return;
      const rad = Math.max(0.4, Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0, bb.z1 - bb.z0) / 2);
      const sr = (rad / p.z) * proj.focal;
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < Math.max(24, sr * 1.05) && d < bestD) { best = o; bestD = d; }
    });
    return best;
  };

  Engine.prototype.groundAt = function (sx, sy, height) {
    const cam = this.cameraOf();
    const b = basis(cam.eye, cam.target);
    const focal = (this.h / 2) / Math.tan((cam.fov * Math.PI) / 360);
    const dir = V.norm(V.add(b.f, V.add(V.mul(b.r, (sx - this.w / 2) / focal), V.mul(b.u, -(sy - this.h / 2) / focal))));
    if (Math.abs(dir[1]) < 1e-4) return null;
    const t = ((height || 0) - cam.eye[1]) / dir[1];
    if (t < 0) return null;
    return [cam.eye[0] + dir[0] * t, cam.eye[2] + dir[2] * t];
  };

  Engine.prototype.select = function (id) {
    this.sel = id;
    const o = this.scene.objects.filter((x) => x.id === id)[0];
    if (o && o.type === 'camera') this.activeCam = o;
    this.render();
    if (this.onSelect) this.onSelect(o || null);
  };

  Engine.prototype.emit = function () { if (this.onChange) this.onChange(); };

  Engine.prototype._bind = function () {
    const c = this.canvas;
    const self = this;

    c.addEventListener('pointerdown', (e) => {
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const hit = self.pick(sx, sy);
      c.setPointerCapture(e.pointerId);
      if (hit) {
        self.select(hit.id);
        const p = self.groundAt(sx, sy, 0);
        self.drag = { kind: 'obj', id: hit.id, last: p };
        c.style.cursor = 'grabbing';
      } else {
        self.drag = { kind: 'orbit', x: e.clientX, y: e.clientY, lastPt: self.groundAt(sx, sy, 0) };
        c.style.cursor = 'grabbing';
      }
    });

    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (!self.drag) {
        c.style.cursor = self.mode !== 'camera' && self.pick(sx, sy) ? 'grab' : 'default';
        return;
      }
      if (self.drag.kind === 'orbit') {
        if (self.mode === 'director') {
          self.orbit.yaw -= (e.clientX - self.drag.x) * 0.006;
          self.orbit.pitch = Math.max(0.08, Math.min(1.2, self.orbit.pitch + (e.clientY - self.drag.y) * 0.004));
          self.drag.x = e.clientX; self.drag.y = e.clientY;
        } else if (self.mode === 'top') {
          const p = self.groundAt(sx, sy, 0);
          if (p && self.drag.lastPt) {
            self.orbit.target[0] += self.drag.lastPt[0] - p[0];
            self.orbit.target[2] += self.drag.lastPt[1] - p[1];
          }
          self.drag.lastPt = p;
        } else if (self.activeCam) {
          const dx = (e.clientX - self.drag.x) * 0.004;
          const b = basis(self.activeCam.eye, self.activeCam.target);
          const d = V.len(V.sub(self.activeCam.target, self.activeCam.eye));
          const nr = V.norm(V.add(V.mul(b.r, Math.cos(dx)), V.mul(b.f, Math.sin(dx))));
          self.activeCam.target = V.add(self.activeCam.eye, V.mul(nr, d));
          self.drag.x = e.clientX;
        }
        self.render();
        return;
      }
      const o = self.scene.objects.filter((x) => x.id === self.drag.id)[0];
      if (!o) return;
      const p = self.groundAt(sx, sy, 0);
      if (!p || !self.drag.last) return;
      const dx = p[0] - self.drag.last[0];
      const dz = p[1] - self.drag.last[1];
      if (o.type === 'camera') {
        o.eye = [o.eye[0] + dx, o.eye[1], o.eye[2] + dz];
        o.target = [o.target[0] + dx, o.target[1], o.target[2] + dz];
      } else {
        o.x = Math.round((o.x + dx) * 20) / 20;
        o.z = Math.round((o.z + dz) * 20) / 20;
      }
      self.drag.last = p;
      self.render();
      self.emit();
    });

    const stop = (e) => {
      if (self.drag) { self.drag = null; c.style.cursor = 'default'; self.emit(); }
      if (e && e.pointerId != null && c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
    };
    c.addEventListener('pointerup', stop);
    c.addEventListener('pointercancel', stop);

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (self.mode === 'top') self.topZoom = Math.max(5, Math.min(30, self.topZoom + e.deltaY * 0.01));
      else if (self.mode === 'director') self.orbit.dist = Math.max(3.2, Math.min(16, self.orbit.dist + e.deltaY * 0.006));
      else if (self.activeCam) { self.activeCam.fov = Math.max(18, Math.min(110, self.activeCam.fov + e.deltaY * 0.02)); self.emit(); }
      self.render();
    }, { passive: false });
  };

  Engine.prototype.thumb = function (canvas, cam) {
    const r = canvas.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (w < 2 || h < 2) return false;
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderScene(ctx, w, h, cam, this.scene, this.theme, { showCams: false });
    return true;
  };

  global.PrevizEngine = {
    create: (canvas, scene, opts) => new Engine(canvas, scene, opts),
    renderScene,
    projector,
    POSES,
    POSE_NAMES,
    PROPS
  };
})(window);











