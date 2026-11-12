/* 预演台 · AI 导演（网页演示） */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scene = { objects: [], shots: [] };
  let seq = 0;
  const uid = (p) => p + '_' + (++seq);

  const state = {
    busy: false,
    playing: false,
    selected: null,
    idle: true,
    recorded: false
  };

  let engine;
  let animRaf = 0;
  let idleRaf = 0;

  /* ---------------- 基础 ---------------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));

  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-on'), 2000);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function tc(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const f = Math.floor((sec % 1) * 25);
    return pad(m) + ':' + pad(s) + ':' + pad(f);
  }

  /* ---------------- 场景对象 ---------------- */
  let objSeq = 0;

  function prop(kind, name, x, z, rot) {
    return { id: uid('f'), type: 'prop', kind, name, x, z, rot: rot || 0, visible: true, reveal: 0, pulse: 0 };
  }

  function person(name, x, z, rot, pose) {
    return { id: uid('p'), type: 'person', name, x, z, rot, pose: pose || 'stand', visible: true, reveal: 0, pulse: 0 };
  }

  function camera(name, eye, target, fov) {
    return { id: uid('c'), type: 'camera', name, eye, target, fov, move: null, pulse: 0 };
  }

  function addObject(o) {
    o.reveal = 0;
    o.pulse = 1;
    scene.objects.push(o);
    startAnim();
    updateHud();
    renderOutline();
    if (!engine.activeCam && o.type === 'camera') engine.activeCam = o;
    return o;
  }

  function removeObject(id) {
    scene.objects = scene.objects.filter((o) => o.id !== id);
    scene.shots = scene.shots.filter((s) => s.cam !== id);
    if (state.selected === id) engine.select(null);
    engine.render();
    renderOutline();
    renderStrip();
    updateHud();
  }

  function byId(id) { return scene.objects.filter((o) => o.id === id)[0]; }
  function cams() { return scene.objects.filter((o) => o.type === 'camera'); }

  function startAnim() {
    if (animRaf) return;
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      let active = false;
      scene.objects.forEach((o) => {
        if (o.reveal != null && o.reveal < 1) { o.reveal = Math.min(1, o.reveal + dt * 3.4); active = true; }
        if (o.pulse > 0) { o.pulse = Math.max(0, o.pulse - dt * 0.75); active = true; }
      });
      engine.render();
      animRaf = active ? requestAnimationFrame(loop) : 0;
    };
    animRaf = requestAnimationFrame(loop);
  }

  function updateHud() {
    const n = scene.objects.length;
    $('[data-objects]').textContent = n + ' 个对象';
    const v = $('[data-view]');
    if (engine.mode === 'camera' && engine.activeCam) {
      v.textContent = engine.activeCam.name + ' · ' + Math.round(engine.activeCam.fov) + '°';
      v.classList.add('is-cam');
    } else if (engine.mode === 'top') {
      v.textContent = '俯视图';
      v.classList.remove('is-cam');
    } else {
      v.textContent = '自由视角';
      v.classList.remove('is-cam');
    }
    const rec = $('[data-record]');
    if (rec) rec.textContent = '＋ 记录 ' + (engine.activeCam ? engine.activeCam.name : '当前机位');
  }

  /* ---------------- 对话 ---------------- */
  const messagesEl = $('#messages');

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMsg(role, html, actions) {
    const el = document.createElement('div');
    el.className = 'msg msg--' + (role === 'me' ? 'me' : 'ai');
    if (role === 'ai') {
      const head = document.createElement('div');
      head.className = 'msg__head';
      head.innerHTML = '<span class="msg__ai">AI</span>导演';
      el.appendChild(head);
    }
    const b = document.createElement('div');
    b.className = 'bubble';
    b.innerHTML = html;
    el.appendChild(b);
    if (actions && actions.length) {
      const a = document.createElement('div');
      a.className = 'actions';
      a.innerHTML = actions.map((x) => '<span>' + x + '</span>').join('');
      el.appendChild(a);
    }
    messagesEl.appendChild(el);
    if (window.gsap && !reduce) {
      window.gsap.from(el, { opacity: 0, y: 10, duration: 0.32, ease: 'power2.out' });
    }
    scrollBottom();
    return el;
  }

  function status(el, text) {
    let s = el.querySelector('.status');
    if (!s) {
      s = document.createElement('div');
      s.className = 'status';
      s.innerHTML = '<i></i><span></span>';
      el.appendChild(s);
    }
    s.querySelector('span').textContent = text;
    scrollBottom();
  }

  function clearStatus(el) {
    const s = el.querySelector('.status');
    if (s) s.remove();
  }

  async function typing() {
    const el = document.createElement('div');
    el.className = 'msg msg--ai is-typing';
    el.innerHTML = '<div class="msg__head"><span class="msg__ai">AI</span>导演</div>' +
      '<div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>';
    messagesEl.appendChild(el);
    scrollBottom();
    await sleep(420);
    el.remove();
  }

  async function say(html, actions) {
    await typing();
    return addMsg('ai', html, actions);
  }

  /* ---------------- AI 导演 ---------------- */
  function hasKind(kind) {
    return scene.objects.some((o) => o.kind === kind);
  }

  async function buildRoom() {
    const m1 = await say('先摆一个客厅：双人沙发、茶几、单人椅、落地灯和边柜。人都站在茶几前。', ['＋5 道具']);

    const items = [
      ['sofa', '沙发', -0.55, -2.2, 0],
      ['table', '茶几', 0.45, -0.75, 0],
      ['chair', '单人椅', 2.35, -1.5, -0.5],
      ['lamp', '落地灯', -3.05, -2.45, 0],
      ['sideboard', '边柜', -2.55, -2.86, 0]
    ];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      addObject(prop(it[0], it[1], it[2], it[3], it[4]));
      status(m1, '正在摆家具 ' + (i + 1) + '/' + items.length + ' · ' + it[1]);
      await sleep(260);
    }
    clearStatus(m1);

    await sleep(200);
    const m2 = await say('两个人：A 站在茶几前，B 在左边侧身，面向 A。', ['＋2 人物']);
    addObject(person('人物 A', 0.25, 1.05, Math.PI, 'stand'));
    status(m2, '正在摆人物 1/2 · A');
    await sleep(300);
    addObject(person('人物 B', -2.15, 0.55, 1.36, 'talk'));
    status(m2, '正在摆人物 2/2 · B');
    await sleep(320);
    clearStatus(m2);

    await sleep(200);
    const m3 = await say('三台机位：01 全景在右后方，02 双人正对二位，03 近景贴 A 的侧脸。', ['＋3 机位']);
    const cs = [
      camera('机位 01', [4.5, 2.2, 4.15], [-0.45, 1.12, -0.85], 44),
      camera('机位 02', [-1.9, 1.5, 5.3], [-0.95, 1.15, 0.75], 38),
      camera('机位 03', [1.95, 1.62, 2.95], [0.18, 1.38, 1.0], 34)
    ];
    for (let i = 0; i < cs.length; i++) {
      addObject(cs[i]);
      status(m3, '正在架机位 ' + (i + 1) + '/3 · ' + cs[i].name);
      await sleep(300);
    }
    clearStatus(m3);

    await sleep(320);
    await lookThrough(cs[1], 1700);
    await say('先看一眼 02 的构图：这就是它最终会拍到的画面。要的话，我把三台机位各记一张分镜。',
      ['记成镜头', '在 B 周围加一圈机位', '让两个人坐下']);
    setChips(['记成镜头，播一遍', '在 B 周围加一圈机位', '让两个人坐下', '加一台正面特写']);
  }

  async function lookThrough(cam, ms) {
    engine.mode = 'camera';
    engine.activeCam = cam;
    engine.render();
    updateHud();
    await sleep(ms);
    engine.mode = 'director';
    engine.render();
    updateHud();
  }

  async function buildRoomLight() {
    const m = await say('只搭房间：双人沙发、茶几、单人椅、落地灯和边柜。人和机位先不加。', ['＋5 道具']);
    const items = [
      ['sofa', '沙发', -0.55, -2.2, 0],
      ['table', '茶几', 0.45, -0.75, 0],
      ['chair', '单人椅', 2.35, -1.5, -0.5],
      ['lamp', '落地灯', -3.05, -2.45, 0],
      ['sideboard', '边柜', -2.55, -2.86, 0]
    ];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      addObject(prop(it[0], it[1], it[2], it[3], it[4]));
      status(m, '正在摆家具 ' + (i + 1) + '/' + items.length + ' · ' + it[1]);
      await sleep(260);
    }
    clearStatus(m);
    await sleep(220);
    return say('房间好了。要人的话说「加两个人」，要机位说「加一台机位」。', ['加两个人', '加一台机位']);
  }

  async function ringCameras() {
    const b = scene.objects.filter((o) => o.type === 'person')[1];
    const target = b ? [b.x, 1.25, b.z] : [-1.2, 1.25, 0.4];
    const m = await say('在 B 周围加四台：左前、右前、正后和一台俯拍，都朝向 B 的头部。', ['＋4 机位']);
    const defs = [
      [2.2, 0.55], [2.6, -0.55], [2.8, Math.PI], [3.0, 0.4, 2.4]
    ];
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      const a = d[1];
      const eye = d[2]
        ? [target[0] + Math.cos(a) * 0.4, d[2], target[2] + 0.6]
        : [target[0] + Math.sin(a) * d[0], 1.5, target[2] + Math.cos(a) * d[0]];
      addObject(camera('机位 0' + (4 + i), eye, target, 34 + i * 3));
      status(m, '正在加机位 ' + (i + 1) + '/4');
      await sleep(300);
    }
    clearStatus(m);
    await sleep(200);
    await say('现在 B 有四个角度可用。要不要把这些也记进镜头轨？', ['全部记成镜头']);
    setChips(['全部记成镜头', '让两个人坐下', '看 03 的构图']);
  }

  async function sitDown() {
    const people = scene.objects.filter((o) => o.type === 'person');
    if (!people.length) return say('场景里还没有人。先说「客厅，两个人」。');
    const m = await say('让两个人坐下来聊。坐姿会自动把身体沉下去，脚落在地面。', ['改 2 个姿势']);
    people.forEach((p, i) => {
      setTimeout(() => {
        p.pose = 'sit';
        p.pulse = 1;
        engine.render();
      }, i * 220);
    });
    await sleep(700);
    const a = people[0], b = people[1];
    const sofa = scene.objects.filter((o) => o.kind === 'sofa')[0];
    const chair = scene.objects.filter((o) => o.kind === 'chair')[0];
    if (a) {
      a.x = sofa ? sofa.x + 0.15 : 0.35;
      a.z = sofa ? sofa.z + 0.02 : -1.35;
      a.rot = 0;
    }
    if (b) {
      b.x = chair ? chair.x - 0.05 : 1.35;
      b.z = chair ? chair.z - 0.05 : -0.55;
      b.rot = chair ? chair.rot : -0.5;
    }
    engine.render();
    clearStatus(m);
    return say('他们现在坐在沙发和单人椅上。想换个关系就直说，比如「让 A 站起来走到窗边」。');
  }

  async function addCameraShot() {
    const people = scene.objects.filter((o) => o.type === 'person');
    if (!people.length) return say('还没有人可拍。先说「搭一个客厅，两个人」，或者「加两个人」。', ['搭一个客厅，两个人，三个机位']);
    const a = people[0];
    const m = await say('加一台正面特写，贴着 A 的眼睛高度，视野收到 26°。', ['＋1 机位']);
    const cam = camera('机位 0' + (cams().length + 1), [a.x + 0.55, 1.6, a.z - 2.4], [a.x, 1.5, a.z], 28);
    addObject(cam);
    status(m, '正在架机位');
    await sleep(420);
    clearStatus(m);
    await lookThrough(cam, 1600);
    return say('这台只拍脸。记下来就是一条近景分镜。', ['记成镜头']);
  }

  function recordAll(names) {
    const list = names ? cams().filter((c) => names.indexOf(c.name) >= 0) : cams();
    if (!list.length) return;
    const startCount = scene.shots.length;
    list.forEach((c, i) => {
      setTimeout(() => {
        scene.shots.push({
          id: uid('s'),
          name: c.name.replace('机位 ', '镜头 ') + ' · ' + (c.fov <= 32 ? '近景' : c.fov <= 42 ? '中景' : '全景'),
          cam: c.id,
          dur: [2.4, 2.0, 1.8, 1.6][i % 4]
        });
        renderStrip();
      }, i * 160);
    });
    state.recorded = true;
    setTimeout(() => {
      toast('已记 ' + list.length + ' 个镜头');
      renderStrip();
    }, list.length * 160 + 120);
    void startCount;
  }

  async function recordFlow() {
    if (!cams().length) return say('先架机位，再记镜头。');
    const m = await say('把现有 ' + cams().length + ' 台机位各记一张，按顺序排进镜头轨。', ['记录 ' + cams().length + ' 镜']);
    recordAll();
    await sleep(cams().length * 160 + 300);
    clearStatus(m);
    await say('镜头轨在下面。点播放，机位按时间硬切，走位和运镜跟着全局时间走。', ['播一遍']);
  }

  async function resetScene() {
    scene.objects.slice().forEach((o, i) => setTimeout(() => removeObject(o.id), i * 40));
    scene.shots = [];
    setTimeout(() => { renderStrip(); renderOutline(); updateHud(); }, scene.objects.length * 40 + 200);
    return say('清空了。重新说一个场景就行。');
  }

  /* ---------------- 解析 ---------------- */
  async function handle(text) {
    const t = text.replace(/\s+/g, '');
    addMsg('me', text);

    if (/清空|重来|重置/.test(t)) return resetScene();
    if (/空房间|只搭/.test(t)) {
      if (hasKind('sofa')) return say('房间已经有了。', ['加两个人', '加一台机位']);
      return buildRoomLight();
    }
    if (/客厅|房间|室内|屋子/.test(t)) {
      if (hasKind('sofa')) return say('客厅已经在了。想换布局就说「把沙发挪到窗边」。', ['让两个人坐下', '在 B 周围加一圈机位']);
      return buildRoom();
    }
    if (/一圈|环绕|围绕/.test(t)) return ringCameras();
    if (/坐/.test(t)) return sitDown();
    if (/特写/.test(t)) return addCameraShot();
    if (/记成|记录|分镜/.test(t)) {
      if (state.recorded && scene.shots.length) return say('镜头轨里已经有 ' + scene.shots.length + ' 个镜头了。要重排就点下面的卡片。');
      await recordFlow();
      if (/播/.test(t)) { await sleep(700); play(); }
      return;
    }
    if (/播放|播一遍|播一下/.test(t)) {
      if (!scene.shots.length) return say('还没有镜头。先让我「记成镜头」。');
      play();
      return say('走一遍。');
    }
    if (/加.*人|人物|两个人|三个人/.test(t)) {
      const n = (/三/.test(t) ? 3 : /两/.test(t) ? 2 : 1);
      const m = await say('加 ' + n + ' 个人物。', ['＋' + n + ' 人物']);
      for (let i = 0; i < n; i++) {
        const x = -1.5 + i * 1.4;
        addObject(person('人物 ' + String.fromCharCode(65 + scene.objects.filter((o) => o.type === 'person').length), x, 1.4 - i * 0.6, Math.PI, 'stand'));
        status(m, '正在摆人物 ' + (i + 1) + '/' + n);
        await sleep(280);
      }
      clearStatus(m);
      return say('人摆好了。要机位还是先记镜头？', ['加一台机位', '记成镜头']);
    }
    if (/机位|镜头/.test(t) && !/记/.test(t)) {
      return addCameraShot();
    }
    if (/看|构图/.test(t)) {
      const c = cams()[Math.min(2, cams().length - 1)];
      if (!c) return say('还没有机位。说「加一台机位」我就架一台。');
      await lookThrough(c, 1800);
      return say('这是 ' + c.name + ' 的画面。');
    }
    return say('这个演示认这些说法：<b>搭一个客厅</b>、<b>两个人</b>、<b>加机位</b>、<b>在 B 周围加一圈机位</b>、<b>坐下</b>、<b>特写</b>、<b>记成镜头</b>、<b>播放</b>、<b>清空</b>。', ['搭一个客厅，两个人，三个机位']);
  }

  /* ---------------- 发送 ---------------- */
  async function send(text) {
    if (state.busy) return;
    const value = (text || '').trim();
    if (!value) return;
    state.busy = true;
    setBusy(true);
    if (state.idle) {
      state.idle = false;
      $('#intro').classList.add('is-out');
      $('#scrim').classList.add('is-out');
      $('#prompt').value = '';
    }
    try {
      await handle(value);
    } catch (err) {
      console.error(err);
      addMsg('ai', '刚才那步没走完，再说一次试试。');
    } finally {
      state.busy = false;
      setBusy(false);
    }
  }

  function setBusy(busy) {
    $('#prompt').disabled = busy;
    $('.send').disabled = busy;
    $$('#chips .chip').forEach((c) => { c.disabled = busy; });
  }

  /* ---------------- 快捷建议 ---------------- */
  const CHIPS_INIT = ['搭一个客厅，两个人，三个机位', '只搭一个房间', '在 B 周围加一圈机位'];

  function setChips(list) {
    const box = $('#chips');
    box.innerHTML = '';
    list.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = t;
      b.addEventListener('click', () => send(t));
      box.appendChild(b);
    });
  }

  /* ---------------- 镜头轨 ---------------- */
  function renderStrip() {
    const strip = $('#strip');
    const shotsEl = $('#shots');
    strip.hidden = scene.shots.length === 0;
    shotsEl.innerHTML = '';
    let total = 0;
    scene.shots.forEach((s, i) => {
      total += s.dur;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'shot';
      el.dataset.i = i;
      el.innerHTML = '<span class="shot__num">' + pad(i + 1) + '</span>' +
        '<canvas width="300" height="160"></canvas>' +
        '<span class="shot__bar"><i></i></span>' +
        '<span class="shot__meta"><b>' + s.name + '</b><span>' + s.dur.toFixed(1) + 's</span></span>';
      el.addEventListener('click', () => {
        const cam = byId(s.cam);
        if (!cam) return;
        engine.mode = 'camera';
        engine.activeCam = cam;
        engine.render();
        updateHud();
        $$('.shot').forEach((x) => x.classList.remove('is-on'));
        el.classList.add('is-on');
      });
      shotsEl.appendChild(el);
    });
    $('[data-total]').textContent = '总长 ' + tc(total);
    requestAnimationFrame(renderThumbs);
  }

  function renderThumbs() {
    $$('#shots .shot').forEach((el) => {
      const s = scene.shots[+el.dataset.i];
      const cam = s && byId(s.cam);
      const cv = el.querySelector('canvas');
      if (cam && cv) engine.thumb(cv, cam);
    });
  }

  let playRaf = 0;

  function play() {
    if (state.playing) return stopPlay();
    if (!scene.shots.length) { toast('还没有镜头'); return; }
    state.playing = true;
    $('[data-play]').textContent = '■ 停止';
    engine.mode = 'camera';
    let t0 = performance.now();
    let current = -1;
    const total = scene.shots.reduce((a, s) => a + s.dur, 0);

    const loop = (t) => {
      const el = (t - t0) / 1000;
      if (el >= total) { stopPlay(); return; }
      let acc = 0, idx = 0;
      for (let i = 0; i < scene.shots.length; i++) {
        if (el < acc + scene.shots[i].dur) { idx = i; break; }
        acc += scene.shots[i].dur;
        idx = i;
      }
      const s = scene.shots[idx];
      const cam = byId(s.cam);
      if (cam && idx !== current) {
        current = idx;
        engine.activeCam = cam;
        $$('.shot').forEach((x, i) => {
          x.classList.toggle('is-on', i === idx);
          x.classList.toggle('is-playing', i === idx);
        });
        updateHud();
      }
      const local = (el - acc) / s.dur;
      const on = $('#shots .shot.is-playing .shot__bar i');
      if (on) on.style.width = Math.min(100, local * 100) + '%';
      $('#strip .strip__time').textContent = tc(el) + ' / ' + tc(total);
      engine.render();
      playRaf = requestAnimationFrame(loop);
    };
    playRaf = requestAnimationFrame(loop);
  }

  function stopPlay() {
    state.playing = false;
    if (playRaf) cancelAnimationFrame(playRaf);
    playRaf = 0;
    $('[data-play]').textContent = '▶ 播放';
    engine.mode = 'director';
    engine.render();
    updateHud();
    $$('.shot').forEach((x) => x.classList.remove('is-playing'));
    const total = scene.shots.reduce((a, s) => a + s.dur, 0);
    $('#strip .strip__time').textContent = '总长 ' + tc(total);
  }

  /* ---------------- 导出 ---------------- */
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
  }

  function exportBoard() {
    if (!scene.shots.length) { toast('还没有镜头可以导出'); return; }
    const rows = scene.shots.map((s, i) => {
      const cam = byId(s.cam);
      if (!cam) return '';
      const c = document.createElement('canvas');
      c.width = 640; c.height = 360;
      const ctx = c.getContext('2d');
      const T = { eye: cam.eye, target: cam.target, fov: cam.fov };
      // 直接复用引擎渲染
      const tmp = document.createElement('canvas');
      tmp.width = 640; tmp.height = 360;
      engine.thumb(tmp, T);
      ctx.drawImage(tmp, 0, 0);
      return '<figure><img src="' + tmp.toDataURL('image/jpeg', 0.86) + '" alt=""><figcaption>' +
        '<b>' + (i + 1) + '</b><span>' + s.name + '</span><em>' + s.dur.toFixed(1) + 's</em></figcaption></figure>';
    }).join('');
    const total = scene.shots.reduce((a, s) => a + s.dur, 0);
    const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>预演台 · 分镜表</title>' +
      '<style>body{margin:0;padding:40px;background:#f3f1ea;color:#15181d;font:14px/1.7 "Noto Sans SC","Microsoft YaHei",sans-serif}' +
      'h1{font-size:22px;font-weight:600;margin:0 0 4px}p.meta{margin:0 0 28px;color:#6b7280;font-size:12px}' +
      '.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}figure{margin:0;background:#fff;border:1px solid #ddd8cc;border-radius:6px;overflow:hidden}' +
      'img{display:block;width:100%;height:auto}figcaption{display:flex;gap:10px;align-items:baseline;padding:9px 12px;font-size:12px}' +
      'figcaption b{font-family:monospace;color:#a4650f}figcaption span{flex:1}figcaption em{font-style:normal;font-family:monospace;color:#6b7280}' +
      '@media print{body{padding:16px}.grid{gap:12px}}</style>' +
      '<h1>预演台 · 分镜表</h1><p class="meta">' + scene.shots.length + ' 个镜头 · 总长 ' + total.toFixed(1) + ' 秒 · 2026</p>' +
      '<div class="grid">' + rows + '</div></html>';
    download(new Blob([html], { type: 'text/html;charset=utf-8' }), '预演台-分镜表.html');
    toast('分镜表已导出');
  }

  /* ---------------- 大纲 / 属性 ---------------- */
  function renderOutline() {
    const ul = $('#outline');
    ul.innerHTML = '';
    const groups = [
      ['人物', scene.objects.filter((o) => o.type === 'person')],
      ['道具', scene.objects.filter((o) => o.type === 'prop')],
      ['机位', scene.objects.filter((o) => o.type === 'camera')]
    ];
    groups.forEach((g) => {
      if (!g[1].length) return;
      const head = document.createElement('li');
      head.className = 'outline__head';
      head.textContent = g[0];
      ul.appendChild(head);
      g[1].forEach((o) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<i>' + (o.type === 'person' ? '◉' : o.type === 'camera' ? '▷' : '▣') + '</i><span>' + o.name + '</span><em>' +
          (o.type === 'camera' ? Math.round(o.fov) + '°' : (o.x.toFixed(1) + ', ' + o.z.toFixed(1))) + '</em>';
        b.className = state.selected === o.id ? 'is-on' : '';
        b.addEventListener('click', () => engine.select(o.id));
        li.appendChild(b);
        ul.appendChild(li);
      });
    });
  }

  function syncProps(o) {
    const empty = !o;
    $('#propsEmpty').hidden = !empty;
    $('#props').hidden = empty;
    if (!o) return;
    $('#objName').value = o.name;
    const isCam = o.type === 'camera';
    $('[data-only-camera]').hidden = !isCam;
    $('[data-only-person]').hidden = o.type !== 'person';
    const xInput = $('#objX'), zInput = $('#objZ'), rot = $('#objRot');
    xInput.disabled = isCam;
    zInput.disabled = isCam;
    xInput.value = isCam ? o.eye[0].toFixed(2) : o.x.toFixed(2);
    zInput.value = isCam ? o.eye[2].toFixed(2) : o.z.toFixed(2);
    const deg = isCam
      ? Math.round((Math.atan2(o.target[0] - o.eye[0], o.target[2] - o.eye[2]) * 180) / Math.PI)
      : Math.round((o.rot * 180) / Math.PI);
    rot.value = String(deg);
    $('[data-rotval]').textContent = deg + '°';
    if (isCam) {
      $('#objFov').value = String(Math.round(o.fov));
      $('[data-fovval]').textContent = Math.round(o.fov) + '°';
    }
    $$('#poseGrid button').forEach((b) => b.classList.toggle('is-on', b.dataset.pose === o.pose));
    renderOutline();
  }

  function buildPoseGrid() {
    const grid = $('#poseGrid');
    const names = window.PrevizEngine.POSE_NAMES;
    Object.keys(names).forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = names[k];
      b.dataset.pose = k;
      b.addEventListener('click', () => {
        const o = byId(state.selected);
        if (!o || o.type !== 'person') return;
        o.pose = k;
        o.pulse = 1;
        engine.render();
        syncProps(o);
      });
      grid.appendChild(b);
    });
  }

  /* ---------------- 手动面板 ---------------- */
  let drawerOpen = false;

  function openDrawer(which) {
    const d = $('#drawer');
    d.hidden = false;
    requestAnimationFrame(() => d.classList.add('is-open'));
    document.body.classList.add('has-drawer');
    drawerOpen = true;
    renderOutline();
    $('#drawerTitle').textContent = which === 'about' ? '关于预演台' : '手动调整';
    $$('.drawer__body').forEach((b) => { b.hidden = b.dataset.drawer !== which; });
  }

  function closeDrawer() {
    const d = $('#drawer');
    d.classList.remove('is-open');
    document.body.classList.remove('has-drawer');
    drawerOpen = false;
    setTimeout(() => { d.hidden = true; }, 260);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    engine = window.PrevizEngine.create($('#scene'), scene, { theme: 'dark' });
    engine.onSelect = function (o) {
      state.selected = o ? o.id : null;
      syncProps(o);
      renderOutline();
    };
    engine.onChange = function () {
      const o = byId(state.selected);
      if (o) syncProps(o);
      else renderOutline();
    };

    buildPoseGrid();
    setChips(CHIPS_INIT);
    renderOutline();
    updateHud();

    addMsg('ai', '我是预演台的 AI 导演。说一句话，我把人、道具和机位摆进这个空房间。',
      ['搭一个客厅，两个人，三个机位', '只搭一个房间']);

    $('#composer').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#prompt').value;
      $('#prompt').value = '';
      send(v);
    });

    $$('[data-panel]').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.panel)));
    $('.drawer__close').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
      if (e.key === ' ' && !drawerOpen && document.activeElement !== $('#prompt')) {
        e.preventDefault();
        play();
      }
    });

    $$('#viewSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        $$('#viewSeg button').forEach((x) => x.classList.remove('is-on'));
        b.classList.add('is-on');
        engine.mode = b.dataset.mode;
        engine.render();
        updateHud();
      });
    });

    $('#objName').addEventListener('input', (e) => {
      const o = byId(state.selected); if (!o) return;
      o.name = e.target.value;
      renderOutline();
    });
    ['objX', 'objZ'].forEach((id) => {
      $('#' + id).addEventListener('input', (e) => {
        const o = byId(state.selected); if (!o || o.type === 'camera') return;
        const v = parseFloat(e.target.value);
        if (isNaN(v)) return;
        if (id === 'objX') o.x = v; else o.z = v;
        engine.render();
        renderOutline();
      });
    });
    $('#objRot').addEventListener('input', (e) => {
      const o = byId(state.selected); if (!o) return;
      const deg = +e.target.value;
      $('[data-rotval]').textContent = deg + '°';
      if (o.type === 'camera') {
        const d = Math.hypot(o.target[0] - o.eye[0], o.target[2] - o.eye[2]);
        const a = (deg * Math.PI) / 180;
        o.target = [o.eye[0] + Math.sin(a) * d, o.target[1], o.eye[2] + Math.cos(a) * d];
      } else {
        o.rot = (deg * Math.PI) / 180;
      }
      o.pulse = 0.6;
      engine.render();
    });
    $('#objFov').addEventListener('input', (e) => {
      const o = byId(state.selected); if (!o || o.type !== 'camera') return;
      o.fov = +e.target.value;
      $('[data-fovval]').textContent = o.fov + '°';
      engine.render();
      updateHud();
    });
    $('[data-delete]').addEventListener('click', () => {
      const o = byId(state.selected); if (!o) return;
      removeObject(o.id);
      toast('已删除');
    });

    $('[data-record]').addEventListener('click', () => {
      const cam = engine.activeCam || cams()[0];
      if (!cam) { toast('先加一台机位'); return; }
      recordAll([cam.name]);
      toast('已记录 ' + cam.name);
    });
    $('[data-export]').addEventListener('click', exportBoard);
    $('[data-play]').addEventListener('click', play);

    $('#scene').addEventListener('pointerdown', () => {
      if (state.idle && !state.busy) {
        state.idle = false;
        $('#intro').classList.add('is-out');
      $('#scrim').classList.add('is-out');
      }
    }, { once: false });


    idleOrbit();
    setTimeout(renderOutline, 200);
  }

  function idleOrbit() {
    if (reduce) return;
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!state.idle || !engine) { idleRaf = 0; return; }
      engine.orbit.yaw += dt * 0.06;
      engine.render();
      idleRaf = requestAnimationFrame(loop);
    };
    idleRaf = requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();









